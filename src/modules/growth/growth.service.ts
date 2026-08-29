/* eslint-disable @typescript-eslint/explicit-function-return-type */
import { createHmac, randomUUID } from 'crypto';
import { Injectable, Logger, OnModuleInit } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import {
  BrokerClient,
  BrokerClientStatus,
  MembershipRole,
  OrganizationType,
  Prisma,
  ProjectMedia,
  ProjectStatus,
} from '@prisma/client';
import { AppException } from '../../common/exceptions/app.exception';
import { MutationContext } from '../../common/types/mutation-context';
import { PrismaService } from '../../infrastructure/database/prisma.service';
import { RedisService } from '../../infrastructure/redis/redis.service';
import { ObjectStorageService } from '../../infrastructure/storage/object-storage.service';
import {
  BrokerClientListResponseDto,
  BrokerClientQueryDto,
  BrokerClientResponseDto,
  BrokerContactResponseDto,
  CreateBrokerClientDto,
  DeveloperAnalyticsResponseDto,
  DeveloperMediaResponseDto,
  DeveloperSettingsResponseDto,
  OrganizationScopeResponseDto,
  ReorderMediaDto,
  UpdateBrokerClientDto,
  UpdateDeveloperSettingsDto,
  UpdateMediaDto,
  UploadMediaDto,
} from './dto/growth.dto';

type DailyRow = {
  projectId: string;
  name: string;
  date: Date;
  views: number;
  favoriteAdds: number;
  leads: number;
};
@Injectable()
export class GrowthService implements OnModuleInit {
  private readonly analyticsSecret: string;
  private readonly logger = new Logger(GrowthService.name);
  constructor(
    private readonly prisma: PrismaService,
    private readonly redis: RedisService,
    private readonly storage: ObjectStorageService,
    config: ConfigService,
  ) {
    this.analyticsSecret = config.getOrThrow<string>('analytics.sessionHashSecret');
  }

  async onModuleInit(): Promise<void> {
    await this.recoverPendingMediaDeletions();
  }

  async recordView(idOrSlug: string, sessionId: string): Promise<{ recorded: boolean }> {
    const project = await this.prisma.project.findFirst({
      where: { status: ProjectStatus.PUBLISHED, OR: [{ id: idOrSlug }, { slug: idOrSlug }] },
      select: { id: true },
    });
    if (!project) throw new AppException('PROJECT_NOT_FOUND', 'Project not found', 404);
    const day = this.utcStart(new Date());
    const hash = createHmac('sha256', this.analyticsSecret).update(sessionId).digest('hex');
    const key = `analytics:view:${day.toISOString().slice(0, 10)}:${project.id}:${hash}`;
    if (this.redis.client.status === 'wait' || this.redis.client.status === 'end')
      await this.redis.client.connect();
    const expiresAt = new Date(day);
    expiresAt.setUTCDate(expiresAt.getUTCDate() + 1);
    const ttlSeconds = Math.max(1, Math.ceil((expiresAt.getTime() - Date.now()) / 1000));
    const recorded = (await this.redis.client.set(key, '1', 'EX', ttlSeconds, 'NX')) === 'OK';
    if (recorded) {
      try {
        await this.prisma.projectEngagementDaily.upsert({
          where: { projectId_date: { projectId: project.id, date: day } },
          create: { projectId: project.id, date: day, views: 1 },
          update: { views: { increment: 1 } },
        });
      } catch (error) {
        await this.redis.client.del(key).catch(() => undefined);
        throw error;
      }
    }
    return { recorded };
  }

  async organizations(
    userId: string,
    type: OrganizationType,
  ): Promise<OrganizationScopeResponseDto[]> {
    const rows = await this.prisma.organization.findMany({
      where: { type, status: 'ACTIVE', memberships: { some: { userId } } },
      select: {
        id: true,
        name: true,
        type: true,
        memberships: { where: { userId }, select: { role: true }, take: 1 },
      },
      orderBy: [{ name: 'asc' }, { id: 'asc' }],
    });
    return rows.map((organization) => {
      const role = organization.memberships[0]!.role;
      return {
        id: organization.id,
        name: organization.name,
        type: organization.type,
        role,
        canManage: role === MembershipRole.OWNER || role === MembershipRole.ADMIN,
      };
    });
  }

