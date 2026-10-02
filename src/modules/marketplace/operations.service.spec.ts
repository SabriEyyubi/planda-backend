import { Prisma, UnitStatus } from '@prisma/client';
import { ConfigService } from '@nestjs/config';
import { AppException } from '../../common/exceptions/app.exception';
import { PrismaService } from '../../infrastructure/database/prisma.service';
import { MarketplaceService } from './marketplace.service';

const config = {
  getOrThrow: jest.fn(() => 'kvkk-lead-v1'),
} as unknown as ConfigService;

describe('MarketplaceService operations API', () => {
  it('rejects a unit update without a business field before opening a transaction', async () => {
    const transaction = jest.fn();
    const service = new MarketplaceService(
      { $transaction: transaction } as unknown as PrismaService,
      config,
    );

    await expect(
      service.updateUnit('user-1', 'project-1', 'unit-1', { expectedVersion: 1 }, {}),
    ).rejects.toMatchObject({ code: 'EMPTY_UPDATE' } satisfies Partial<AppException>);
    expect(transaction).not.toHaveBeenCalled();
  });

  it.each([
    ['unit', 'UNIT_NUMBER_CONFLICT'],
    ['payment plan', 'PAYMENT_PLAN_NAME_CONFLICT'],
  ] as const)('maps a duplicate %s to a stable conflict', async (kind, code) => {
    const uniqueError = new Prisma.PrismaClientKnownRequestError('unique', {
      code: 'P2002',
      clientVersion: '6.19.0',
    });
    const transactionClient = {
      $queryRaw: jest.fn().mockResolvedValue([{ currency: 'TRY' }]),
      project: {
        findFirst: jest.fn().mockResolvedValue({ developerOrganizationId: 'org-1' }),
      },
      unit: { create: jest.fn().mockRejectedValue(uniqueError) },
      paymentPlan: { create: jest.fn().mockRejectedValue(uniqueError) },
    };
    const service = new MarketplaceService(
      {
        $transaction: jest.fn((callback: (tx: typeof transactionClient) => Promise<unknown>) =>
          callback(transactionClient),
        ),
      } as unknown as PrismaService,
      config,
    );

    const operation =
      kind === 'unit'
        ? service.createUnit(
            'user-1',
            'project-1',
            {
              unitNumber: 'A-1',
              roomType: '2+1',
              netArea: '86.50',
              price: '8750000.0000',
              currency: 'TRY',
            },
            {},
          )
        : service.createPaymentPlan(
            'user-1',
            'project-1',
            { name: 'Plan A', downPaymentPercent: '30.00', termMonths: 24 },
            {},
          );

    await expect(operation).rejects.toMatchObject({ code, status: 409 });
  });

  it.each([
    ['unit', 'UNIT_NUMBER_CONFLICT'],
    ['payment plan', 'PAYMENT_PLAN_NAME_CONFLICT'],
  ] as const)('maps a duplicate %s rename to a stable conflict', async (kind, code) => {
    const uniqueError = new Prisma.PrismaClientKnownRequestError('unique', {
      code: 'P2002',
      clientVersion: '6.19.0',
    });
    const service = new MarketplaceService(
      {
        $transaction: jest.fn().mockRejectedValue(uniqueError),
      } as unknown as PrismaService,
      config,
    );

    const operation =
      kind === 'unit'
        ? service.updateUnit(
            'user-1',
            'project-1',
            'unit-1',
            { expectedVersion: 1, unitNumber: 'A-2' },
            {},
          )
        : service.updatePaymentPlan(
            'user-1',
            'project-1',
            'plan-1',
            { expectedVersion: 1, name: 'Plan B' },
            {},
          );

    await expect(operation).rejects.toMatchObject({ code, status: 409 });
  });

  it('keeps developer unit filters inside the tenant-scoped database predicate', async () => {
    const findMany = jest.fn().mockResolvedValue([]);
    const service = new MarketplaceService(
      { unit: { findMany } } as unknown as PrismaService,
      config,
    );
    await service.listUnits('user-1', '40000000-0000-4000-8000-000000000001', {
      limit: 25,
      status: UnitStatus.AVAILABLE,
      q: 'A-10',
      cursor: Buffer.from(
        JSON.stringify({
          updatedAt: '2026-08-27T10:00:00.000Z',
          id: '50000000-0000-4000-8000-000000000001',
        }),
      ).toString('base64url'),
    });
    const calls = findMany.mock.calls as unknown as Array<
      Array<{ where: Record<string, unknown>; take: number }>
    >;
    expect(calls[0]?.[0]).toMatchObject({
      take: 26,
      where: {
        projectId: '40000000-0000-4000-8000-000000000001',
        status: UnitStatus.AVAILABLE,
        project: {
          developerOrganization: {
            memberships: { some: { userId: 'user-1' } },
          },
        },
        AND: expect.arrayContaining([
          expect.objectContaining({ OR: expect.any(Array) as unknown }),
        ]) as unknown,
      },
    });
    const where = calls[0]?.[0]?.where as { AND: unknown[] };
    expect(where.AND).toHaveLength(2);
  });

  it('returns broker material metadata without selecting or exposing the internal URL', async () => {
    const findFirst = jest.fn().mockResolvedValue({
      materials: [
        {
          id: '50000000-0000-4000-8000-000000000001',
          title: 'Price list',
          kind: 'XLSX',
          language: 'EN',
          versionLabel: 'v14',
          fileSizeBytes: BigInt(1024),
          updatedAt: new Date('2026-08-27T10:00:00.000Z'),
        },
      ],
    });
    const service = new MarketplaceService(
      { project: { findFirst } } as unknown as PrismaService,
      config,
    );
    const result = await service.listBrokerMaterials('nova');
    expect(result[0]).toEqual({
      id: '50000000-0000-4000-8000-000000000001',
      title: 'Price list',
      kind: 'XLSX',
      language: 'EN',
      version: 'v14',
      fileSizeBytes: '1024',
      updatedAt: '2026-08-27T10:00:00.000Z',
    });
    const calls = findFirst.mock.calls as unknown as Array<
      Array<{ select: { materials: { select: Record<string, boolean> } } }>
    >;
    expect(calls[0]?.[0]?.select.materials.select).not.toHaveProperty('downloadUrl');
  });

  it('returns a stable conflict for a stale payment-plan version', async () => {
    const transactionClient = {
      paymentPlan: {
        findFirst: jest.fn().mockResolvedValue({
          id: '60000000-0000-4000-8000-000000000001',
          projectId: '40000000-0000-4000-8000-000000000001',
          name: 'Plan A',
          downPaymentPercent: new Prisma.Decimal('30.00'),
          deliveryPercent: new Prisma.Decimal('0.00'),
          termMonths: 24,
          monthlyPayment: null,
          totalPrice: null,
          cashDiscountPercent: null,
          timelineNote: null,
          isRecommended: true,
          version: 2,
          createdAt: new Date(),
          updatedAt: new Date(),
          project: { developerOrganizationId: '70000000-0000-4000-8000-000000000001' },
        }),
        updateMany: jest.fn().mockResolvedValue({ count: 0 }),
      },
    };
    const transaction = jest.fn(
      (callback: (tx: typeof transactionClient) => Promise<unknown>): Promise<unknown> =>
        callback(transactionClient),
    );
    const service = new MarketplaceService(
      {
        $transaction: transaction,
      } as unknown as PrismaService,
      config,
    );
    await expect(
      service.updatePaymentPlan(
        'user-1',
        '40000000-0000-4000-8000-000000000001',
        '60000000-0000-4000-8000-000000000001',
        { expectedVersion: 1, name: 'Plan B' },
        {},
      ),
    ).rejects.toMatchObject({
      code: 'PAYMENT_PLAN_CONCURRENCY_CONFLICT',
    } satisfies Partial<AppException>);
    expect(transactionClient.paymentPlan.updateMany).toHaveBeenCalledWith({
      where: expect.objectContaining({
        id: '60000000-0000-4000-8000-000000000001',
        projectId: '40000000-0000-4000-8000-000000000001',
        version: 1,
        project: {
          developerOrganization: expect.objectContaining({
            memberships: {
              some: {
                userId: 'user-1',
                role: { in: ['OWNER', 'ADMIN'] },
              },
            },
          }) as unknown,
        },
      }) as unknown,
      data: { name: 'Plan B', version: { increment: 1 } },
    });
  });
});
