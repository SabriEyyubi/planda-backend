import { Injectable } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { createHash } from 'node:crypto';
import {
  Lead,
  LeadStatus,
  MembershipRole,
  OrganizationStatus,
  OrganizationType,
  Prisma,
  ProjectStatus,
  Unit,
  UnitStatus,
} from '@prisma/client';
import { AppException } from '../../common/exceptions/app.exception';
import { MutationContext } from '../../common/types/mutation-context';
import { PrismaService } from '../../infrastructure/database/prisma.service';
import { CreateLeadDto } from './dto/create-lead.dto';
import {
  BrokerProjectResponseDto,
  BrokerMaterialMetadataDto,
  BrokerUnitResponseDto,
  LeadListResponseDto,
  LeadResponseDto,
  PaymentPlanResponseDto,
  SavedProjectResponseDto,
  UnitResponseDto,
  UnitListResponseDto,
} from './dto/marketplace-response.dto';
import { LeadQueryDto, UnitQueryDto } from './dto/operations-query.dto';
import { DeletePaymentPlanDto, UpdatePaymentPlanDto } from './dto/update-payment-plan.dto';
import { UpdateLeadDto } from './dto/update-lead.dto';
import { CreatePaymentPlanDto, CreateUnitDto, UpdateUnitDto } from './dto/upsert-inventory.dto';
import { canTransitionLead, requiresClosedReason } from './lead-policy';

interface OperationsCursor {
  updatedAt: string;
  id: string;
}

type BrokerProject = Prisma.ProjectGetPayload<{
  include: {
    developerOrganization: true;
    brokerOffer: true;
    units: { include: { brokerTerm: true } };
    _count: { select: { materials: true } };
  };
}>;

@Injectable()
export class MarketplaceService {
  private readonly currentLeadConsentVersion: string;

  constructor(
    private readonly prisma: PrismaService,
    config: ConfigService,
  ) {
    this.currentLeadConsentVersion = config.getOrThrow<string>('leadConsent.currentVersion');
  }

  async createLead(
    buyerUserId: string,
    projectId: string,
    idempotencyKey: string,
    dto: CreateLeadDto,
  ): Promise<LeadResponseDto> {
    if (!dto.consentToDeveloper)
      throw new AppException('LEAD_CONSENT_REQUIRED', 'Developer sharing consent is required', 422);
    if (dto.consentVersion.trim() !== this.currentLeadConsentVersion)
      throw new AppException(
        'LEAD_CONSENT_VERSION_MISMATCH',
        'Lead consent version is not current',
        409,
      );
    if (dto.budgetMin && dto.budgetMax && new Prisma.Decimal(dto.budgetMin).gt(dto.budgetMax))
      throw new AppException('INVALID_BUDGET_RANGE', 'Minimum budget cannot exceed maximum', 422);
    const project = await this.prisma.project.findFirst({
      where: { id: projectId, status: ProjectStatus.PUBLISHED },
      select: { id: true, name: true },
    });
    if (!project) throw new AppException('PROJECT_NOT_FOUND', 'Project not found', 404);

    const normalized = {
      fullName: dto.fullName.trim(),
      phone: dto.phone,
      email: dto.email?.trim().toLowerCase() ?? null,
      preferredLanguage: dto.preferredLanguage,
      unitPreference: dto.unitPreference?.trim() || null,
      budgetMin: dto.budgetMin ? new Prisma.Decimal(dto.budgetMin).toFixed(4) : null,
      budgetMax: dto.budgetMax ? new Prisma.Decimal(dto.budgetMax).toFixed(4) : null,
      currency: dto.currency.toUpperCase(),
      consentToDeveloper: dto.consentToDeveloper,
      consentVersion: dto.consentVersion.trim(),
      // Omit empty context from the hash to preserve retries of pre-context leads.
      ...(dto.paymentPlanId ? { paymentPlanId: dto.paymentPlanId.toLowerCase() } : {}),
      ...(dto.message?.trim() ? { message: dto.message.trim() } : {}),
    };
    const requestHash = createHash('sha256').update(JSON.stringify(normalized)).digest('hex');
    const key = { buyerUserId, projectId, idempotencyKey };
    const existing = await this.prisma.lead.findUnique({
      where: { buyerUserId_projectId_idempotencyKey: key },
      include: { project: { select: { name: true } } },
    });
    if (existing) return this.resolveIdempotentLead(existing, requestHash);

    try {
      const lead = await this.prisma.$transaction(async (tx) => {
        const plan = normalized.paymentPlanId
          ? await tx.paymentPlan.findFirst({
              where: { id: normalized.paymentPlanId, projectId },
              select: { name: true },
            })
          : null;
        if (normalized.paymentPlanId && !plan)
          throw new AppException(
            'LEAD_PAYMENT_PLAN_NOT_FOUND',
            'Payment plan does not belong to this project',
            422,
          );
        const created = await tx.lead.create({
          data: {
            projectId,
            buyerUserId,
            idempotencyKey,
            requestHash,
            fullName: normalized.fullName,
            phone: normalized.phone,
            email: normalized.email,
            preferredLanguage: normalized.preferredLanguage,
            unitPreference: normalized.unitPreference,
            paymentPlanId: normalized.paymentPlanId ?? null,
            paymentPlanName: plan?.name ?? null,
            message: normalized.message ?? null,
            budgetMin: normalized.budgetMin,
            budgetMax: normalized.budgetMax,
            currency: normalized.currency,
            consentVersion: normalized.consentVersion,
            consentedAt: new Date(),
          },
          include: { project: { select: { name: true } } },
        });
        const date = new Date();
        date.setUTCHours(0, 0, 0, 0);
        await tx.projectEngagementDaily.upsert({
          where: { projectId_date: { projectId, date } },
          create: { projectId, date, leads: 1 },
          update: { leads: { increment: 1 } },
        });
        return created;
      });
      return this.toLeadResponse(lead);
    } catch (error) {
      if (!(error instanceof Prisma.PrismaClientKnownRequestError) || error.code !== 'P2002')
        throw error;
      const concurrent = await this.prisma.lead.findUnique({
        where: { buyerUserId_projectId_idempotencyKey: key },
        include: { project: { select: { name: true } } },
      });
      if (!concurrent) throw error;
      return this.resolveIdempotentLead(concurrent, requestHash);
    }
  }

