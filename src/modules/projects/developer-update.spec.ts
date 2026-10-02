import { ValidationPipe } from '@nestjs/common';
import { Prisma, ProjectStatus } from '@prisma/client';
import { PrismaService } from '../../infrastructure/database/prisma.service';
import { UpdateDeveloperProjectDto } from './dto/update-developer-project.dto';
import { ProjectsService } from './projects.service';

describe('Developer project optimistic concurrency', () => {
  const project = {
    id: 'project-1',
    name: 'Original',
    developerOrganizationId: 'org-1',
    status: ProjectStatus.DRAFT,
    version: 4,
    province: { id: 'p', code: 'p', name: 'Province', slug: 'province' },
    district: { id: 'd', code: 'd', name: 'District', slug: 'district' },
    developerOrganization: { name: 'Developer', verifiedAt: null },
    latitude: new Prisma.Decimal('41'),
    longitude: new Prisma.Decimal('29'),
    startingPrice: new Prisma.Decimal('100'),
    currency: 'TRY',
    createdAt: new Date('2026-01-01'),
    updatedAt: new Date('2026-01-01'),
  };
  const setup = (
    current: object | null = project,
    count = 1,
  ): {
    service: ProjectsService;
    findFirst: jest.Mock;
    updateMany: jest.Mock;
    audit: jest.Mock;
    transaction: jest.Mock;
  } => {
    const findFirst = jest.fn().mockResolvedValue(current);
    const updateMany = jest.fn().mockResolvedValue({ count });
    const audit = jest.fn().mockResolvedValue({});
    const findFirstOrThrow = jest
      .fn()
      .mockResolvedValue({ ...project, name: 'Edited', version: 5 });
    const tx = { project: { updateMany, findFirstOrThrow }, auditLog: { create: audit } };
    const transaction = jest.fn(async (callback: (value: typeof tx) => Promise<unknown>) =>
      callback(tx),
    );
    const service = new ProjectsService({
      project: { findFirst },
      $transaction: transaction,
    } as unknown as PrismaService);
    return { service, findFirst, updateMany, audit, transaction };
  };

  it.each([undefined, null, 0, -1, 1.5, '4'])(
    'rejects invalid expectedVersion %p at the API boundary',
    async (expectedVersion) => {
      const pipe = new ValidationPipe({
        transform: true,
        whitelist: true,
        forbidNonWhitelisted: true,
      });
      await expect(
        pipe.transform(
          { name: 'Edited', expectedVersion },
          { type: 'body', metatype: UpdateDeveloperProjectDto },
        ),
      ).rejects.toMatchObject({ status: 400 });
    },
  );

  it('rejects stale client state before writing or auditing', async () => {
    const { service, transaction, audit } = setup();
    await expect(
      service.updateDeveloper('user-1', 'project-1', { name: 'Edited', expectedVersion: 3 }, {}),
    ).rejects.toMatchObject({ code: 'PROJECT_CONCURRENCY_CONFLICT', status: 409 });
    expect(transaction).not.toHaveBeenCalled();
    expect(audit).not.toHaveBeenCalled();
  });

  it('uses the client version atomically and never persists expectedVersion', async () => {
    const { service, findFirst, updateMany, audit } = setup();
    const result = await service.updateDeveloper(
      'user-1',
      'project-1',
      { name: 'Edited', expectedVersion: 4 },
      {},
    );
    expect(result.version).toBe(5);
    const calls = findFirst.mock.calls as unknown as Array<Array<{ where: unknown }>>;
    expect(calls[0]?.[0]?.where).toMatchObject({
      developerOrganization: {
        memberships: { some: { userId: 'user-1', role: { in: ['OWNER', 'ADMIN'] } } },
      },
    });
    expect(updateMany).toHaveBeenCalledWith({
      where: {
        id: 'project-1',
        status: 'DRAFT',
        version: 4,
        developerOrganization: {
          type: 'DEVELOPER',
          status: 'ACTIVE',
          memberships: { some: { userId: 'user-1', role: { in: ['OWNER', 'ADMIN'] } } },
        },
      },
      data: { name: 'Edited', version: { increment: 1 } },
    });
    expect(audit).toHaveBeenCalledTimes(1);
  });

  it('rejects a concurrent write after the initial read without an audit entry', async () => {
    const { service, audit } = setup(project, 0);
    await expect(
      service.updateDeveloper('user-1', 'project-1', { name: 'Edited', expectedVersion: 4 }, {}),
    ).rejects.toMatchObject({ code: 'PROJECT_CONCURRENCY_CONFLICT' });
    expect(audit).not.toHaveBeenCalled();
  });

  it('rejects metadata-only updates', async () => {
    const { service, findFirst } = setup();
    await expect(
      service.updateDeveloper('user-1', 'project-1', { expectedVersion: 4 }, {}),
    ).rejects.toMatchObject({ code: 'EMPTY_UPDATE' });
    expect(findFirst).not.toHaveBeenCalled();
  });

  it('preserves access, draft-only, and transition policy checks', async () => {
    await expect(
      setup(null).service.updateDeveloper(
        'user-1',
        'project-1',
        { name: 'Edited', expectedVersion: 4 },
        {},
      ),
    ).rejects.toMatchObject({ code: 'PROJECT_NOT_FOUND' });
    await expect(
      setup({ ...project, status: ProjectStatus.PUBLISHED }).service.updateDeveloper(
        'user-1',
        'project-1',
        { name: 'Edited', expectedVersion: 4 },
        {},
      ),
    ).rejects.toMatchObject({ code: 'PROJECT_NOT_EDITABLE' });
    await expect(
      setup().service.updateDeveloper(
        'user-1',
        'project-1',
        { status: ProjectStatus.PUBLISHED, expectedVersion: 4 },
        {},
      ),
    ).rejects.toMatchObject({ code: 'INVALID_PROJECT_STATUS_TRANSITION' });
    const { service, updateMany } = setup();
    await service.updateDeveloper(
      'user-1',
      'project-1',
      { status: ProjectStatus.IN_REVIEW, expectedVersion: 4 },
      {},
    );
    expect(updateMany).toHaveBeenCalledWith(
      expect.objectContaining({ data: { status: 'IN_REVIEW', version: { increment: 1 } } }),
    );
  });
});
