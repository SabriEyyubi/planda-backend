import { Injectable } from '@nestjs/common';
import {
  AdminOverviewResponseDto,
  AdminProjectListResponseDto,
  AdminProjectMutationResponseDto,
  DeveloperOverviewResponseDto,
  DeveloperProjectDetailResponseDto,
  DeveloperProjectItemDto,
  DeveloperProjectListResponseDto,
  OperationsProjectQueryDto,
} from './dto/operations-project.dto';
import {
  ConstructionStatus,
  LeadStatus,
  MembershipRole,
  OrganizationStatus,
  OrganizationType,
  Prisma,
  ProjectStatus,
  UnitStatus,
} from '@prisma/client';
import { AppException } from '../../common/exceptions/app.exception';
import { MutationContext } from '../../common/types/mutation-context';
import { PrismaService } from '../../infrastructure/database/prisma.service';
import { CreateProjectDto } from './dto/create-project.dto';
import { ProjectQueryDto, ProjectSort } from './dto/project-query.dto';
import {
  ProjectDetailResponseDto,
  ProjectListResponseDto,
  ProjectResponseDto,
  ProjectUnitTypeDto,
} from './dto/project-response.dto';
import { UpdateDeveloperProjectDto } from './dto/update-developer-project.dto';
import { canTransitionProject } from './project-policy';

type ProjectWithLocation = Prisma.ProjectGetPayload<{
  include: { province: true; district: true; developerOrganization: true };
}>;

type OperationsProject = Prisma.ProjectGetPayload<{
  include: {
    province: true;
    district: true;
    developerOrganization: true;
    _count: { select: { units: true; leads: true; paymentPlans: true; media: true } };
    units: { select: { id: true } };
  };
}>;

interface ProjectCursor {
  sort: ProjectSort;
  value: string | null;
  id: string;
}

interface OperationsCursor {
  updatedAt: string;
  id: string;
}

@Injectable()
export class ProjectsService {
  constructor(private readonly prisma: PrismaService) {}

  async listPublic(query: ProjectQueryDto): Promise<ProjectListResponseDto> {
    this.validatePublicQuery(query);
    const sort = query.sort ?? ProjectSort.NEWEST;
    const cursor = query.cursor ? this.decodeCursor(query.cursor, sort) : undefined;
    const availableUnitFilter: Prisma.UnitWhereInput = {
      status: UnitStatus.AVAILABLE,
      ...(query.roomType ? { roomType: query.roomType } : {}),
      ...(query.minNetArea ? { netArea: { gte: query.minNetArea } } : {}),
    };
    const paymentPlanFilter: Prisma.PaymentPlanWhereInput = {
      ...(query.maxDownPaymentPercent
        ? { downPaymentPercent: { lte: query.maxDownPaymentPercent } }
        : {}),
      ...(query.maxMonthlyPayment
        ? { monthlyPayment: { not: null, lte: query.maxMonthlyPayment } }
        : {}),
    };
    const and: Prisma.ProjectWhereInput[] = [];
    if (query.q) {
      and.push({
        OR: [
          { name: { contains: query.q, mode: 'insensitive' } },
          { summary: { contains: query.q, mode: 'insensitive' } },
          { developerOrganization: { name: { contains: query.q, mode: 'insensitive' } } },
          { province: { name: { contains: query.q, mode: 'insensitive' } } },
          { district: { name: { contains: query.q, mode: 'insensitive' } } },
        ],
      });
    }
    if (cursor) and.push(this.cursorWhere(cursor));
    const where: Prisma.ProjectWhereInput = {
      status: ProjectStatus.PUBLISHED,
      ...(query.currency ? { currency: query.currency } : {}),
      ...(query.provinceId ? { provinceId: query.provinceId } : {}),
      ...(query.districtId ? { districtId: query.districtId } : {}),
      ...(query.developerOrganizationId
        ? { developerOrganizationId: query.developerOrganizationId }
        : {}),
      ...(query.minPrice || query.maxPrice
        ? {
            startingPrice: {
              ...(query.minPrice ? { gte: query.minPrice } : {}),
              ...(query.maxPrice ? { lte: query.maxPrice } : {}),
            },
          }
        : {}),
      ...(query.roomType || query.minNetArea ? { units: { some: availableUnitFilter } } : {}),
      ...(query.maxDownPaymentPercent || query.maxMonthlyPayment
        ? { paymentPlans: { some: paymentPlanFilter } }
        : {}),
      ...(query.deliveryReady !== undefined
        ? {
            constructionStatus: query.deliveryReady
              ? ConstructionStatus.READY
              : { not: ConstructionStatus.READY },
          }
        : {}),
      ...(query.deliveryBefore
        ? { deliveryDate: { not: null, lte: new Date(query.deliveryBefore) } }
        : {}),
      ...(query.bounds ? this.boundsWhere(query.bounds) : {}),
      ...(and.length ? { AND: and } : {}),
    };
    const projects = await this.prisma.project.findMany({
      where,
      include: { province: true, district: true, developerOrganization: true },
      orderBy: this.orderBy(sort),
      take: query.limit + 1,
    });
    const hasNextPage = projects.length > query.limit;
    const visible = hasNextPage ? projects.slice(0, query.limit) : projects;
    const last = visible.at(-1);
    return {
      items: visible.map((project) => this.toResponse(project)),
      pageInfo: {
        hasNextPage,
        nextCursor: hasNextPage && last ? this.encodeCursor(last, sort) : null,
      },
    };
  }