  async listSaved(userId: string): Promise<SavedProjectResponseDto[]> {
    const rows = await this.prisma.savedProject.findMany({
      where: { userId, project: { status: ProjectStatus.PUBLISHED } },
      include: { project: { include: { province: true, district: true } } },
      orderBy: { createdAt: 'desc' },
    });
    return rows.map(({ createdAt, project }) => ({
      id: project.id,
      slug: project.slug,
      name: project.name,
      province: project.province.name,
      district: project.district.name,
      startingPrice: project.startingPrice.toFixed(4),
      currency: project.currency,
      heroImageUrl: project.heroImageUrl,
      savedAt: createdAt.toISOString(),
    }));
  }

  async save(userId: string, projectId: string): Promise<void> {
    const project = await this.prisma.project.findFirst({
      where: { id: projectId, status: ProjectStatus.PUBLISHED },
      select: { id: true },
    });
    if (!project) throw new AppException('PROJECT_NOT_FOUND', 'Project not found', 404);
    await this.prisma.$transaction(async (tx) => {
      const inserted = await tx.savedProject.createMany({
        data: [{ userId, projectId }],
        skipDuplicates: true,
      });
      if (inserted.count !== 1) return;
      const date = new Date();
      date.setUTCHours(0, 0, 0, 0);
      await tx.projectEngagementDaily.upsert({
        where: { projectId_date: { projectId, date } },
        create: { projectId, date, favoriteAdds: 1 },
        update: { favoriteAdds: { increment: 1 } },
      });
    });
  }

  async unsave(userId: string, projectId: string): Promise<void> {
    await this.prisma.savedProject.deleteMany({ where: { userId, projectId } });
  }

