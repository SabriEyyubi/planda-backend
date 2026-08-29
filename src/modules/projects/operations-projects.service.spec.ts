import { ProjectStatus } from '@prisma/client';
import { PrismaService } from '../../infrastructure/database/prisma.service';
import { ProjectsService } from './projects.service';

describe('ProjectsService operations API', () => {
  it('scopes developer project listing to an active developer membership', async () => {
    const findMany = jest.fn().mockResolvedValue([]);
    const service = new ProjectsService({ project: { findMany } } as unknown as PrismaService);
    await service.listDeveloperProjects('user-1', {
      limit: 25,
      status: ProjectStatus.PUBLISHED,
      q: 'Nova',
      cursor: Buffer.from(
        JSON.stringify({
          updatedAt: '2026-08-27T10:00:00.000Z',
          id: '40000000-0000-4000-8000-000000000001',
        }),
      ).toString('base64url'),
    });
    const calls = findMany.mock.calls as unknown as Array<
      Array<{ where: Record<string, unknown>; take: number }>
    >;
    expect(calls[0]?.[0]).toMatchObject({
      take: 26,
      where: {
        status: ProjectStatus.PUBLISHED,
        developerOrganization: {
          type: 'DEVELOPER',
          status: 'ACTIVE',
          memberships: { some: { userId: 'user-1' } },
        },
        AND: expect.arrayContaining([
          expect.objectContaining({ OR: expect.any(Array) as unknown }),
        ]) as unknown,
      },
    });
    const where = calls[0]?.[0]?.where as { AND: unknown[] };
    expect(where.AND).toHaveLength(2);
  });

  it('constrains the admin review queue to in-review projects', async () => {
    const findMany = jest.fn().mockResolvedValue([]);
    const service = new ProjectsService({ project: { findMany } } as unknown as PrismaService);
    await service.listAdminReviewQueue({ limit: 25 });
    const calls = findMany.mock.calls as unknown as Array<
      Array<{ where: { AND: Array<Record<string, unknown>> } }>
    >;
    expect(calls[0]?.[0]?.where.AND[0]).toEqual({ status: ProjectStatus.IN_REVIEW });
  });
});
