import { ConfigService } from '@nestjs/config';
import { Prisma, UnitStatus } from '@prisma/client';
import { PrismaService } from '../../infrastructure/database/prisma.service';
import { MarketplaceService } from './marketplace.service';

function fixture(): {
  service: MarketplaceService;
  tx: {
    $queryRaw: jest.Mock;
    project: { findFirst: jest.Mock; update: jest.Mock };
    unit: {
      findFirst: jest.Mock;
      findFirstOrThrow: jest.Mock;
      create: jest.Mock;
      updateMany: jest.Mock;
      aggregate: jest.Mock;
    };
    auditLog: { create: jest.Mock };
  };
  transaction: jest.Mock;
  events: string[];
} {
  const events: string[] = [];
  const unit = {
    id: 'unit-1',
    projectId: 'project-1',
    unitNumber: 'A1',
    block: null,
    floor: null,
    roomType: '2+1',
    netArea: new Prisma.Decimal(90),
    grossArea: null,
    price: new Prisma.Decimal(100),
    currency: 'TRY',
    status: UnitStatus.AVAILABLE,
    orientation: null,
    floorPlanImageUrl: null,
    version: 1,
    updatedAt: new Date(),
    project: { developerOrganizationId: 'org-1' },
  };
  const tx = {
    $queryRaw: jest.fn().mockImplementation(() => {
      events.push('lock');
      return Promise.resolve([{ currency: 'TRY' }]);
    }),
    project: {
      findFirst: jest.fn().mockResolvedValue({ developerOrganizationId: 'org-1' }),
      update: jest.fn().mockImplementation(() => {
        events.push('summary');
        return Promise.resolve({});
      }),
    },
    unit: {
      findFirst: jest.fn().mockResolvedValue(unit),
      findFirstOrThrow: jest.fn().mockResolvedValue(unit),
      create: jest.fn().mockImplementation(() => {
        events.push('write');
        return Promise.resolve(unit);
      }),
      updateMany: jest.fn().mockImplementation(() => {
        events.push('write');
        return Promise.resolve({ count: 1 });
      }),
      aggregate: jest.fn().mockImplementation(() => {
        events.push('aggregate');
        return Promise.resolve({ _min: { price: new Prisma.Decimal(75) } });
      }),
    },
    auditLog: { create: jest.fn().mockResolvedValue({}) },
  };
  const transaction = jest.fn((callback: (client: typeof tx) => Promise<unknown>) => callback(tx));
  const service = new MarketplaceService(
    { $transaction: transaction } as unknown as PrismaService,
    { getOrThrow: jest.fn(() => 'test-consent-v1') } as unknown as ConfigService,
  );
  return { service, tx, transaction, events };
}

const createDto = {
  unitNumber: 'A1',
  roomType: '2+1',
  netArea: '90',
  price: '100',
  currency: 'TRY',
};

describe('inventory public price integrity', () => {
  it('serializes creation before deriving the available same-currency minimum', async () => {
    const { service, tx, transaction, events } = fixture();
    await service.createUnit('manager-1', 'project-1', createDto, {});
    expect(events).toEqual(['lock', 'write', 'aggregate', 'summary']);
    expect(transaction).toHaveBeenCalledWith(expect.any(Function), {
      isolationLevel: 'ReadCommitted',
    });
    const [sql, projectId] = tx.$queryRaw.mock.calls[0] as [TemplateStringsArray, string];
    expect(sql.join('?')).toContain('WHERE id = ?::uuid FOR UPDATE');
    expect(projectId).toBe('project-1');
    expect(tx.unit.aggregate).toHaveBeenCalledWith({
      where: { projectId: 'project-1', currency: 'TRY', status: 'AVAILABLE' },
      _min: { price: true },
    });
    expect(tx.project.update).toHaveBeenCalledWith({
      where: { id: 'project-1' },
      data: {
        startingPrice: new Prisma.Decimal(75),
        priceUpdatedAt: expect.any(Date) as unknown,
        stockUpdatedAt: expect.any(Date) as unknown,
      },
    });
  });

  it.each([
    { price: '50' },
    { status: UnitStatus.SOLD },
    { status: UnitStatus.AVAILABLE },
    { currency: 'USD' },
    { block: 'B' },
  ])(
    'recomputes the summary after update %j without overwriting unrelated project fields',
    async (change) => {
      const { service, tx, events } = fixture();
      await service.updateUnit(
        'manager-1',
        'project-1',
        'unit-1',
        { expectedVersion: 1, ...change },
        {},
      );
      expect(events).toEqual(['lock', 'write', 'aggregate', 'summary']);
      expect(tx.unit.aggregate).toHaveBeenCalledWith({
        where: { projectId: 'project-1', currency: 'TRY', status: 'AVAILABLE' },
        _min: { price: true },
      });
      expect(tx.unit.updateMany).toHaveBeenCalledWith({
        where: {
          id: 'unit-1',
          projectId: 'project-1',
          version: 1,
          project: {
            developerOrganization: {
              type: 'DEVELOPER',
              status: 'ACTIVE',
              memberships: { some: { userId: 'manager-1', role: { in: ['OWNER', 'ADMIN'] } } },
            },
          },
        },
        data: { ...change, version: { increment: 1 } },
      });
      const [update] = tx.project.update.mock.calls[0] as [{ data: Record<string, unknown> }];
      expect(Object.keys(update.data).sort()).toEqual([
        'priceUpdatedAt',
        'startingPrice',
        'stockUpdatedAt',
      ]);
      expect(update.data.startingPrice).toEqual(new Prisma.Decimal(75));
    },
  );

  it.each(['create', 'update'])(
    'retains editorial price but invalidates price freshness with no eligible stock on %s',
    async (operation) => {
      const { service, tx } = fixture();
      tx.unit.aggregate.mockResolvedValue({ _min: { price: null } });
      if (operation === 'create')
        await service.createUnit('manager-1', 'project-1', { ...createDto, currency: 'USD' }, {});
      else
        await service.updateUnit(
          'manager-1',
          'project-1',
          'unit-1',
          { expectedVersion: 1, status: UnitStatus.SOLD },
          {},
        );
      expect(tx.project.update).toHaveBeenCalledWith({
        where: { id: 'project-1' },
        data: {
          priceUpdatedAt: null,
          stockUpdatedAt: expect.any(Date) as unknown,
        },
      });
    },
  );

  it('does not aggregate or touch timestamps when the optimistic unit write loses a race', async () => {
    const { service, tx } = fixture();
    tx.unit.updateMany.mockResolvedValue({ count: 0 });
    await expect(
      service.updateUnit(
        'manager-1',
        'project-1',
        'unit-1',
        { expectedVersion: 1, price: '50' },
        {},
      ),
    ).rejects.toMatchObject({ code: 'UNIT_CONCURRENCY_CONFLICT' });
    expect(tx.unit.aggregate).not.toHaveBeenCalled();
    expect(tx.project.update).not.toHaveBeenCalled();
    expect(tx.auditLog.create).not.toHaveBeenCalled();
  });

  it('does not lock or mutate a project outside the authorized lookup', async () => {
    const { service, tx } = fixture();
    tx.project.findFirst.mockResolvedValue(null);
    await expect(service.createUnit('outsider', 'project-1', createDto, {})).rejects.toMatchObject({
      code: 'PROJECT_NOT_FOUND',
    });
    expect(tx.$queryRaw).not.toHaveBeenCalled();
    expect(tx.unit.create).not.toHaveBeenCalled();
  });
});