  async analytics(
    userId: string,
    days: number,
    organizationId?: string,
  ): Promise<DeveloperAnalyticsResponseDto> {
    const org = await this.organization(userId, OrganizationType.DEVELOPER, false, organizationId);
    const to = this.utcStart(new Date());
    to.setUTCDate(to.getUTCDate() + 1);
    const from = new Date(to);
    from.setUTCDate(from.getUTCDate() - days);
    const previousFrom = new Date(from);
    previousFrom.setUTCDate(previousFrom.getUTCDate() - days);
    const rows = await this.prisma.projectEngagementDaily.findMany({
      where: { project: { developerOrganizationId: org.id }, date: { gte: previousFrom, lt: to } },
      include: { project: { select: { name: true } } },
      orderBy: [{ date: 'asc' }, { projectId: 'asc' }],
    });
    const mapped: DailyRow[] = rows.map((r) => ({
      projectId: r.projectId,
      name: r.project.name,
      date: r.date,
      views: r.views,
      favoriteAdds: r.favoriteAdds,
      leads: r.leads,
    }));
    const current = mapped.filter((r) => r.date >= from);
    const previous = mapped.filter((r) => r.date >= previousFrom && r.date < from);
    const currentTotals = this.sum(current);
    const previousTotals = this.sum(previous);
    const favoriteSnapshot = await this.prisma.savedProject.count({
      where: { project: { developerOrganizationId: org.id } },
    });
    const byDay = new Map(
      current.map((r) => [r.date.toISOString().slice(0, 10), { views: 0, favorites: 0, leads: 0 }]),
    );
    for (const row of current) {
      const d = row.date.toISOString().slice(0, 10);
      const x = byDay.get(d)!;
      x.views += row.views;
      x.favorites += row.favoriteAdds;
      x.leads += row.leads;
    }
    const daily = Array.from({ length: days }, (_, i) => {
      const date = new Date(from);
      date.setUTCDate(date.getUTCDate() + i);
      const key = date.toISOString().slice(0, 10);
      return { date: key, ...(byDay.get(key) ?? { views: 0, favorites: 0, leads: 0 }) };
    });
    const projects = new Map<
      string,
      { projectId: string; name: string; views: number; favorites: number; leads: number }
    >();
    for (const row of current) {
      const x = projects.get(row.projectId) ?? {
        projectId: row.projectId,
        name: row.name,
        views: 0,
        favorites: 0,
        leads: 0,
      };
      x.views += row.views;
      x.favorites += row.favoriteAdds;
      x.leads += row.leads;
      projects.set(row.projectId, x);
    }
    return {
      range: {
        days,
        from: from.toISOString(),
        to: to.toISOString(),
        previousFrom: previousFrom.toISOString(),
        previousTo: from.toISOString(),
        timeZone: 'UTC',
      },
      totals: {
        views: currentTotals.views,
        favorites: favoriteSnapshot,
        leads: currentTotals.leads,
        conversionRate: this.rate(currentTotals.leads, currentTotals.views),
        viewsChangePercent: this.change(currentTotals.views, previousTotals.views),
        favoritesChangePercent: this.change(currentTotals.favorites, previousTotals.favorites),
        leadsChangePercent: this.change(currentTotals.leads, previousTotals.leads),
      },
      daily,
      topProjects: [...projects.values()]
        .sort((a, b) => b.views - a.views || a.projectId.localeCompare(b.projectId))
        .slice(0, 5)
        .map((x) => ({ ...x, conversionRate: this.rate(x.leads, x.views) })),
    };
  }

