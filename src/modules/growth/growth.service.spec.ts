/* eslint-disable @typescript-eslint/explicit-function-return-type */
import { Logger } from '@nestjs/common';
import { GrowthService } from './growth.service';

describe('GrowthService view ingestion', () => {
  const projectId = '10000000-0000-4000-8000-000000000001';

  function subject(redisResult: 'OK' | null) {
    const prisma = {
      project: { findFirst: jest.fn().mockResolvedValue({ id: projectId }) },
      projectEngagementDaily: { upsert: jest.fn().mockResolvedValue({}) },
    };
    const redis = { client: { status: 'ready', set: jest.fn().mockResolvedValue(redisResult) } };
    const config = {
      getOrThrow: jest.fn((key: string) =>
        key === 'analytics.sessionHashSecret'
          ? 'a-secure-test-secret-with-at-least-32-characters'
          : 'http://localhost:3001/api/v1/media',
      ),
    };
    return {
      service: new GrowthService(prisma as never, redis as never, {} as never, config as never),
      prisma,
      redis,
    };
  }

  it('increments the daily aggregate only for the first Redis claim', async () => {
    const first = subject('OK');
    await expect(first.service.recordView('project', 'first-party-session-123')).resolves.toEqual({
      recorded: true,
    });
    expect(first.prisma.projectEngagementDaily.upsert).toHaveBeenCalledTimes(1);
    const [redisKey, , , ttl] = first.redis.client.set.mock.calls[0] as unknown as [
      string,
      string,
      string,
      number,
    ];
    expect(redisKey).not.toContain('first-party-session-123');
    expect(ttl).toBeGreaterThan(0);
    expect(ttl).toBeLessThanOrEqual(86_400);

    const duplicate = subject(null);
    await expect(
      duplicate.service.recordView('project', 'first-party-session-123'),
    ).resolves.toEqual({ recorded: false });
    expect(duplicate.prisma.projectEngagementDaily.upsert).not.toHaveBeenCalled();
  });

  it('does not claim a view for an unpublished or unknown project', async () => {
    const test = subject('OK');
    test.prisma.project.findFirst.mockResolvedValue(null);
    await expect(
      test.service.recordView('missing', 'first-party-session-123'),
    ).rejects.toMatchObject({
      code: 'PROJECT_NOT_FOUND',
    });
    expect(test.redis.client.set).not.toHaveBeenCalled();
  });
});