  async listDeveloperLeads(userId: string, query: LeadQueryDto): Promise<LeadListResponseDto> {
    const cursor = query.cursor ? this.decodeOperationsCursor(query.cursor) : undefined;
    const and: Prisma.LeadWhereInput[] = [];
    if (query.q)
      and.push({
        OR: [
          { fullName: { contains: query.q, mode: 'insensitive' } },
          { phone: { contains: query.q } },
          { email: { contains: query.q, mode: 'insensitive' } },
          { project: { name: { contains: query.q, mode: 'insensitive' } } },
        ],
      });
    if (cursor) and.push(this.operationsCursorWhere(cursor));
    const leads = await this.prisma.lead.findMany({
      where: {
        project: {
          developerOrganization: this.developerOrganizationScope(userId),
          ...(query.projectId ? { id: query.projectId } : {}),
        },
        ...(query.status ? { status: query.status } : {}),
        ...(and.length ? { AND: and } : {}),
      },
      include: { project: { select: { name: true } } },
      orderBy: [{ updatedAt: 'desc' }, { id: 'desc' }],
      take: query.limit + 1,
    });
    const hasNextPage = leads.length > query.limit;
    const visible = hasNextPage ? leads.slice(0, query.limit) : leads;
    const last = visible.at(-1);
    return {
      items: visible.map((lead) => this.toLeadResponse(lead)),
      pageInfo: {
        hasNextPage,
        nextCursor: hasNextPage && last ? this.encodeOperationsCursor(last) : null,
      },
    };
  }

  async updateDeveloperLead(
    userId: string,
    leadId: string,
    dto: UpdateLeadDto,
    context: MutationContext,
  ): Promise<LeadResponseDto> {
    return this.prisma.$transaction(async (tx) => {
      const scope = this.developerOrganizationScope(userId, true);
      const lead = await tx.lead.findFirst({
        where: { id: leadId, project: { developerOrganization: scope } },
        include: { project: { select: { name: true, developerOrganizationId: true } } },
      });
      if (!lead) throw new AppException('LEAD_NOT_FOUND', 'Lead not found', 404);
      if (lead.version !== dto.expectedVersion)
        throw new AppException('LEAD_CONCURRENCY_CONFLICT', 'Lead changed before update', 409);
      if (!canTransitionLead(lead.status, dto.status))
        throw new AppException(
          'INVALID_LEAD_STATUS_TRANSITION',
          'Lead status transition is invalid',
          422,
        );
      if (requiresClosedReason(dto.status, dto.closedReason))
        throw new AppException('LEAD_CLOSED_REASON_REQUIRED', 'Closed leads require a reason', 422);
      const write = await tx.lead.updateMany({
        where: {
          id: leadId,
          version: dto.expectedVersion,
          project: { developerOrganization: scope },
        },
        data: {
          status: dto.status,
          closedReason: dto.status === LeadStatus.CLOSED ? dto.closedReason?.trim() : null,
          version: { increment: 1 },
        },
      });
      if (write.count !== 1)
        throw new AppException('LEAD_CONCURRENCY_CONFLICT', 'Lead changed before update', 409);
      const updated = await tx.lead.findFirstOrThrow({
        where: { id: leadId, project: { developerOrganization: scope } },
        include: { project: { select: { name: true } } },
      });
      await tx.auditLog.create({
        data: {
          actorUserId: userId,
          organizationId: lead.project.developerOrganizationId,
          action: 'LEAD_STATUS_UPDATED',
          entityType: 'Lead',
          entityId: leadId,
          before: { status: lead.status, version: lead.version },
          after: { status: updated.status, version: updated.version },
          ...context,
        },
      });
      return this.toLeadResponse(updated);
    });
  }

  async listUnits(
    userId: string,
    projectId: string,
    query: UnitQueryDto,
  ): Promise<UnitListResponseDto> {
    const cursor = query.cursor ? this.decodeOperationsCursor(query.cursor) : undefined;
    const and: Prisma.UnitWhereInput[] = [];
    if (query.q)
      and.push({
        OR: [
          { unitNumber: { contains: query.q, mode: 'insensitive' } },
          { block: { contains: query.q, mode: 'insensitive' } },
          { roomType: { contains: query.q, mode: 'insensitive' } },
        ],
      });
    if (cursor) and.push(this.operationsCursorWhere(cursor));
    const units = await this.prisma.unit.findMany({
      where: {
        projectId,
        project: { developerOrganization: this.developerOrganizationScope(userId) },
        ...(query.status ? { status: query.status } : {}),
        ...(and.length ? { AND: and } : {}),
      },
      orderBy: [{ updatedAt: 'desc' }, { id: 'desc' }],
      take: query.limit + 1,
    });
    const hasNextPage = units.length > query.limit;
    const visible = hasNextPage ? units.slice(0, query.limit) : units;
    const last = visible.at(-1);
    return {
      items: visible.map((unit) => this.toUnitResponse(unit)),
      pageInfo: {
        hasNextPage,
        nextCursor: hasNextPage && last ? this.encodeOperationsCursor(last) : null,
      },
    };
  }