  async listClients(userId: string, q: BrokerClientQueryDto): Promise<BrokerClientListResponseDto> {
    const org = await this.organization(
      userId,
      OrganizationType.BROKER_AGENCY,
      false,
      q.organizationId,
    );
    const cursor = q.cursor ? this.decodeCursor(q.cursor) : undefined;
    const rows = await this.prisma.brokerClient.findMany({
      where: {
        organizationId: org.id,
        ...(q.status ? { status: q.status } : {}),
        ...(q.q
          ? {
              OR: [
                { fullName: { contains: q.q, mode: 'insensitive' } },
                { phone: { contains: q.q } },
                { email: { contains: q.q, mode: 'insensitive' } },
              ],
            }
          : {}),
        ...(cursor
          ? {
              OR: [
                { updatedAt: { lt: cursor.updatedAt } },
                { updatedAt: cursor.updatedAt, id: { lt: cursor.id } },
              ],
            }
          : {}),
      },
      orderBy: [{ updatedAt: 'desc' }, { id: 'desc' }],
      take: q.limit + 1,
    });
    const more = rows.length > q.limit;
    const visible = more ? rows.slice(0, q.limit) : rows;
    const last = visible.at(-1);
    return {
      items: visible.map(this.clientDto),
      pageInfo: { hasNextPage: more, nextCursor: more && last ? this.encodeCursor(last) : null },
    };
  }
  async getClient(userId: string, id: string): Promise<BrokerClientResponseDto> {
    const row = await this.prisma.brokerClient.findFirst({
      where: {
        id,
        organization: {
          type: OrganizationType.BROKER_AGENCY,
          status: 'ACTIVE',
          memberships: { some: { userId } },
        },
      },
    });
    if (!row) throw new AppException('BROKER_CLIENT_NOT_FOUND', 'Broker client not found', 404);
    return this.clientDto(row);
  }
  async createClient(
    userId: string,
    dto: CreateBrokerClientDto,
    context: MutationContext,
    organizationId?: string,
  ): Promise<BrokerClientResponseDto> {
    this.contactRequired(dto.phone, dto.email);
    const org = await this.organization(
      userId,
      OrganizationType.BROKER_AGENCY,
      false,
      organizationId,
    );
    return this.prisma.$transaction(async (tx) => {
      const row = await tx.brokerClient.create({
        data: {
          organizationId: org.id,
          createdById: userId,
          fullName: dto.fullName,
          phone: dto.phone,
          email: dto.email?.toLowerCase(),
          notes: dto.notes,
        },
      });
      await tx.auditLog.create({
        data: {
          actorUserId: userId,
          organizationId: org.id,
          action: 'BROKER_CLIENT_CREATED',
          entityType: 'BrokerClient',
          entityId: row.id,
          after: this.clientSnapshot(row),
          ...context,
        },
      });
      return this.clientDto(row);
    });
  }
  async updateClient(
    userId: string,
    id: string,
    dto: UpdateBrokerClientDto,
    context: MutationContext,
  ): Promise<BrokerClientResponseDto> {
    return this.prisma.$transaction(async (tx) => {
      const before = await tx.brokerClient.findFirst({
        where: {
          id,
          organization: {
            type: OrganizationType.BROKER_AGENCY,
            status: 'ACTIVE',
            memberships: { some: { userId } },
          },
        },
      });
      if (!before)
        throw new AppException('BROKER_CLIENT_NOT_FOUND', 'Broker client not found', 404);
      this.contactRequired(
        dto.phone === undefined ? before.phone : dto.phone,
        dto.email === undefined ? before.email : dto.email,
      );
      const write = await tx.brokerClient.updateMany({
        where: { id, organizationId: before.organizationId, version: dto.version },
        data: {
          ...(dto.fullName !== undefined ? { fullName: dto.fullName } : {}),
          ...(dto.phone !== undefined ? { phone: dto.phone } : {}),
          ...(dto.email !== undefined ? { email: dto.email?.toLowerCase() } : {}),
          ...(dto.notes !== undefined ? { notes: dto.notes } : {}),
          ...(dto.status !== undefined ? { status: dto.status } : {}),
          version: { increment: 1 },
        },
      });
      if (write.count !== 1)
        throw new AppException(
          'BROKER_CLIENT_CONCURRENCY_CONFLICT',
          'Broker client changed before update',
          409,
        );
      const row = await tx.brokerClient.findUniqueOrThrow({ where: { id } });
      await tx.auditLog.create({
        data: {
          actorUserId: userId,
          organizationId: before.organizationId,
          action: 'BROKER_CLIENT_UPDATED',
          entityType: 'BrokerClient',
          entityId: id,
          before: this.clientSnapshot(before),
          after: this.clientSnapshot(row),
          ...context,
        },
      });
      return this.clientDto(row);
    });
  }
  async archiveClient(
    userId: string,
    id: string,
    version: number,
    context: MutationContext,
  ): Promise<void> {
    await this.updateClient(userId, id, { version, status: BrokerClientStatus.ARCHIVED }, context);
  }
  async contacts(userId: string): Promise<BrokerContactResponseDto[]> {
    await this.requireMembership(userId, OrganizationType.BROKER_AGENCY);
    const rows = await this.prisma.project.findMany({
      where: {
        status: ProjectStatus.PUBLISHED,
        brokerOffer: { enabled: true },
        developerOrganization: {
          OR: [{ salesEmail: { not: null } }, { salesPhone: { not: null } }],
        },
      },
      select: {
        id: true,
        name: true,
        developerOrganization: { select: { name: true, salesEmail: true, salesPhone: true } },
        brokerOffer: { select: { salesContact: true } },
      },
      orderBy: [{ name: 'asc' }, { id: 'asc' }],
    });
    return rows.map((r) => ({
      projectId: r.id,
      projectName: r.name,
      developerName: r.developerOrganization.name,
      fullName: r.brokerOffer?.salesContact ?? r.developerOrganization.name,
      phone: r.developerOrganization.salesPhone,
      email: r.developerOrganization.salesEmail,
    }));
  }