describe('GrowthService media upload', () => {
  it('uses one identifier for the object key, database row, and public URL', async () => {
    const organizationId = '10000000-0000-4000-8000-000000000010';
    const projectId = '10000000-0000-4000-8000-000000000011';
    type MediaData = {
      id: string;
      projectId: string;
      kind: string;
      url: string;
      storageKey: string;
      mimeType: string;
      fileSizeBytes: number;
      altText?: string | null;
      sortOrder: number;
    };
    let createdData: MediaData | undefined;
    let storedKey = '';
    const tx = {
      projectMedia: {
        aggregate: jest.fn().mockResolvedValue({ _max: { sortOrder: null } }),
        create: jest.fn().mockImplementation(({ data }: { data: MediaData }) => {
          createdData = data;
          return {
            ...data,
            altText: data.altText ?? null,
            createdAt: new Date('2026-08-28T00:00:00.000Z'),
            updatedAt: new Date('2026-08-28T00:00:00.000Z'),
            version: 1,
          };
        }),
      },
      auditLog: { create: jest.fn().mockResolvedValue({}) },
    };
    const prisma = {
      organization: { findFirst: jest.fn().mockResolvedValue({ id: organizationId }) },
      project: {
        findFirst: jest
          .fn()
          .mockResolvedValue({ id: projectId, developerOrganizationId: organizationId }),
      },
      $transaction: jest.fn(async (callback: (client: typeof tx) => Promise<unknown>) =>
        callback(tx),
      ),
    };
    const storage = {
      put: jest.fn().mockImplementation((key: string) => {
        storedKey = key;
        const id = key.split('/').at(-1)!.split('.')[0];
        return `http://localhost:3001/api/v1/media/${id}`;
      }),
      delete: jest.fn(),
    };
    const config = {
      getOrThrow: jest.fn(() => 'a-secure-test-secret-with-at-least-32-characters'),
    };
    const service = new GrowthService(
      prisma as never,
      { client: {} } as never,
      storage as never,
      config as never,
    );

    const media = await service.uploadMedia(
      'user-id',
      projectId,
      {
        buffer: Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]),
        mimetype: 'image/png',
        size: 8,
      } as Express.Multer.File,
      { kind: 'IMAGE', altText: 'Test image' },
      { requestId: 'request-id' },
    );

    expect(storedKey).toContain(`/${media.id}.png`);
    expect(media.url).toBe(`http://localhost:3001/api/v1/media/${media.id}`);
    expect(createdData?.id).toBe(media.id);
    expect(createdData?.storageKey).toBe(storedKey);
  });

  it('rejects a truncated PNG signature before storing the object', async () => {
    const prisma = {
      project: {
        findFirst: jest.fn().mockResolvedValue({
          id: '10000000-0000-4000-8000-000000000011',
          developerOrganizationId: '10000000-0000-4000-8000-000000000010',
        }),
      },
    };
    const storage = { put: jest.fn() };
    const service = new GrowthService(
      prisma as never,
      { client: {} } as never,
      storage as never,
      {
        getOrThrow: jest.fn(() => 'a-secure-test-secret-with-at-least-32-characters'),
      } as never,
    );

    await expect(
      service.uploadMedia(
        'user-id',
        '10000000-0000-4000-8000-000000000011',
        {
          buffer: Buffer.from([0x89, 0x50, 0x4e, 0x47, 0, 0, 0, 0]),
          mimetype: 'image/png',
          size: 8,
        } as Express.Multer.File,
        { kind: 'IMAGE' },
        { requestId: 'request-id' },
      ),
    ).rejects.toMatchObject({ code: 'MEDIA_TYPE_INVALID' });
    expect(storage.put).not.toHaveBeenCalled();
  });

  it('queues object cleanup when database persistence and immediate deletion fail', async () => {
    const logger = jest.spyOn(Logger.prototype, 'error').mockImplementation(() => undefined);
    const projectId = '10000000-0000-4000-8000-000000000011';
    const prisma = {
      project: {
        findFirst: jest.fn().mockResolvedValue({
          id: projectId,
          developerOrganizationId: '10000000-0000-4000-8000-000000000010',
        }),
      },
      $transaction: jest.fn().mockRejectedValue(new Error('database unavailable')),
      mediaDeletion: { upsert: jest.fn().mockResolvedValue({}) },
    };
    const storage = {
      put: jest.fn().mockResolvedValue('http://localhost/media/id'),
      delete: jest.fn().mockRejectedValue(new Error('storage unavailable')),
    };
    const service = new GrowthService(
      prisma as never,
      { client: {} } as never,
      storage as never,
      {
        getOrThrow: jest.fn(() => 'a-secure-test-secret-with-at-least-32-characters'),
      } as never,
    );

    await expect(
      service.uploadMedia(
        'user-id',
        projectId,
        {
          buffer: Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]),
          mimetype: 'image/png',
          size: 8,
        } as Express.Multer.File,
        { kind: 'IMAGE' },
        { requestId: 'request-id' },
      ),
    ).rejects.toThrow('database unavailable');
    expect(prisma.mediaDeletion.upsert).toHaveBeenCalledTimes(1);
    const [cleanupInput] = prisma.mediaDeletion.upsert.mock.calls[0] as unknown as [
      { create: { projectId: string } },
    ];
    expect(cleanupInput.create.projectId).toBe(projectId);
    logger.mockRestore();
  });
});

