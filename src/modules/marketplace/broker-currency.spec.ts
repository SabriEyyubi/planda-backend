import { ConfigService } from '@nestjs/config';
import { Prisma, UnitStatus } from '@prisma/client';
import { PrismaService } from '../../infrastructure/database/prisma.service';
import { MarketplaceService } from './marketplace.service';

describe('Broker price denominations', () => {
  const updatedAt = new Date('2026-09-20T10:00:00.000Z');
  const config = { getOrThrow: jest.fn(() => 'consent-v1') } as unknown as ConfigService;

  it.each([
    { projectCurrency: 'TRY', unitCurrency: 'USD', unitOffer: null, expected: null },
    { projectCurrency: 'USD', unitCurrency: 'TRY', unitOffer: null, expected: null },
    { projectCurrency: 'TRY', unitCurrency: 'TRY', unitOffer: null, expected: '900.0000' },
    { projectCurrency: 'USD', unitCurrency: 'USD', unitOffer: null, expected: '900.0000' },
    { projectCurrency: 'TRY', unitCurrency: 'USD', unitOffer: '180.0001', expected: '180.0001' },
    { projectCurrency: 'USD', unitCurrency: 'TRY', unitOffer: '0', expected: '0.0000' },
  ])(
    'keeps project $projectCurrency and unit $unitCurrency offers separate ($unitOffer)',
    async ({ projectCurrency, unitCurrency, unitOffer, expected }) => {
      const unit: Prisma.UnitGetPayload<{ include: { brokerTerm: true } }> = {
        id: 'unit-1',
        projectId: 'project-1',
        unitNumber: 'A-1',
        block: null,
        floor: 1,
        roomType: '2+1',
        netArea: new Prisma.Decimal('80'),
        grossArea: null,
        price: new Prisma.Decimal('250.0001'),
        currency: unitCurrency,
        status: UnitStatus.AVAILABLE,
        orientation: null,
        floorPlanImageUrl: null,
        version: 1,
        createdAt: updatedAt,
        updatedAt,
        brokerTerm:
          unitOffer === null
            ? null
            : {
                unitId: 'unit-1',
                brokerPrice: new Prisma.Decimal(unitOffer),
                commissionPercent: null,
                updatedAt,
              },
      };
      const project = {
        id: 'project-1',
        name: 'Project',
        slug: 'project',
        currency: projectCurrency,
        startingPrice: new Prisma.Decimal('1000.0001'),
        developerOrganization: { name: 'Developer' },
        brokerOffer: {
          brokerPrice: new Prisma.Decimal('900'),
          commissionPercent: new Prisma.Decimal('3'),
          reservationHours: 24,
          salesContact: null,
          updatedAt,
        },
        units: [unit],
        _count: { materials: 0 },
        updatedAt,
      };
      const findFirst = jest.fn().mockResolvedValue(project);
      const findMany = jest.fn().mockResolvedValue([project]);
      const service = new MarketplaceService(
        { project: { findFirst, findMany } } as unknown as PrismaService,
        config,
      );
      const detail = await service.getBrokerProject('project');
      const list = await service.listBrokerProjects();
      for (const result of [detail, list[0]]) {
        expect(result).toMatchObject({
          currency: projectCurrency,
          publicStartingPrice: '1000.0001',
          brokerPrice: '900.0000',
        });
        expect(result?.units[0]).toMatchObject({
          currency: unitCurrency,
          price: '250.0001',
          brokerPrice: expected,
          commissionPercent: '3.00',
        });
      }
      const detailCalls = findFirst.mock.calls as unknown as Array<Array<{ where: unknown }>>;
      const listCalls = findMany.mock.calls as unknown as Array<Array<{ where: unknown }>>;
      expect(detailCalls[0]?.[0]?.where).toMatchObject({
        status: 'PUBLISHED',
        brokerOffer: { enabled: true },
        slug: 'project',
      });
      expect(listCalls[0]?.[0]?.where).toEqual({
        status: 'PUBLISHED',
        brokerOffer: { enabled: true },
      });
    },
  );

  it('does not substitute public starting price when broker price is absent', async () => {
    const project = {
      id: 'project-1',
      name: 'Project',
      slug: 'project',
      currency: 'USD',
      startingPrice: new Prisma.Decimal('1000'),
      developerOrganization: { name: 'Developer' },
      brokerOffer: { brokerPrice: null, updatedAt },
      units: [],
      _count: { materials: 0 },
      updatedAt,
    };
    const service = new MarketplaceService(
      { project: { findFirst: jest.fn().mockResolvedValue(project) } } as unknown as PrismaService,
      config,
    );
    await expect(service.getBrokerProject('project')).resolves.toMatchObject({
      currency: 'USD',
      publicStartingPrice: '1000.0000',
      brokerPrice: null,
    });
  });
});