  async settings(userId: string, organizationId?: string): Promise<DeveloperSettingsResponseDto> {
    return this.settingsDto(
      await this.organization(userId, OrganizationType.DEVELOPER, false, organizationId),
    );
  }
  async updateSettings(
    userId: string,
    dto: UpdateDeveloperSettingsDto,
    context: MutationContext,
    organizationId?: string,
  ): Promise<DeveloperSettingsResponseDto> {
    const org = await this.organization(userId, OrganizationType.DEVELOPER, true, organizationId);
    return this.prisma.$transaction(async (tx) => {
      const write = await tx.organization.updateMany({
        where: { id: org.id, version: dto.version },
        data: {
          ...(dto.name !== undefined ? { name: dto.name } : {}),
          ...(dto.about !== undefined ? { about: dto.about } : {}),
          ...(dto.salesEmail !== undefined ? { salesEmail: dto.salesEmail?.toLowerCase() } : {}),
          ...(dto.salesPhone !== undefined ? { salesPhone: dto.salesPhone } : {}),
          ...(dto.websiteUrl !== undefined ? { websiteUrl: dto.websiteUrl } : {}),
          version: { increment: 1 },
        },
      });
      if (write.count !== 1)
        throw new AppException(
          'DEVELOPER_SETTINGS_CONCURRENCY_CONFLICT',
          'Settings changed before update',
          409,
        );
      const after = await tx.organization.findUniqueOrThrow({ where: { id: org.id } });
      await tx.auditLog.create({
        data: {
          actorUserId: userId,
          organizationId: org.id,
          action: 'DEVELOPER_SETTINGS_UPDATED',
          entityType: 'Organization',
          entityId: org.id,
          before: this.settingsSnapshot(org),
          after: this.settingsSnapshot(after),
          ...context,
        },
      });
      return this.settingsDto(after);
    });
  }