  async createUnit(
    userId: string,
    projectId: string,
    dto: CreateUnitDto,
    context: MutationContext,
  ): Promise<UnitResponseDto> {
    let unit: Unit;
    try {
      unit = await this.prisma.$transaction(
        async (tx) => {
          const project = await tx.project.findFirst({
            where: {
              id: projectId,
              developerOrganization: this.developerOrganizationScope(userId, true),
            },
            select: { developerOrganizationId: true },
          });
          if (!project) throw new AppException('PROJECT_NOT_FOUND', 'Project not found', 404);
          const currency = await this.lockInventoryProject(tx, projectId);
          const created = await tx.unit.create({ data: { projectId, ...dto } });
          await this.refreshInventoryPrice(tx, projectId, currency);
          await tx.auditLog.create({
            data: {
              actorUserId: userId,
              organizationId: project.developerOrganizationId,
              action: 'UNIT_CREATED',
              entityType: 'Unit',
              entityId: created.id,
              after: this.unitSnapshot(created),
              ...context,
            },
          });
          return created;
        },
        { isolationLevel: Prisma.TransactionIsolationLevel.ReadCommitted },
      );
    } catch (error) {
      if (this.isUniqueConstraint(error))
        throw new AppException(
          'UNIT_NUMBER_CONFLICT',
          'Unit number already exists for this project',
          409,
        );
      throw error;
    }
    return this.toUnitResponse(unit);
  }

  async updateUnit(
    userId: string,
    projectId: string,
    unitId: string,
    dto: UpdateUnitDto,
    context: MutationContext,
  ): Promise<UnitResponseDto> {
    const { expectedVersion, ...data } = dto;
    if (Object.keys(data).length === 0)
      throw new AppException('EMPTY_UPDATE', 'At least one unit field is required', 400);
    let unit: Unit;
    try {
      unit = await this.prisma.$transaction(
        async (tx) => {
          const scope = this.developerOrganizationScope(userId, true);
          const before = await tx.unit.findFirst({
            where: { id: unitId, projectId, project: { developerOrganization: scope } },
            include: { project: { select: { developerOrganizationId: true } } },
          });
          if (!before) throw new AppException('UNIT_NOT_FOUND', 'Unit not found', 404);
          const currency = await this.lockInventoryProject(tx, projectId);
          const write = await tx.unit.updateMany({
            where: {
              id: unitId,
              projectId,
              version: expectedVersion,
              project: { developerOrganization: scope },
            },
            data: { ...data, version: { increment: 1 } },
          });
          if (write.count !== 1)
            throw new AppException('UNIT_CONCURRENCY_CONFLICT', 'Unit changed before update', 409);
          await this.refreshInventoryPrice(tx, projectId, currency);
          const updated = await tx.unit.findFirstOrThrow({
            where: { id: unitId, project: { developerOrganization: scope } },
          });
          await tx.auditLog.create({
            data: {
              actorUserId: userId,
              organizationId: before.project.developerOrganizationId,
              action: data.price ? 'UNIT_PRICE_AND_STOCK_UPDATED' : 'UNIT_STOCK_UPDATED',
              entityType: 'Unit',
              entityId: unitId,
              before: this.unitSnapshot(before),
              after: this.unitSnapshot(updated),
              ...context,
            },
          });
          return updated;
        },
        { isolationLevel: Prisma.TransactionIsolationLevel.ReadCommitted },
      );
    } catch (error) {
      if (this.isUniqueConstraint(error))
        throw new AppException(
          'UNIT_NUMBER_CONFLICT',
          'Unit number already exists for this project',
          409,
        );
      throw error;
    }
    return this.toUnitResponse(unit);
  }