  async getPublic(idOrSlug: string): Promise<ProjectDetailResponseDto> {
    const isUuid =
      /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(idOrSlug);
    const project = await this.prisma.project.findFirst({
      where: {
        status: ProjectStatus.PUBLISHED,
        ...(isUuid ? { id: idOrSlug } : { slug: idOrSlug }),
      },
      include: {
        province: true,
        district: true,
        developerOrganization: true,
        units: { where: { status: UnitStatus.AVAILABLE }, orderBy: { price: 'asc' } },
        paymentPlans: { orderBy: [{ isRecommended: 'desc' }, { termMonths: 'asc' }] },
        media: {
          where: { kind: 'IMAGE' },
          orderBy: [{ sortOrder: 'asc' }, { id: 'asc' }],
        },
        amenities: { orderBy: [{ label: 'asc' }, { code: 'asc' }] },
        pointsOfInterest: { orderBy: [{ distanceMeters: 'asc' }, { id: 'asc' }] },
      },
    });
    if (!project) throw new AppException('PROJECT_NOT_FOUND', 'Project not found', 404);
    return {
      ...this.toResponse(project),
      unitTypes: this.toUnitTypes(project.units),
      availableUnitCount: project.units.length,
      paymentPlans: project.paymentPlans.map((plan) => ({
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
      })),
      media: project.media.map(({ id, url, altText }) => ({
        id,
        kind: 'IMAGE' as const,
        url,
        altText,
      })),
      amenities: project.amenities.map(({ code, label }) => ({ code, label })),
      pointsOfInterest: project.pointsOfInterest.map(({ id, name, category, distanceMeters }) => ({
        id,
        name,
        category,
        distanceMeters,
      })),
    };
  }

  async listDeveloperProjects(
    userId: string,
    query: OperationsProjectQueryDto,
  ): Promise<DeveloperProjectListResponseDto> {
    const cursor = query.cursor ? this.decodeOperationsCursor(query.cursor) : undefined;
    const and: Prisma.ProjectWhereInput[] = [];
    if (query.q)
      and.push({
        OR: [
          { name: { contains: query.q, mode: 'insensitive' } },
          { slug: { contains: query.q, mode: 'insensitive' } },
        ],
      });
    if (cursor) and.push(this.operationsCursorWhere(cursor));
    const projects = await this.prisma.project.findMany({
      where: {
        developerOrganization: this.developerOrganizationScope(userId),
        ...(query.status ? { status: query.status } : {}),
        ...(and.length ? { AND: and } : {}),
      },
      include: {
        province: true,
        district: true,
        developerOrganization: true,
        _count: { select: { units: true, leads: true, paymentPlans: true, media: true } },
        units: { where: { status: UnitStatus.AVAILABLE }, select: { id: true } },
      },
      orderBy: [{ updatedAt: 'desc' }, { id: 'desc' }],
      take: query.limit + 1,
    });
    const hasNextPage = projects.length > query.limit;
    const visible = hasNextPage ? projects.slice(0, query.limit) : projects;
    const last = visible.at(-1);
    return {
      items: visible.map((project) => this.toDeveloperProjectItem(project)),
      pageInfo: {
        hasNextPage,
        nextCursor: hasNextPage && last ? this.encodeOperationsCursor(last) : null,
      },
    };
  }