  async listMedia(userId: string, projectId: string): Promise<DeveloperMediaResponseDto[]> {
    await this.project(userId, projectId, false);
    const rows = await this.prisma.projectMedia.findMany({
      where: { projectId },
      orderBy: [{ sortOrder: 'asc' }, { id: 'asc' }],
    });
    return rows.map(this.mediaDto);
  }
  async publicMedia(mediaId: string): Promise<{ body: Uint8Array; contentType: string }> {
    const media = await this.prisma.projectMedia.findFirst({
      where: { id: mediaId, project: { status: ProjectStatus.PUBLISHED } },
      select: { storageKey: true },
    });
    if (!media) throw new AppException('PROJECT_MEDIA_NOT_FOUND', 'Project media not found', 404);
    return this.storage.get(media.storageKey);
  }
  async uploadMedia(
    userId: string,
    projectId: string,
    file: Express.Multer.File | undefined,
    dto: UploadMediaDto,
    context: MutationContext,
  ): Promise<DeveloperMediaResponseDto> {
    const project = await this.project(userId, projectId, true);
    if (!file) throw new AppException('MEDIA_FILE_REQUIRED', 'Image file is required', 400);
    const mime = this.validImage(file);
    const extension = mime === 'image/jpeg' ? 'jpg' : mime === 'image/png' ? 'png' : 'webp';
    const mediaId = randomUUID();
    const key = `projects/${projectId}/${mediaId}.${extension}`;
    const url = await this.storage.put(key, file.buffer, mime);
    try {
      return await this.prisma.$transaction(async (tx) => {
        const max = await tx.projectMedia.aggregate({
          where: { projectId },
          _max: { sortOrder: true },
        });
        const row = await tx.projectMedia.create({
          data: {
            id: mediaId,
            projectId,
            kind: dto.kind,
            url,
            storageKey: key,
            mimeType: mime,
            fileSizeBytes: file.size,
            altText: dto.altText,
            sortOrder: (max._max.sortOrder ?? -1) + 1,
          },
        });
        await tx.auditLog.create({
          data: {
            actorUserId: userId,
            organizationId: project.developerOrganizationId,
            action: 'PROJECT_MEDIA_UPLOADED',
            entityType: 'ProjectMedia',
            entityId: row.id,
            after: this.mediaSnapshot(row),
            ...context,
          },
        });
        return this.mediaDto(row);
      });
    } catch (error) {
      try {
        await this.storage.delete(key);
      } catch (cleanupError) {
        await this.prisma.mediaDeletion.upsert({
          where: { mediaId },
          create: { mediaId, projectId, storageKey: key },
          update: { projectId, storageKey: key },
        });
        this.logger.error(
          `Uploaded object cleanup was deferred for ${mediaId}`,
          cleanupError instanceof Error ? cleanupError.stack : String(cleanupError),
        );
      }
      throw error;
    }
  }
  async updateMedia(
    userId: string,
    projectId: string,
    mediaId: string,
    dto: UpdateMediaDto,
    context: MutationContext,
  ): Promise<DeveloperMediaResponseDto> {
    const project = await this.project(userId, projectId, true);
    return this.prisma.$transaction(async (tx) => {
      const before = await tx.projectMedia.findFirst({ where: { id: mediaId, projectId } });
      if (!before)
        throw new AppException('PROJECT_MEDIA_NOT_FOUND', 'Project media not found', 404);
      const write = await tx.projectMedia.updateMany({
        where: { id: mediaId, projectId, version: dto.version },
        data: {
          ...(dto.altText !== undefined ? { altText: dto.altText } : {}),
          version: { increment: 1 },
        },
      });
      if (write.count !== 1)
        throw new AppException(
          'PROJECT_MEDIA_CONCURRENCY_CONFLICT',
          'Project media changed before update',
          409,
        );
      const row = await tx.projectMedia.findUniqueOrThrow({ where: { id: mediaId } });
      await tx.auditLog.create({
        data: {
          actorUserId: userId,
          organizationId: project.developerOrganizationId,
          action: 'PROJECT_MEDIA_UPDATED',
          entityType: 'ProjectMedia',
          entityId: mediaId,
          before: this.mediaSnapshot(before),
          after: this.mediaSnapshot(row),
          ...context,
        },
      });
      return this.mediaDto(row);
    });
  }
  async deleteMedia(
    userId: string,
    projectId: string,
    mediaId: string,
    version: number,
    context: MutationContext,
  ): Promise<void> {
    const project = await this.project(userId, projectId, true);
    let deletion = await this.prisma.mediaDeletion.findFirst({ where: { mediaId, projectId } });
    if (!deletion) {
      const row = await this.prisma.projectMedia.findFirst({ where: { id: mediaId, projectId } });
      if (!row) return;
      if (row.version !== version)
        throw new AppException(
          'PROJECT_MEDIA_CONCURRENCY_CONFLICT',
          'Project media changed before delete',
          409,
        );
      deletion = await this.prisma.$transaction(async (tx) => {
        const write = await tx.projectMedia.deleteMany({
          where: { id: mediaId, projectId, version },
        });
        if (write.count !== 1)
          throw new AppException(
            'PROJECT_MEDIA_CONCURRENCY_CONFLICT',
            'Project media changed before delete',
            409,
          );
        const pending = await tx.mediaDeletion.create({
          data: { mediaId, projectId, storageKey: row.storageKey },
        });
        await tx.auditLog.create({
          data: {
            actorUserId: userId,
            organizationId: project.developerOrganizationId,
            action: 'PROJECT_MEDIA_DELETED',
            entityType: 'ProjectMedia',
            entityId: mediaId,
            before: this.mediaSnapshot(row),
            ...context,
          },
        });
        return pending;
      });
    }
    await this.storage.delete(deletion.storageKey);
    await this.prisma.mediaDeletion.deleteMany({
      where: { mediaId, projectId, storageKey: deletion.storageKey },
    });
  }
  async reorderMedia(
    userId: string,
    projectId: string,
    dto: ReorderMediaDto,
    context: MutationContext,
  ): Promise<DeveloperMediaResponseDto[]> {
    const project = await this.project(userId, projectId, true);
    if (new Set(dto.items.map((x) => x.id)).size !== dto.items.length)
      throw new AppException('PROJECT_MEDIA_ORDER_INVALID', 'Media IDs must be unique', 422);
    return this.prisma.$transaction(async (tx) => {
      const rows = await tx.projectMedia.findMany({ where: { projectId }, orderBy: { id: 'asc' } });
      if (
        rows.length !== dto.items.length ||
        rows.some((r) => !dto.items.some((x) => x.id === r.id))
      )
        throw new AppException(
          'PROJECT_MEDIA_ORDER_INVALID',
          'Order must contain the complete media set',
          422,
        );
      for (const [sortOrder, item] of dto.items.entries()) {
        const write = await tx.projectMedia.updateMany({
          where: { id: item.id, projectId, version: item.version },
          data: { sortOrder, version: { increment: 1 } },
        });
        if (write.count !== 1)
          throw new AppException(
            'PROJECT_MEDIA_CONCURRENCY_CONFLICT',
            'Project media changed before reorder',
            409,
          );
      }
      await tx.auditLog.create({
        data: {
          actorUserId: userId,
          organizationId: project.developerOrganizationId,
          action: 'PROJECT_MEDIA_REORDERED',
          entityType: 'Project',
          entityId: projectId,
          after: { orderedIds: dto.items.map((x) => x.id) },
          ...context,
        },
      });
      return (
        await tx.projectMedia.findMany({
          where: { projectId },
          orderBy: [{ sortOrder: 'asc' }, { id: 'asc' }],
        })
      ).map(this.mediaDto);
    });
  }