  async listPaymentPlans(userId: string, projectId: string): Promise<PaymentPlanResponseDto[]> {
    const plans = await this.prisma.paymentPlan.findMany({
      where: {
        projectId,
        project: { developerOrganization: this.developerOrganizationScope(userId) },
      },
      orderBy: [{ isRecommended: 'desc' }, { termMonths: 'asc' }],
    });
    return plans.map((plan) => this.toPlanResponse(plan));
  }

  async createPaymentPlan(
    userId: string,
    projectId: string,
    dto: CreatePaymentPlanDto,
    context: MutationContext,
  ): Promise<PaymentPlanResponseDto> {
    this.validatePaymentPlan(dto.downPaymentPercent, dto.deliveryPercent ?? '0.00');
    let plan: Prisma.PaymentPlanGetPayload<object>;
    try {
      plan = await this.prisma.$transaction(async (tx) => {
        const project = await tx.project.findFirst({
          where: {
            id: projectId,
            developerOrganization: this.developerOrganizationScope(userId, true),
          },
          select: { developerOrganizationId: true },
        });
        if (!project) throw new AppException('PROJECT_NOT_FOUND', 'Project not found', 404);
        const created = await tx.paymentPlan.create({ data: { projectId, ...dto } });
        await tx.auditLog.create({
          data: {
            actorUserId: userId,
            organizationId: project.developerOrganizationId,
            action: 'PAYMENT_PLAN_CREATED',
            entityType: 'PaymentPlan',
            entityId: created.id,
            after: this.planSnapshot(created),
            ...context,
          },
        });
        return created;
      });
    } catch (error) {
      if (this.isUniqueConstraint(error))
        throw new AppException(
          'PAYMENT_PLAN_NAME_CONFLICT',
          'Payment-plan name already exists for this project',
          409,
        );
      throw error;
    }
    return this.toPlanResponse(plan);
  }

  async updatePaymentPlan(
    userId: string,
    projectId: string,
    planId: string,
    dto: UpdatePaymentPlanDto,
    context: MutationContext,
  ): Promise<PaymentPlanResponseDto> {
    const { expectedVersion, ...data } = dto;
    if (Object.keys(data).length === 0)
      throw new AppException('EMPTY_UPDATE', 'At least one payment-plan field is required', 400);
    let plan: PaymentPlanResponseDto;
    try {
      plan = await this.prisma.$transaction(async (tx) => {
        const scope = this.developerOrganizationScope(userId, true);
        const before = await tx.paymentPlan.findFirst({
          where: { id: planId, projectId, project: { developerOrganization: scope } },
          include: { project: { select: { developerOrganizationId: true } } },
        });
        if (!before)
          throw new AppException('PAYMENT_PLAN_NOT_FOUND', 'Payment plan not found', 404);
        this.validatePaymentPlan(
          data.downPaymentPercent ?? before.downPaymentPercent.toString(),
          data.deliveryPercent ?? before.deliveryPercent.toString(),
        );
        const write = await tx.paymentPlan.updateMany({
          where: {
            id: planId,
            projectId,
            version: expectedVersion,
            project: { developerOrganization: scope },
          },
          data: { ...data, version: { increment: 1 } },
        });
        if (write.count !== 1)
          throw new AppException(
            'PAYMENT_PLAN_CONCURRENCY_CONFLICT',
            'Payment plan changed before update',
            409,
          );
        const updated = await tx.paymentPlan.findFirstOrThrow({
          where: { id: planId, project: { developerOrganization: scope } },
        });
        await tx.auditLog.create({
          data: {
            actorUserId: userId,
            organizationId: before.project.developerOrganizationId,
            action: 'PAYMENT_PLAN_UPDATED',
            entityType: 'PaymentPlan',
            entityId: planId,
            before: this.planSnapshot(before),
            after: this.planSnapshot(updated),
            ...context,
          },
        });
        return this.toPlanResponse(updated);
      });
    } catch (error) {
      if (this.isUniqueConstraint(error))
        throw new AppException(
          'PAYMENT_PLAN_NAME_CONFLICT',
          'Payment-plan name already exists for this project',
          409,
        );
      throw error;
    }
    return plan;
  }