  async getDeveloperProject(
    userId: string,
    projectId: string,
  ): Promise<DeveloperProjectDetailResponseDto> {
    const project = await this.prisma.project.findFirst({
      where: { id: projectId, developerOrganization: this.developerOrganizationScope(userId) },
      include: {
        province: true,
        district: true,
        developerOrganization: true,
        _count: { select: { units: true, leads: true, paymentPlans: true, media: true } },
        units: { where: { status: UnitStatus.AVAILABLE }, select: { id: true } },
      },
    });
    if (!project) throw new AppException('PROJECT_NOT_FOUND', 'Project not found', 404);
    return { ...this.toDeveloperProjectItem(project), mediaCount: project._count.media };
  }

  async getDeveloperOverview(userId: string): Promise<DeveloperOverviewResponseDto> {
    const scope = { developerOrganization: this.developerOrganizationScope(userId) };
    const staleBefore = new Date(Date.now() - 48 * 60 * 60 * 1000);
    const [projectCount, publishedProjectCount, availableUnitCount, newLeadCount, staleCount] =
      await this.prisma.$transaction([
        this.prisma.project.count({ where: scope }),
        this.prisma.project.count({ where: { ...scope, status: ProjectStatus.PUBLISHED } }),
        this.prisma.unit.count({
          where: { status: UnitStatus.AVAILABLE, project: scope },
        }),
        this.prisma.lead.count({
          where: { status: LeadStatus.NEW, project: scope },
        }),
        this.prisma.project.count({
          where: {
            ...scope,
            OR: [{ stockUpdatedAt: null }, { stockUpdatedAt: { lt: staleBefore } }],
          },
        }),
      ]);
    return {
      projectCount,
      publishedProjectCount,
      availableUnitCount,
      newLeadCount,
      staleInventoryProjectCount: staleCount,
    };
  }

  async getAdminOverview(): Promise<AdminOverviewResponseDto> {
    const staleBefore = new Date(Date.now() - 48 * 60 * 60 * 1000);
    const [published, review, draft, archived, staleStock, stalePrice] =
      await this.prisma.$transaction([
        this.prisma.project.count({ where: { status: ProjectStatus.PUBLISHED } }),
        this.prisma.project.count({ where: { status: ProjectStatus.IN_REVIEW } }),
        this.prisma.project.count({ where: { status: ProjectStatus.DRAFT } }),
        this.prisma.project.count({ where: { status: ProjectStatus.ARCHIVED } }),
        this.prisma.project.count({
          where: {
            status: ProjectStatus.PUBLISHED,
            OR: [{ stockUpdatedAt: null }, { stockUpdatedAt: { lt: staleBefore } }],
          },
        }),
        this.prisma.project.count({
          where: {
            status: ProjectStatus.PUBLISHED,
            OR: [{ priceUpdatedAt: null }, { priceUpdatedAt: { lt: staleBefore } }],
          },
        }),
      ]);
    return {
      publishedProjectCount: published,
      inReviewProjectCount: review,
      draftProjectCount: draft,
      archivedProjectCount: archived,
      staleStockProjectCount: staleStock,
      stalePriceProjectCount: stalePrice,
    };
  }

  listAdminReviewQueue(query: OperationsProjectQueryDto): Promise<AdminProjectListResponseDto> {
    return this.listAdminProjects(query, { status: ProjectStatus.IN_REVIEW });
  }