describe('GrowthService organization scope', () => {
  it('returns named role-aware scopes for an explicit organization selector', async () => {
    const prisma = {
      organization: {
        findMany: jest.fn().mockResolvedValue([
          {
            id: 'org-1',
            name: 'Development Yapı',
            type: 'DEVELOPER',
            memberships: [{ role: 'MEMBER' }],
          },
        ]),
      },
    };
    const service = new GrowthService(
      prisma as never,
      { client: {} } as never,
      {} as never,
      {
        getOrThrow: jest.fn(() => 'a-secure-test-secret-with-at-least-32-characters'),
      } as never,
    );

    await expect(service.organizations('user-id', 'DEVELOPER')).resolves.toEqual([
      {
        id: 'org-1',
        name: 'Development Yapı',
        type: 'DEVELOPER',
        role: 'MEMBER',
        canManage: false,
      },
    ]);
  });

  it('requires an explicit organization for multi-membership requests', async () => {
    const prisma = {
      organization: {
        findMany: jest.fn().mockResolvedValue([{ id: 'org-1' }, { id: 'org-2' }]),
      },
    };
    const service = new GrowthService(
      prisma as never,
      { client: {} } as never,
      {} as never,
      {
        getOrThrow: jest.fn(() => 'a-secure-test-secret-with-at-least-32-characters'),
      } as never,
    );

    await expect(service.listClients('user-id', { limit: 20 })).rejects.toMatchObject({
      code: 'ORGANIZATION_SCOPE_REQUIRED',
    });
  });

  it('allows a broker member to create a client in an explicitly scoped agency', async () => {
    const row = {
      id: 'client-id',
      organizationId: 'org-1',
      createdById: 'user-id',
      fullName: 'Müşteri',
      phone: '+905551112233',
      email: null,
      notes: null,
      status: 'ACTIVE',
      version: 1,
      createdAt: new Date('2026-08-28T00:00:00.000Z'),
      updatedAt: new Date('2026-08-28T00:00:00.000Z'),
    };
    const tx = {
      brokerClient: { create: jest.fn().mockResolvedValue(row) },
      auditLog: { create: jest.fn().mockResolvedValue({}) },
    };
    const prisma = {
      organization: { findMany: jest.fn().mockResolvedValue([{ id: 'org-1' }]) },
      $transaction: jest.fn(async (callback: (client: typeof tx) => Promise<unknown>) =>
        callback(tx),
      ),
    };
    const service = new GrowthService(
      prisma as never,
      { client: {} } as never,
      {} as never,
      {
        getOrThrow: jest.fn(() => 'a-secure-test-secret-with-at-least-32-characters'),
      } as never,
    );

    await expect(
      service.createClient(
        'user-id',
        { fullName: 'Müşteri', phone: '+905551112233' },
        { requestId: 'request-id' },
        'org-1',
      ),
    ).resolves.toMatchObject({ id: 'client-id' });
    expect(prisma.organization.findMany).toHaveBeenCalledTimes(1);
    const [organizationQuery] = prisma.organization.findMany.mock.calls[0] as unknown as [
      {
        where: {
          id: string;
          memberships: { some: { userId: string; role?: unknown } };
        };
      },
    ];
    expect(organizationQuery.where.id).toBe('org-1');
    expect(organizationQuery.where.memberships.some).toEqual({ userId: 'user-id' });
  });

  it('rejects analytics for an explicitly selected organization outside the user tenant', async () => {
    const prisma = {
      organization: { findMany: jest.fn().mockResolvedValue([]) },
      projectEngagementDaily: { findMany: jest.fn() },
    };
    const service = new GrowthService(
      prisma as never,
      { client: {} } as never,
      {} as never,
      {
        getOrThrow: jest.fn(() => 'a-secure-test-secret-with-at-least-32-characters'),
      } as never,
    );

    await expect(service.analytics('user-id', 7, 'other-org')).rejects.toMatchObject({
      code: 'ORGANIZATION_NOT_FOUND',
    });
    expect(prisma.projectEngagementDaily.findMany).not.toHaveBeenCalled();
    const [analyticsScopeQuery] = prisma.organization.findMany.mock.calls[0] as unknown as [
      {
        where: {
          id: string;
          memberships: { some: { userId: string } };
        };
      },
    ];
    expect(analyticsScopeQuery.where).toMatchObject({
      id: 'other-org',
      memberships: { some: { userId: 'user-id' } },
    });
  });

  it('does not reveal a client ID owned by another broker agency', async () => {
    const prisma = { brokerClient: { findFirst: jest.fn().mockResolvedValue(null) } };
    const service = new GrowthService(
      prisma as never,
      { client: {} } as never,
      {} as never,
      {
        getOrThrow: jest.fn(() => 'a-secure-test-secret-with-at-least-32-characters'),
      } as never,
    );

    await expect(service.getClient('user-id', 'other-client')).rejects.toMatchObject({
      code: 'BROKER_CLIENT_NOT_FOUND',
      status: 404,
    });
    expect(prisma.brokerClient.findFirst).toHaveBeenCalledWith({
      where: {
        id: 'other-client',
        organization: {
          type: 'BROKER_AGENCY',
          status: 'ACTIVE',
          memberships: { some: { userId: 'user-id' } },
        },
      },
    });
  });

  it('rejects settings updates for a developer MEMBER', async () => {
    const prisma = {
      organization: { findMany: jest.fn().mockResolvedValue([]) },
      $transaction: jest.fn(),
    };
    const service = new GrowthService(
      prisma as never,
      { client: {} } as never,
      {} as never,
      {
        getOrThrow: jest.fn(() => 'a-secure-test-secret-with-at-least-32-characters'),
      } as never,
    );

    await expect(
      service.updateSettings(
        'user-id',
        { version: 1, name: 'Blocked update' },
        { requestId: 'request-id' },
        'org-1',
      ),
    ).rejects.toMatchObject({ code: 'ORGANIZATION_MANAGE_FORBIDDEN', status: 403 });
    expect(prisma.$transaction).not.toHaveBeenCalled();
    const [settingsScopeQuery] = prisma.organization.findMany.mock.calls[0] as unknown as [
      {
        where: {
          id: string;
          memberships: {
            some: { userId: string; role: { in: string[] } };
          };
        };
      },
    ];
    expect(settingsScopeQuery.where).toMatchObject({
      id: 'org-1',
      memberships: {
        some: {
          userId: 'user-id',
          role: { in: ['OWNER', 'ADMIN'] },
        },
      },
    });
  });
});