  async deletePaymentPlan(
    userId: string,
    projectId: string,
    planId: string,
    dto: DeletePaymentPlanDto,
    context: MutationContext,
  ): Promise<void> {
    await this.prisma.$transaction(async (tx) => {
      const scope = this.developerOrganizationScope(userId, true);
      const before = await tx.paymentPlan.findFirst({
        where: { id: planId, projectId, project: { developerOrganization: scope } },
        include: { project: { select: { developerOrganizationId: true } } },
      });
      if (!before) throw new AppException('PAYMENT_PLAN_NOT_FOUND', 'Payment plan not found', 404);
      const write = await tx.paymentPlan.deleteMany({
        where: {
          id: planId,
          projectId,
          version: dto.expectedVersion,
          project: { developerOrganization: scope },
        },
      });
      if (write.count !== 1)
        throw new AppException(
          'PAYMENT_PLAN_CONCURRENCY_CONFLICT',
          'Payment plan changed before delete',
          409,
        );
      await tx.auditLog.create({
        data: {
          actorUserId: userId,
          organizationId: before.project.developerOrganizationId,
          action: 'PAYMENT_PLAN_DELETED',
          entityType: 'PaymentPlan',
          entityId: planId,
          before: this.planSnapshot(before),
          ...context,
        },
      });
    });
  }

  async listBrokerProjects(): Promise<BrokerProjectResponseDto[]> {
    const projects = await this.prisma.project.findMany({
      where: { status: ProjectStatus.PUBLISHED, brokerOffer: { enabled: true } },
      include: {
        developerOrganization: true,
        brokerOffer: true,
        units: { include: { brokerTerm: true }, orderBy: { unitNumber: 'asc' } },
        _count: { select: { materials: true } },
      },
      orderBy: { updatedAt: 'desc' },
      take: 100,
    });
    return projects.map((project) => this.toBrokerProject(project));
  }

  async getBrokerProject(idOrSlug: string): Promise<BrokerProjectResponseDto> {
    const project = await this.prisma.project.findFirst({
      where: {
        status: ProjectStatus.PUBLISHED,
        brokerOffer: { enabled: true },
        ...this.projectIdentityWhere(idOrSlug),
      },
      include: {
        developerOrganization: true,
        brokerOffer: true,
        units: { include: { brokerTerm: true }, orderBy: { unitNumber: 'asc' } },
        _count: { select: { materials: true } },
      },
    });
    if (!project)
      throw new AppException('BROKER_PROJECT_NOT_FOUND', 'Broker project not found', 404);
    return this.toBrokerProject(project);
  }

  async listBrokerMaterials(idOrSlug: string): Promise<BrokerMaterialMetadataDto[]> {
    const project = await this.prisma.project.findFirst({
      where: {
        status: ProjectStatus.PUBLISHED,
        brokerOffer: { enabled: true },
        ...this.projectIdentityWhere(idOrSlug),
      },
      select: {
        materials: {
          select: {
            id: true,
            title: true,
            kind: true,
            language: true,
            versionLabel: true,
            fileSizeBytes: true,
            updatedAt: true,
          },
          orderBy: [{ updatedAt: 'desc' }, { id: 'desc' }],
        },
      },
    });
    if (!project)
      throw new AppException('BROKER_PROJECT_NOT_FOUND', 'Broker project not found', 404);
    return project.materials.map((material) => ({
      id: material.id,
      title: material.title,
      kind: material.kind,
      language: material.language,
      version: material.versionLabel,
      fileSizeBytes: material.fileSizeBytes?.toString() ?? null,
      updatedAt: material.updatedAt.toISOString(),
    }));
  }

  private async lockInventoryProject(
    tx: Prisma.TransactionClient,
    projectId: string,
  ): Promise<string> {
    // All inventory writes lock their parent first; READ COMMITTED lets the
    // following aggregate see inventory committed by the previous lock holder.
    const rows = await tx.$queryRaw<Array<{ currency: string }>>`
      SELECT currency FROM projects WHERE id = ${projectId}::uuid FOR UPDATE
    `;
    if (!rows[0]) throw new AppException('PROJECT_NOT_FOUND', 'Project not found', 404);
    return rows[0].currency;
  }