  listAdminDataQuality(query: OperationsProjectQueryDto): Promise<AdminProjectListResponseDto> {
    const staleBefore = new Date(Date.now() - 48 * 60 * 60 * 1000);
    return this.listAdminProjects(query, {
      status: ProjectStatus.PUBLISHED,
      OR: [
        { stockUpdatedAt: null },
        { stockUpdatedAt: { lt: staleBefore } },
        { priceUpdatedAt: null },
        { priceUpdatedAt: { lt: staleBefore } },
        { media: { none: {} } },
        { units: { none: { status: UnitStatus.AVAILABLE } } },
        { paymentPlans: { none: {} } },
      ],
    });
  }

  async createDeveloper(
    userId: string,
    dto: CreateProjectDto,
    context: MutationContext,
  ): Promise<ProjectResponseDto> {
    await this.assertDistrictBelongsToProvince(dto.districtId, dto.provinceId);
    try {
      const project = await this.prisma.$transaction(async (tx) => {
        const organization = await tx.organization.findFirst({
          where: {
            id: dto.developerOrganizationId,
            ...this.developerOrganizationScope(userId, true),
          },
          select: { id: true },
        });
        if (!organization)
          throw new AppException(
            'ORGANIZATION_PERMISSION_DENIED',
            'Insufficient developer organization permission',
            403,
          );
        const created = await tx.project.create({
          data: {
            ...dto,
            deliveryDate: dto.deliveryDate ? new Date(dto.deliveryDate) : null,
            priceUpdatedAt: new Date(),
            stockUpdatedAt: new Date(),
          },
          include: { province: true, district: true, developerOrganization: true },
        });
        await tx.auditLog.create({
          data: {
            actorUserId: userId,
            organizationId: dto.developerOrganizationId,
            action: 'PROJECT_CREATED',
            entityType: 'Project',
            entityId: created.id,
            after: this.snapshot(created),
            ...context,
          },
        });
        return created;
      });
      return this.toResponse(project);
    } catch (error) {
      this.handleWriteError(error);
      throw error;
    }
  }

  async updateDeveloper(
    userId: string,
    id: string,
    dto: UpdateDeveloperProjectDto,
    context: MutationContext,
  ): Promise<ProjectResponseDto> {
    const { expectedVersion, deliveryDate, ...rest } = dto;
    if (Object.keys(rest).length === 0 && deliveryDate === undefined) {
      throw new AppException('EMPTY_UPDATE', 'At least one project field is required', 400);
    }
    const project = await this.findDeveloperProjectForMutation(userId, id);
    if (project.version !== expectedVersion) throw this.concurrencyConflict();
    if (project.status !== ProjectStatus.DRAFT) {
      throw new AppException(
        'PROJECT_NOT_EDITABLE',
        'Only draft projects can be edited by developers',
        422,
      );
    }
    if (dto.status && !canTransitionProject('DEVELOPER', project.status, dto.status)) {
      throw new AppException(
        'INVALID_PROJECT_STATUS_TRANSITION',
        'Developer can only submit DRAFT projects for review',
        422,
      );
    }
    const provinceId = dto.provinceId ?? project.provinceId;
    const districtId = dto.districtId ?? project.districtId;
    if (dto.provinceId || dto.districtId) {
      await this.assertDistrictBelongsToProvince(districtId, provinceId);
    }
    try {
      const updated = await this.prisma.$transaction(async (tx) => {
        const write = await tx.project.updateMany({
          where: {
            id,
            status: ProjectStatus.DRAFT,
            version: expectedVersion,
            developerOrganization: this.developerOrganizationScope(userId, true),
          },
          data: {
            ...rest,
            ...(dto.startingPrice ? { priceUpdatedAt: new Date() } : {}),
            ...(deliveryDate !== undefined
              ? { deliveryDate: deliveryDate ? new Date(deliveryDate) : null }
              : {}),
            version: { increment: 1 },
          },
        });
        if (write.count !== 1) throw this.concurrencyConflict();
        const result = await tx.project.findFirstOrThrow({
          where: {
            id,
            developerOrganization: this.developerOrganizationScope(userId, true),
          },
          include: { province: true, district: true, developerOrganization: true },
        });
        await tx.auditLog.create({
          data: {
            actorUserId: userId,
            organizationId: project.developerOrganizationId,
            action: dto.status ? 'PROJECT_SUBMITTED_FOR_REVIEW' : 'PROJECT_UPDATED',
            entityType: 'Project',
            entityId: id,
            before: this.snapshot(project),
            after: this.snapshot(result),
            ...context,
          },
        });
        return result;
      });
      return this.toResponse(updated);
    } catch (error) {
      this.handleWriteError(error);
      throw error;
    }
  }