describe('GrowthService media deletion recovery', () => {
  const project = {
    id: '10000000-0000-4000-8000-000000000011',
    developerOrganizationId: '10000000-0000-4000-8000-000000000010',
  };
  const deletion = {
    mediaId: '10000000-0000-4000-8000-000000000012',
    projectId: project.id,
    storageKey: 'projects/project/media.png',
  };

  it('keeps a tombstone after storage failure and removes it on a retry', async () => {
    const prisma = {
      project: { findFirst: jest.fn().mockResolvedValue(project) },
      mediaDeletion: {
        findFirst: jest.fn().mockResolvedValue(deletion),
        deleteMany: jest.fn().mockResolvedValue({ count: 1 }),
      },
    };
    const storage = { delete: jest.fn().mockRejectedValueOnce(new Error('storage down')) };
    const service = new GrowthService(
      prisma as never,
      { client: {} } as never,
      storage as never,
      {
        getOrThrow: jest.fn(() => 'a-secure-test-secret-with-at-least-32-characters'),
      } as never,
    );

    await expect(
      service.deleteMedia('user-id', project.id, deletion.mediaId, 1, {
        requestId: 'request-id',
      }),
    ).rejects.toThrow('storage down');
    expect(prisma.mediaDeletion.deleteMany).not.toHaveBeenCalled();

    storage.delete.mockResolvedValueOnce(undefined);
    await expect(
      service.deleteMedia('user-id', project.id, deletion.mediaId, 1, {
        requestId: 'request-id',
      }),
    ).resolves.toBeUndefined();
    expect(prisma.mediaDeletion.deleteMany).toHaveBeenCalledWith({
      where: deletion,
    });
  });

  it('drains successful tombstones at startup and leaves failed cleanup queued', async () => {
    const logger = jest.spyOn(Logger.prototype, 'warn').mockImplementation(() => undefined);
    const failed = {
      ...deletion,
      mediaId: '10000000-0000-4000-8000-000000000013',
      storageKey: 'projects/project/failed.png',
    };
    const prisma = {
      mediaDeletion: {
        findMany: jest.fn().mockResolvedValue([deletion, failed]),
        deleteMany: jest.fn().mockResolvedValue({ count: 1 }),
      },
    };
    const storage = {
      delete: jest.fn((key: string) =>
        key === failed.storageKey ? Promise.reject(new Error('storage down')) : Promise.resolve(),
      ),
    };
    const service = new GrowthService(
      prisma as never,
      { client: {} } as never,
      storage as never,
      {
        getOrThrow: jest.fn(() => 'a-secure-test-secret-with-at-least-32-characters'),
      } as never,
    );

    await service.onModuleInit();

    expect(prisma.mediaDeletion.deleteMany).toHaveBeenCalledTimes(1);
    expect(prisma.mediaDeletion.deleteMany).toHaveBeenCalledWith({ where: deletion });
    expect(logger).toHaveBeenCalledWith(expect.stringContaining(failed.mediaId));
    logger.mockRestore();
  });

  it('continues past 100 failed tombstones without starving newer cleanup', async () => {
    const logger = jest.spyOn(Logger.prototype, 'warn').mockImplementation(() => undefined);
    const firstCreatedAt = new Date('2026-08-27T00:00:00.000Z');
    const firstBatch = Array.from({ length: 100 }, (_, index) => ({
      mediaId: `10000000-0000-4000-8000-${String(index).padStart(12, '0')}`,
      projectId: project.id,
      storageKey: `projects/project/failed-${index}.png`,
      createdAt: firstCreatedAt,
    }));
    const newer = {
      mediaId: '20000000-0000-4000-8000-000000000001',
      projectId: project.id,
      storageKey: 'projects/project/newer.png',
      createdAt: new Date('2026-08-28T00:00:00.000Z'),
    };
    const prisma = {
      mediaDeletion: {
        findMany: jest.fn().mockResolvedValueOnce(firstBatch).mockResolvedValueOnce([newer]),
        deleteMany: jest.fn().mockResolvedValue({ count: 1 }),
      },
    };
    const storage = {
      delete: jest.fn((key: string) =>
        key === newer.storageKey ? Promise.resolve() : Promise.reject(new Error('storage down')),
      ),
    };
    const service = new GrowthService(
      prisma as never,
      { client: {} } as never,
      storage as never,
      {
        getOrThrow: jest.fn(() => 'a-secure-test-secret-with-at-least-32-characters'),
      } as never,
    );

    await service.onModuleInit();

    expect(prisma.mediaDeletion.findMany).toHaveBeenCalledTimes(2);
    const findManyCalls = prisma.mediaDeletion.findMany.mock.calls as unknown as Array<
      [{ where?: { OR: unknown[] } }]
    >;
    expect(findManyCalls[1]?.[0].where?.OR).toHaveLength(2);
    expect(prisma.mediaDeletion.deleteMany).toHaveBeenCalledTimes(1);
    expect(prisma.mediaDeletion.deleteMany).toHaveBeenCalledWith({
      where: {
        mediaId: newer.mediaId,
        projectId: newer.projectId,
        storageKey: newer.storageKey,
      },
    });
    logger.mockRestore();
  });
});