  private async refreshInventoryPrice(
    tx: Prisma.TransactionClient,
    projectId: string,
    currency: string,
  ): Promise<void> {
    const aggregate = await tx.unit.aggregate({
      where: { projectId, currency, status: UnitStatus.AVAILABLE },
      _min: { price: true },
    });
    const minimum = aggregate._min.price;
    const now = new Date();
    await tx.project.update({
      where: { id: projectId },
      data: {
        stockUpdatedAt: now,
        priceUpdatedAt: minimum === null ? null : now,
        ...(minimum === null ? {} : { startingPrice: minimum }),
      },
    });
  }

  private toLeadResponse(lead: Lead & { project: { name: string } }): LeadResponseDto {
    return {
      id: lead.id,
      projectId: lead.projectId,
      projectName: lead.project.name,
      fullName: lead.fullName,
      phone: lead.phone,
      email: lead.email,
      preferredLanguage: lead.preferredLanguage,
      unitPreference: lead.unitPreference,
      paymentPlanId: lead.paymentPlanId,
      paymentPlanName: lead.paymentPlanName,
      message: lead.message,
      budgetMin: lead.budgetMin?.toFixed(4) ?? null,
      budgetMax: lead.budgetMax?.toFixed(4) ?? null,
      currency: lead.currency,
      closedReason: lead.closedReason,
      status: lead.status,
      version: lead.version,
      createdAt: lead.createdAt.toISOString(),
      updatedAt: lead.updatedAt.toISOString(),
    };
  }

  private toUnitResponse(unit: Unit): UnitResponseDto {
    return {
      id: unit.id,
      unitNumber: unit.unitNumber,
      block: unit.block,
      floor: unit.floor,
      roomType: unit.roomType,
      netArea: unit.netArea.toFixed(2),
      grossArea: unit.grossArea?.toFixed(2) ?? null,
      price: unit.price.toFixed(4),
      currency: unit.currency,
      status: unit.status,
      orientation: unit.orientation,
      floorPlanImageUrl: unit.floorPlanImageUrl,
      version: unit.version,
      updatedAt: unit.updatedAt.toISOString(),
    };
  }

  private toPlanResponse(plan: {
    id: string;
    name: string;
    downPaymentPercent: Prisma.Decimal;
    termMonths: number;
    deliveryPercent: Prisma.Decimal;
    isRecommended: boolean;
    monthlyPayment: Prisma.Decimal | null;
    totalPrice: Prisma.Decimal | null;
    cashDiscountPercent: Prisma.Decimal | null;
    timelineNote: string | null;
    version: number;
  }): PaymentPlanResponseDto {
    return {
      id: plan.id,
      name: plan.name,
      downPaymentPercent: plan.downPaymentPercent.toFixed(2),
      termMonths: plan.termMonths,
      deliveryPercent: plan.deliveryPercent.toFixed(2),
      isRecommended: plan.isRecommended,
      monthlyPayment: plan.monthlyPayment?.toFixed(4) ?? null,
      totalPrice: plan.totalPrice?.toFixed(4) ?? null,
      cashDiscountPercent: plan.cashDiscountPercent?.toFixed(2) ?? null,
      timelineNote: plan.timelineNote,
      version: plan.version,
    };
  }

  private developerOrganizationScope(
    userId: string,
    requireManage = false,
  ): Prisma.OrganizationWhereInput {
    return {
      type: OrganizationType.DEVELOPER,
      status: OrganizationStatus.ACTIVE,
      memberships: {
        some: {
          userId,
          ...(requireManage ? { role: { in: [MembershipRole.OWNER, MembershipRole.ADMIN] } } : {}),
        },
      },
    };
  }

  private validatePaymentPlan(downPaymentPercent: string, deliveryPercent: string): void {
    const down = new Prisma.Decimal(downPaymentPercent);
    const delivery = new Prisma.Decimal(deliveryPercent);
    if (down.lt(0) || delivery.lt(0) || down.add(delivery).gt(100))
      throw new AppException('INVALID_PAYMENT_PLAN', 'Payment percentages are invalid', 422);
  }

  private isUniqueConstraint(error: unknown): boolean {
    return error instanceof Prisma.PrismaClientKnownRequestError && error.code === 'P2002';
  }