  async updateAdminStatus(
    userId: string,
    id: string,
    target: ProjectStatus,
    context: MutationContext,
  ): Promise<AdminProjectMutationResponseDto> {
    const project = await this.findProjectForMutation(id);
    if (!canTransitionProject('ADMIN', project.status, target)) {
      throw new AppException(
        'INVALID_PROJECT_STATUS_TRANSITION',
        `Cannot transition project from ${project.status} to ${target}`,
        422,
      );
    }
    const updated = await this.prisma.$transaction(async (tx) => {
      const write = await tx.project.updateMany({
        where: { id, status: project.status, version: project.version },
        data: { status: target, version: { increment: 1 } },
      });
      if (write.count !== 1) throw this.concurrencyConflict();
      const result = await tx.project.findUniqueOrThrow({
        where: { id },
        include: { province: true, district: true, developerOrganization: true },
      });
      const audit = await tx.auditLog.create({
        data: {
          actorUserId: userId,
          organizationId: project.developerOrganizationId,
          action: target === ProjectStatus.PUBLISHED ? 'PROJECT_PUBLISHED' : 'PROJECT_ARCHIVED',
          entityType: 'Project',
          entityId: id,
          before: this.snapshot(project),
          after: this.snapshot(result),
          ...context,
        },
      });
      return { result, auditId: audit.id };
    });
    return { project: this.toResponse(updated.result), auditId: updated.auditId };
  }