  private async organization(
    userId: string,
    type: OrganizationType,
    manage: boolean,
    organizationId?: string,
  ) {
    const organizations = await this.prisma.organization.findMany({
      where: {
        ...(organizationId ? { id: organizationId } : {}),
        type,
        status: 'ACTIVE',
        memberships: {
          some: {
            userId,
            ...(manage ? { role: { in: [MembershipRole.OWNER, MembershipRole.ADMIN] } } : {}),
          },
        },
      },
      orderBy: { id: 'asc' },
      take: 2,
    });
    const org = organizations[0];
    if (!org)
      throw new AppException(
        manage ? 'ORGANIZATION_MANAGE_FORBIDDEN' : 'ORGANIZATION_NOT_FOUND',
        manage ? 'Organization management permission required' : 'Organization not found',
        manage ? 403 : 404,
      );
    if (!organizationId && organizations.length > 1)
      throw new AppException(
        'ORGANIZATION_SCOPE_REQUIRED',
        'organizationId is required when the user belongs to multiple organizations',
        400,
      );
    return org;
  }
  private async requireMembership(userId: string, type: OrganizationType): Promise<void> {
    const membership = await this.prisma.organizationMembership.findFirst({
      where: { userId, organization: { type, status: 'ACTIVE' } },
      select: { userId: true },
    });
    if (!membership)
      throw new AppException('ORGANIZATION_NOT_FOUND', 'Organization not found', 404);
  }
  private async project(userId: string, projectId: string, manage: boolean) {
    const project = await this.prisma.project.findFirst({
      where: {
        id: projectId,
        developerOrganization: {
          type: OrganizationType.DEVELOPER,
          status: 'ACTIVE',
          memberships: {
            some: {
              userId,
              ...(manage ? { role: { in: [MembershipRole.OWNER, MembershipRole.ADMIN] } } : {}),
            },
          },
        },
      },
      select: { id: true, developerOrganizationId: true },
    });
    if (!project) throw new AppException('PROJECT_NOT_FOUND', 'Project not found', 404);
    return project;
  }
  private async recoverPendingMediaDeletions(): Promise<void> {
    const batchSize = 100;
    let after: { createdAt: Date; mediaId: string } | undefined;
    while (true) {
      let pending: Array<{
        mediaId: string;
        projectId: string;
        storageKey: string;
        createdAt: Date;
      }>;
      try {
        pending = await this.prisma.mediaDeletion.findMany({
          ...(after
            ? {
                where: {
                  OR: [
                    { createdAt: { gt: after.createdAt } },
                    {
                      createdAt: after.createdAt,
                      mediaId: { gt: after.mediaId },
                    },
                  ],
                },
              }
            : {}),
          orderBy: [{ createdAt: 'asc' }, { mediaId: 'asc' }],
          take: batchSize,
        });
      } catch (error) {
        this.logger.warn(
          `Pending media cleanup could not be loaded: ${error instanceof Error ? error.message : String(error)}`,
        );
        return;
      }
      for (const deletion of pending) {
        try {
          await this.storage.delete(deletion.storageKey);
          await this.prisma.mediaDeletion.deleteMany({
            where: {
              mediaId: deletion.mediaId,
              projectId: deletion.projectId,
              storageKey: deletion.storageKey,
            },
          });
        } catch (error) {
          this.logger.warn(
            `Pending media cleanup remains queued for ${deletion.mediaId}: ${error instanceof Error ? error.message : String(error)}`,
          );
        }
      }
      const last = pending.at(-1);
      if (!last || pending.length < batchSize) return;
      after = { createdAt: last.createdAt, mediaId: last.mediaId };
    }
  }
  private utcStart(d: Date) {
    return new Date(Date.UTC(d.getUTCFullYear(), d.getUTCMonth(), d.getUTCDate()));
  }
  private sum(rows: DailyRow[]) {
    return rows.reduce(
      (a, r) => ({
        views: a.views + r.views,
        favorites: a.favorites + r.favoriteAdds,
        leads: a.leads + r.leads,
      }),
      { views: 0, favorites: 0, leads: 0 },
    );
  }
  private rate(n: number, d: number) {
    return d === 0 ? null : Number(((n / d) * 100).toFixed(2));
  }
  private change(current: number, previous: number) {
    return previous === 0 ? null : Number((((current - previous) / previous) * 100).toFixed(2));
  }
  private contactRequired(phone?: string | null, email?: string | null) {
    if (!phone && !email)
      throw new AppException('BROKER_CLIENT_CONTACT_REQUIRED', 'Phone or email is required', 400);
  }
  private clientDto = (r: BrokerClient): BrokerClientResponseDto => ({
    id: r.id,
    fullName: r.fullName,
    phone: r.phone,
    email: r.email,
    notes: r.notes,
    status: r.status,
    version: r.version,
    createdAt: r.createdAt.toISOString(),
    updatedAt: r.updatedAt.toISOString(),
  });
  private clientSnapshot(r: BrokerClient): Prisma.InputJsonValue {
    return {
      fullName: r.fullName,
      phone: r.phone,
      email: r.email,
      notes: r.notes,
      status: r.status,
      version: r.version,
    };
  }
  private settingsDto(r: {
    id: string;
    name: string;
    about: string | null;
    salesEmail: string | null;
    salesPhone: string | null;
    websiteUrl: string | null;
    logoUrl: string | null;
    version: number;
  }): DeveloperSettingsResponseDto {
    return { ...r };
  }
  private settingsSnapshot(r: {
    name: string;
    about: string | null;
    salesEmail: string | null;
    salesPhone: string | null;
    websiteUrl: string | null;
    version: number;
  }): Prisma.InputJsonValue {
    return {
      name: r.name,
      about: r.about,
      salesEmail: r.salesEmail,
      salesPhone: r.salesPhone,
      websiteUrl: r.websiteUrl,
      version: r.version,
    };
  }
  private mediaDto = (r: ProjectMedia): DeveloperMediaResponseDto => {
    if (r.kind !== 'IMAGE') {
      throw new AppException('PROJECT_MEDIA_KIND_INVALID', 'Unsupported project media kind', 500);
    }
    return {
      id: r.id,
      kind: 'IMAGE',
      url: r.url,
      altText: r.altText,
      sortOrder: r.sortOrder,
      version: r.version,
      createdAt: r.createdAt.toISOString(),
      updatedAt: r.updatedAt.toISOString(),
    };
  };
  private mediaSnapshot(r: ProjectMedia): Prisma.InputJsonValue {
    return {
      kind: r.kind,
      url: r.url,
      altText: r.altText,
      sortOrder: r.sortOrder,
      version: r.version,
    };
  }
  private validImage(file: Express.Multer.File): string {
    if (file.size > 10 * 1024 * 1024)
      throw new AppException('MEDIA_TOO_LARGE', 'Image must not exceed 10 MiB', 413);
    const b = file.buffer;
    const detected =
      b[0] === 0xff && b[1] === 0xd8 && b[2] === 0xff
        ? 'image/jpeg'
        : b.subarray(0, 8).equals(Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]))
          ? 'image/png'
          : b.subarray(0, 4).toString() === 'RIFF' && b.subarray(8, 12).toString() === 'WEBP'
            ? 'image/webp'
            : null;
    if (!detected || file.mimetype !== detected)
      throw new AppException(
        'MEDIA_TYPE_INVALID',
        'Only valid JPEG, PNG or WebP images are accepted',
        422,
      );
    return detected;
  }
  private encodeCursor(r: BrokerClient) {
    return Buffer.from(
      JSON.stringify({ updatedAt: r.updatedAt.toISOString(), id: r.id }),
      'utf8',
    ).toString('base64url');
  }
  private decodeCursor(raw: string): { updatedAt: Date; id: string } {
    try {
      const p = JSON.parse(Buffer.from(raw, 'base64url').toString('utf8')) as {
        updatedAt: string;
        id: string;
      };
      const d = new Date(p.updatedAt);
      if (!p.id || Number.isNaN(d.valueOf())) throw new Error();
      return { updatedAt: d, id: p.id };
    } catch {
      throw new AppException('INVALID_CURSOR', 'Cursor is invalid', 400);
    }
  }
}