  private encodeOperationsCursor(row: { updatedAt: Date; id: string }): string {
    return Buffer.from(
      JSON.stringify({ updatedAt: row.updatedAt.toISOString(), id: row.id }),
      'utf8',
    ).toString('base64url');
  }

  private decodeOperationsCursor(cursor: string): OperationsCursor {
    try {
      const parsed = JSON.parse(
        Buffer.from(cursor, 'base64url').toString('utf8'),
      ) as Partial<OperationsCursor>;
      if (
        typeof parsed.id !== 'string' ||
        !/^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(
          parsed.id,
        ) ||
        typeof parsed.updatedAt !== 'string' ||
        Number.isNaN(Date.parse(parsed.updatedAt))
      )
        throw new Error('Invalid cursor');
      return { id: parsed.id, updatedAt: parsed.updatedAt };
    } catch {
      throw new AppException('INVALID_CURSOR', 'Cursor is invalid', 400);
    }
  }

  private operationsCursorWhere(cursor: OperationsCursor): {
    OR: Array<{ updatedAt: { lt: Date } } | { updatedAt: Date; id: { lt: string } }>;
  } {
    const updatedAt = new Date(cursor.updatedAt);
    return { OR: [{ updatedAt: { lt: updatedAt } }, { updatedAt, id: { lt: cursor.id } }] };
  }

  private unitSnapshot(unit: Unit): Prisma.InputJsonValue {
    return {
      unitNumber: unit.unitNumber,
      price: unit.price.toFixed(4),
      currency: unit.currency,
      status: unit.status,
      version: unit.version,
    };
  }

  private planSnapshot(plan: {
    name: string;
    downPaymentPercent: Prisma.Decimal;
    deliveryPercent: Prisma.Decimal;
    termMonths: number;
    monthlyPayment: Prisma.Decimal | null;
    version: number;
  }): Prisma.InputJsonValue {
    return {
      name: plan.name,
      downPaymentPercent: plan.downPaymentPercent.toFixed(2),
      deliveryPercent: plan.deliveryPercent.toFixed(2),
      termMonths: plan.termMonths,
      monthlyPayment: plan.monthlyPayment?.toFixed(4) ?? null,
      version: plan.version,
    };
  }

  private projectIdentityWhere(idOrSlug: string): Prisma.ProjectWhereInput {
    const isUuid =
      /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(idOrSlug);
    return isUuid ? { id: idOrSlug } : { slug: idOrSlug };
  }

  private toBrokerProject(project: BrokerProject): BrokerProjectResponseDto {
    return {
      id: project.id,
      slug: project.slug,
      name: project.name,
      developerName: project.developerOrganization.name,
      publicStartingPrice: project.startingPrice.toFixed(4),
      currency: project.currency,
      brokerPrice: project.brokerOffer?.brokerPrice?.toFixed(4) ?? null,
      commissionPercent: project.brokerOffer?.commissionPercent?.toFixed(2) ?? null,
      reservationHours: project.brokerOffer?.reservationHours ?? null,
      salesContact: project.brokerOffer?.salesContact ?? null,
      units: project.units.map((unit): BrokerUnitResponseDto => ({
        ...this.toUnitResponse(unit),
        brokerPrice:
          unit.brokerTerm?.brokerPrice?.toFixed(4) ??
          (unit.currency === project.currency
            ? project.brokerOffer?.brokerPrice?.toFixed(4)
            : null) ??
          null,
        commissionPercent:
          unit.brokerTerm?.commissionPercent?.toFixed(2) ??
          project.brokerOffer?.commissionPercent?.toFixed(2) ??
          null,
        brokerTermsUpdatedAt:
          (unit.brokerTerm?.updatedAt ?? project.brokerOffer?.updatedAt)?.toISOString() ?? null,
      })),
      materialCount: project._count.materials,
      updatedAt: (project.brokerOffer?.updatedAt ?? project.updatedAt).toISOString(),
    };
  }

  private resolveIdempotentLead(
    lead: Lead & { project: { name: string } },
    requestHash: string,
  ): LeadResponseDto {
    if (lead.requestHash !== requestHash)
      throw new AppException(
        'IDEMPOTENCY_KEY_REUSED',
        'Idempotency key was already used with a different request',
        409,
      );
    return this.toLeadResponse(lead);
  }
}