  private async listAdminProjects(
    query: OperationsProjectQueryDto,
    baseWhere: Prisma.ProjectWhereInput,
  ): Promise<AdminProjectListResponseDto> {
    const cursor = query.cursor ? this.decodeOperationsCursor(query.cursor) : undefined;
    const and: Prisma.ProjectWhereInput[] = [baseWhere];
    if (query.q)
      and.push({
        OR: [
          { name: { contains: query.q, mode: 'insensitive' } },
          { developerOrganization: { name: { contains: query.q, mode: 'insensitive' } } },
        ],
      });
    if (cursor) and.push(this.operationsCursorWhere(cursor));
    const projects = await this.prisma.project.findMany({
      where: { AND: and },
      include: {
        province: true,
        district: true,
        developerOrganization: true,
        _count: { select: { units: true, leads: true, paymentPlans: true, media: true } },
        units: { where: { status: UnitStatus.AVAILABLE }, select: { id: true } },
      },
      orderBy: [{ updatedAt: 'desc' }, { id: 'desc' }],
      take: query.limit + 1,
    });
    const hasNextPage = projects.length > query.limit;
    const visible = hasNextPage ? projects.slice(0, query.limit) : projects;
    const last = visible.at(-1);
    return {
      items: visible.map((project) => ({
        ...this.toDeveloperProjectItem(project),
        issues: this.projectIssues(project),
      })),
      pageInfo: {
        hasNextPage,
        nextCursor: hasNextPage && last ? this.encodeOperationsCursor(last) : null,
      },
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

  private toDeveloperProjectItem(project: OperationsProject): DeveloperProjectItemDto {
    return {
      ...this.toResponse(project),
      unitCount: project._count.units,
      availableUnitCount: project.units.length,
      leadCount: project._count.leads,
      paymentPlanCount: project._count.paymentPlans,
      completenessPercent: this.projectCompleteness(project),
    };
  }

  private projectCompleteness(project: OperationsProject): number {
    const checks = [
      Boolean(project.name),
      Boolean(project.summary),
      Boolean(project.heroImageUrl),
      Boolean(project.deliveryDate),
      Boolean(project.priceUpdatedAt),
      Boolean(project.stockUpdatedAt),
      project.developerOrganization.verifiedAt !== null,
      project._count.units > 0,
      project._count.paymentPlans > 0,
      project._count.media > 0,
    ];
    return Math.round((checks.filter(Boolean).length / checks.length) * 100);
  }

  private projectIssues(project: OperationsProject): string[] {
    const issues: string[] = [];
    const staleBefore = Date.now() - 48 * 60 * 60 * 1000;
    if (!project.stockUpdatedAt || project.stockUpdatedAt.getTime() < staleBefore)
      issues.push('STALE_STOCK');
    if (!project.priceUpdatedAt || project.priceUpdatedAt.getTime() < staleBefore)
      issues.push('STALE_PRICE');
    if (project._count.media === 0) issues.push('MISSING_MEDIA');
    if (project.units.length === 0) issues.push('NO_AVAILABLE_UNITS');
    if (project._count.paymentPlans === 0) issues.push('MISSING_PAYMENT_PLAN');
    return issues;
  }

  private encodeOperationsCursor(project: { updatedAt: Date; id: string }): string {
    return Buffer.from(
      JSON.stringify({ updatedAt: project.updatedAt.toISOString(), id: project.id }),
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

  private operationsCursorWhere(cursor: OperationsCursor): Prisma.ProjectWhereInput {
    const updatedAt = new Date(cursor.updatedAt);
    return { OR: [{ updatedAt: { lt: updatedAt } }, { updatedAt, id: { lt: cursor.id } }] };
  }

  private async findProjectForMutation(id: string): Promise<ProjectWithLocation> {
    const project = await this.prisma.project.findUnique({
      where: { id },
      include: { province: true, district: true, developerOrganization: true },
    });
    if (!project) throw new AppException('PROJECT_NOT_FOUND', 'Project not found', 404);
    return project;
  }

  private async findDeveloperProjectForMutation(
    userId: string,
    id: string,
  ): Promise<ProjectWithLocation> {
    const project = await this.prisma.project.findFirst({
      where: { id, developerOrganization: this.developerOrganizationScope(userId, true) },
      include: { province: true, district: true, developerOrganization: true },
    });
    if (!project) throw new AppException('PROJECT_NOT_FOUND', 'Project not found', 404);
    return project;
  }

  private async assertDistrictBelongsToProvince(
    districtId: string,
    provinceId: string,
  ): Promise<void> {
    const district = await this.prisma.district.findFirst({
      where: { id: districtId, provinceId },
      select: { id: true },
    });
    if (!district) {
      throw new AppException(
        'INVALID_PROJECT_LOCATION',
        'District does not belong to the selected province',
        422,
      );
    }
  }

  private toResponse(project: ProjectWithLocation): ProjectResponseDto {
    return {
      id: project.id,
      developerOrganizationId: project.developerOrganizationId,
      name: project.name,
      slug: project.slug,
      developerName: project.developerOrganization.name,
      developerVerified: project.developerOrganization.verifiedAt !== null,
      status: project.status,
      constructionStatus: project.constructionStatus,
      province: this.locationReference(project.province),
      district: this.locationReference(project.district),
      latitude: project.latitude.toFixed(6),
      longitude: project.longitude.toFixed(6),
      startingPrice: project.startingPrice.toFixed(4),
      currency: project.currency,
      deliveryDate: project.deliveryDate ? project.deliveryDate.toISOString().slice(0, 10) : null,
      summary: project.summary,
      heroImageUrl: project.heroImageUrl,
      stockUpdatedAt: project.stockUpdatedAt?.toISOString() ?? null,
      priceUpdatedAt: project.priceUpdatedAt?.toISOString() ?? null,
      createdAt: project.createdAt.toISOString(),
      updatedAt: project.updatedAt.toISOString(),
      version: project.version,
    };
  }

  private toUnitTypes(
    units: Array<{
      roomType: string;
      netArea: Prisma.Decimal;
      price: Prisma.Decimal;
      currency: string;
      floor: number | null;
      orientation: string | null;
      floorPlanImageUrl: string | null;
    }>,
  ): ProjectUnitTypeDto[] {
    const groups = new Map<string, ProjectUnitTypeDto>();
    for (const unit of units) {
      const key = JSON.stringify([unit.roomType, unit.currency]);
      const existing = groups.get(key);
      if (!existing) {
        groups.set(key, {
          roomType: unit.roomType,
          availableCount: 1,
          minNetArea: unit.netArea.toFixed(2),
          maxNetArea: unit.netArea.toFixed(2),
          startingPrice: unit.price.toFixed(4),
          currency: unit.currency,
          minFloor: unit.floor,
          maxFloor: unit.floor,
          orientations: unit.orientation ? [unit.orientation] : [],
          floorPlanImageUrl: unit.floorPlanImageUrl,
        });
        continue;
      }
      existing.availableCount += 1;
      if (unit.netArea.lt(existing.minNetArea)) existing.minNetArea = unit.netArea.toFixed(2);
      if (unit.netArea.gt(existing.maxNetArea)) existing.maxNetArea = unit.netArea.toFixed(2);
      if (unit.price.lt(existing.startingPrice)) existing.startingPrice = unit.price.toFixed(4);
      if (unit.floor !== null && (existing.minFloor === null || unit.floor < existing.minFloor))
        existing.minFloor = unit.floor;
      if (unit.floor !== null && (existing.maxFloor === null || unit.floor > existing.maxFloor))
        existing.maxFloor = unit.floor;
      if (unit.orientation && !existing.orientations.includes(unit.orientation))
        existing.orientations.push(unit.orientation);
      if (!existing.floorPlanImageUrl && unit.floorPlanImageUrl)
        existing.floorPlanImageUrl = unit.floorPlanImageUrl;
    }
    return [...groups.values()];
  }

  private boundsWhere(bounds: string): Prisma.ProjectWhereInput {
    const [west, south, east, north] = bounds.split(',').map((value) => value.trim());
    const [westNumber, southNumber, eastNumber, northNumber] = [west, south, east, north].map(
      Number,
    );
    if (
      [westNumber, southNumber, eastNumber, northNumber].some(
        (value) => value === undefined || !Number.isFinite(value),
      ) ||
      westNumber === undefined ||
      southNumber === undefined ||
      eastNumber === undefined ||
      northNumber === undefined ||
      westNumber >= eastNumber ||
      southNumber >= northNumber ||
      westNumber < -180 ||
      eastNumber > 180 ||
      southNumber < -90 ||
      northNumber > 90
    )
      throw new AppException('INVALID_MAP_BOUNDS', 'Map bounds are invalid', 400);
    return {
      longitude: { gte: west, lte: east },
      latitude: { gte: south, lte: north },
    };
  }

  private locationReference(location: { id: string; code: string; name: string; slug: string }): {
    id: string;
    code: string;
    name: string;
    slug: string;
  } {
    return { id: location.id, code: location.code, name: location.name, slug: location.slug };
  }

  private snapshot(project: ProjectWithLocation): Prisma.InputJsonValue {
    return this.toResponse(project) as unknown as Prisma.InputJsonValue;
  }

  private encodeCursor(project: ProjectWithLocation, sort: ProjectSort): string {
    const cursor: ProjectCursor = { sort, value: this.sortValue(project, sort), id: project.id };
    return Buffer.from(JSON.stringify(cursor), 'utf8').toString('base64url');
  }

  private decodeCursor(cursor: string, requestedSort: ProjectSort): ProjectCursor {
    try {
      const parsed = JSON.parse(
        Buffer.from(cursor, 'base64url').toString('utf8'),
      ) as Partial<ProjectCursor> & { createdAt?: string };
      const normalized: Partial<ProjectCursor> = parsed.createdAt
        ? { sort: ProjectSort.NEWEST, value: parsed.createdAt, id: parsed.id }
        : parsed;
      if (
        typeof normalized.id !== 'string' ||
        !/^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(
          normalized.id,
        ) ||
        normalized.sort !== requestedSort ||
        !this.validCursorValue(normalized.value, requestedSort)
      )
        throw new Error('Invalid cursor');
      return {
        id: normalized.id,
        sort: requestedSort,
        value: normalized.value ?? null,
      };
    } catch {
      throw new AppException('INVALID_CURSOR', 'Cursor is invalid', 400);
    }
  }

  private validatePublicQuery(query: ProjectQueryDto): void {
    const hasMonetaryQuery =
      query.minPrice !== undefined ||
      query.maxPrice !== undefined ||
      query.maxMonthlyPayment !== undefined ||
      query.sort === ProjectSort.PRICE_ASC ||
      query.sort === ProjectSort.PRICE_DESC;
    if (hasMonetaryQuery && !query.currency)
      throw new AppException(
        'CURRENCY_REQUIRED',
        'Select TRY or USD for monetary filters and price sorting',
        400,
      );
    if (query.minPrice && query.maxPrice && new Prisma.Decimal(query.minPrice).gt(query.maxPrice))
      throw new AppException('INVALID_PRICE_RANGE', 'Minimum price cannot exceed maximum', 422);
    if (query.maxDownPaymentPercent && new Prisma.Decimal(query.maxDownPaymentPercent).gt(100))
      throw new AppException(
        'INVALID_DOWN_PAYMENT_FILTER',
        'Maximum down payment cannot exceed 100 percent',
        422,
      );
  }

  private orderBy(sort: ProjectSort): Prisma.ProjectOrderByWithRelationInput[] {
    if (sort === ProjectSort.PRICE_ASC) return [{ startingPrice: 'asc' }, { id: 'asc' }];
    if (sort === ProjectSort.PRICE_DESC) return [{ startingPrice: 'desc' }, { id: 'desc' }];
    if (sort === ProjectSort.DELIVERY_ASC)
      return [{ deliveryDate: { sort: 'asc', nulls: 'last' } }, { id: 'asc' }];
    return [{ createdAt: 'desc' }, { id: 'desc' }];
  }

  private sortValue(project: ProjectWithLocation, sort: ProjectSort): string | null {
    if (sort === ProjectSort.PRICE_ASC || sort === ProjectSort.PRICE_DESC)
      return project.startingPrice.toFixed(4);
    if (sort === ProjectSort.DELIVERY_ASC)
      return project.deliveryDate?.toISOString().slice(0, 10) ?? null;
    return project.createdAt.toISOString();
  }

  private cursorWhere(cursor: ProjectCursor): Prisma.ProjectWhereInput {
    if (cursor.sort === ProjectSort.PRICE_ASC)
      return {
        OR: [
          { startingPrice: { gt: cursor.value! } },
          { startingPrice: cursor.value!, id: { gt: cursor.id } },
        ],
      };
    if (cursor.sort === ProjectSort.PRICE_DESC)
      return {
        OR: [
          { startingPrice: { lt: cursor.value! } },
          { startingPrice: cursor.value!, id: { lt: cursor.id } },
        ],
      };
    if (cursor.sort === ProjectSort.DELIVERY_ASC) {
      if (cursor.value === null) return { deliveryDate: null, id: { gt: cursor.id } };
      const deliveryDate = new Date(cursor.value);
      return {
        OR: [
          { deliveryDate: { gt: deliveryDate } },
          { deliveryDate, id: { gt: cursor.id } },
          { deliveryDate: null },
        ],
      };
    }
    const createdAt = new Date(cursor.value!);
    return {
      OR: [{ createdAt: { lt: createdAt } }, { createdAt, id: { lt: cursor.id } }],
    };
  }

  private validCursorValue(value: string | null | undefined, sort: ProjectSort): boolean {
    if (sort === ProjectSort.DELIVERY_ASC)
      return value === null || (typeof value === 'string' && !Number.isNaN(Date.parse(value)));
    if (typeof value !== 'string') return false;
    if (sort === ProjectSort.NEWEST) return !Number.isNaN(Date.parse(value));
    return /^\d{1,19}(?:\.\d{1,4})?$/.test(value);
  }

  private concurrencyConflict(): AppException {
    return new AppException(
      'PROJECT_CONCURRENCY_CONFLICT',
      'Project changed while the request was being processed',
      409,
    );
  }

  private handleWriteError(error: unknown): void {
    if (error instanceof Prisma.PrismaClientKnownRequestError && error.code === 'P2002') {
      throw new AppException('PROJECT_SLUG_CONFLICT', 'Project slug already exists', 409);
    }
  }
}
