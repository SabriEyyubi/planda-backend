import { ValidationPipe } from '@nestjs/common';
import {
  ConstructionStatus,
  OrganizationStatus,
  OrganizationType,
  Prisma,
  ProjectStatus,
} from '@prisma/client';
import { AppException } from '../../common/exceptions/app.exception';
import { PrismaService } from '../../infrastructure/database/prisma.service';
import { ProjectQueryDto, ProjectSort } from './dto/project-query.dto';
import { ProjectsService } from './projects.service';

describe('ProjectsService', () => {
  it.each(['TRY', 'USD'] as const)(
    'scopes monetary filters and sorting to %s',
    async (currency) => {
      const findMany = jest.fn().mockResolvedValue([]);
      const service = new ProjectsService({ project: { findMany } } as unknown as PrismaService);
      await service.listPublic({
        limit: 20,
        currency,
        minPrice: '0',
        maxPrice: '500000',
        maxMonthlyPayment: '5000',
        sort: ProjectSort.PRICE_ASC,
      });
      const calls = findMany.mock.calls as unknown as Array<Array<{ where: unknown }>>;
      expect(calls[0]?.[0]?.where).toMatchObject({
        currency,
        startingPrice: { gte: '0', lte: '500000' },
        paymentPlans: { some: { monthlyPayment: { not: null, lte: '5000' } } },
      });
    },
  );

  it.each([
    { minPrice: '0' },
    { maxPrice: '500000' },
    { maxMonthlyPayment: '5000' },
    { sort: ProjectSort.PRICE_ASC },
    { sort: ProjectSort.PRICE_DESC },
  ])('rejects unscoped monetary query %p', async (query) => {
    const findMany = jest.fn();
    const service = new ProjectsService({ project: { findMany } } as unknown as PrismaService);
    await expect(service.listPublic({ limit: 20, ...query })).rejects.toMatchObject({
      code: 'CURRENCY_REQUIRED',
      status: 400,
    });
    expect(findMany).not.toHaveBeenCalled();
  });

  it('accepts currency-only queries and keeps unfiltered newest cross-currency', async () => {
    const findMany = jest.fn().mockResolvedValue([]);
    const service = new ProjectsService({ project: { findMany } } as unknown as PrismaService);
    await service.listPublic({ limit: 20, currency: 'USD' });
    await service.listPublic({ limit: 20 });
    const calls = findMany.mock.calls as unknown as Array<
      Array<{ where: Record<string, unknown> }>
    >;
    expect(calls[0]?.[0]?.where.currency).toBe('USD');
    expect(calls[1]?.[0]?.where).not.toHaveProperty('currency');
  });

  it('validates supported query currencies at the API boundary', async () => {
    const pipe = new ValidationPipe({
      transform: true,
      whitelist: true,
      forbidNonWhitelisted: true,
    });
    for (const currency of ['TRY', 'USD']) {
      await expect(
        pipe.transform({ currency }, { type: 'query', metatype: ProjectQueryDto }),
      ).resolves.toMatchObject({ currency });
    }
    await expect(
      pipe.transform({ currency: 'EUR' }, { type: 'query', metatype: ProjectQueryDto }),
    ).rejects.toMatchObject({ status: 400 });
  });

  it('always constrains the public listing to published projects', async () => {
    const findMany = jest.fn().mockResolvedValue([]);
    const service = new ProjectsService({ project: { findMany } } as unknown as PrismaService);
    await service.listPublic({ limit: 20 });
    const calls = findMany.mock.calls as unknown as Array<Array<unknown>>;
    const options = calls[0]?.[0] as { where?: { status?: ProjectStatus } };
    expect(options.where?.status).toBe(ProjectStatus.PUBLISHED);
  });

  it('combines search, available-unit, payment and delivery filters deterministically', async () => {
    const findMany = jest.fn().mockResolvedValue([]);
    const service = new ProjectsService({ project: { findMany } } as unknown as PrismaService);
    await service.listPublic({
      limit: 20,
      q: 'Nova',
      currency: 'TRY',
      roomType: '2+1',
      minNetArea: '80.00',
      maxDownPaymentPercent: '30.00',
      maxMonthlyPayment: '300000.0000',
      deliveryReady: true,
      deliveryBefore: '2028-12-31',
      sort: ProjectSort.PRICE_ASC,
    });
    const calls = findMany.mock.calls as unknown as Array<
      Array<{ where: Record<string, unknown>; orderBy: unknown }>
    >;
    const options = calls[0]?.[0] as {
      where: Record<string, unknown>;
      orderBy: unknown;
    };
    expect(options.where).toMatchObject({
      status: ProjectStatus.PUBLISHED,
      constructionStatus: ConstructionStatus.READY,
      units: {
        some: {
          status: 'AVAILABLE',
          roomType: '2+1',
          netArea: { gte: '80.00' },
        },
      },
      paymentPlans: {
        some: {
          downPaymentPercent: { lte: '30.00' },
          monthlyPayment: { not: null, lte: '300000.0000' },
        },
      },
    });
    expect(options.where.AND).toEqual(
      expect.arrayContaining([expect.objectContaining({ OR: expect.any(Array) as unknown })]),
    );
    expect(options.orderBy).toEqual([{ startingPrice: 'asc' }, { id: 'asc' }]);
  });

  it('rejects invalid public numeric ranges before querying', async () => {
    const findMany = jest.fn();
    const service = new ProjectsService({ project: { findMany } } as unknown as PrismaService);
    await expect(
      service.listPublic({ limit: 20, currency: 'TRY', minPrice: '20.0000', maxPrice: '10.0000' }),
    ).rejects.toMatchObject({ code: 'INVALID_PRICE_RANGE' } satisfies Partial<AppException>);
    await expect(
      service.listPublic({ limit: 20, maxDownPaymentPercent: '101.00' }),
    ).rejects.toMatchObject({
      code: 'INVALID_DOWN_PAYMENT_FILTER',
    } satisfies Partial<AppException>);
    expect(findMany).not.toHaveBeenCalled();
  });

  it('binds the next cursor to the selected deterministic sort', async () => {
    type ProjectFixture = Prisma.ProjectGetPayload<{
      include: { province: true; district: true; developerOrganization: true };
    }>;
    const project = (id: string, price: string): ProjectFixture => ({
      id,
      developerOrganizationId: '10000000-0000-4000-8000-000000000001',
      name: 'Project',
      slug: `project-${id.slice(-1)}`,
      status: ProjectStatus.PUBLISHED,
      constructionStatus: ConstructionStatus.UNDER_CONSTRUCTION,
      provinceId: '20000000-0000-4000-8000-000000000001',
      districtId: '30000000-0000-4000-8000-000000000001',
      latitude: new Prisma.Decimal('41.000000'),
      longitude: new Prisma.Decimal('29.000000'),
      startingPrice: new Prisma.Decimal(price),
      currency: 'TRY',
      deliveryDate: new Date('2028-06-30'),
      summary: null,
      heroImageUrl: null,
      stockUpdatedAt: null,
      priceUpdatedAt: null,
      createdAt: new Date('2026-08-27T10:00:00.000Z'),
      updatedAt: new Date('2026-08-27T10:00:00.000Z'),
      version: 1,
      province: {
        id: 'p',
        code: 'TR-34',
        name: 'İstanbul',
        slug: 'istanbul',
        createdAt: new Date(),
        updatedAt: new Date(),
      },
      district: {
        id: 'd',
        provinceId: 'p',
        code: 'TR-34-X',
        name: 'İlçe',
        slug: 'ilce',
        createdAt: new Date(),
        updatedAt: new Date(),
      },
      developerOrganization: {
        id: 'o',
        name: 'Developer',
        slug: 'developer',
        type: OrganizationType.DEVELOPER,
        status: OrganizationStatus.ACTIVE,
        verifiedAt: new Date(),
        about: null,
        logoUrl: null,
        salesEmail: null,
        salesPhone: null,
        websiteUrl: null,
        version: 1,
        createdAt: new Date(),
        updatedAt: new Date(),
      },
    });
    const first = project('40000000-0000-4000-8000-000000000001', '10.0000');
    const second = project('40000000-0000-4000-8000-000000000002', '20.0000');
    const findMany = jest.fn().mockResolvedValueOnce([first, second]).mockResolvedValueOnce([]);
    const service = new ProjectsService({ project: { findMany } } as unknown as PrismaService);
    const page = await service.listPublic({
      limit: 1,
      currency: 'TRY',
      sort: ProjectSort.PRICE_ASC,
    });
    expect(page.pageInfo.nextCursor).not.toBeNull();
    await service.listPublic({
      limit: 1,
      currency: 'TRY',
      sort: ProjectSort.PRICE_ASC,
      cursor: page.pageInfo.nextCursor!,
    });
    const calls = findMany.mock.calls as unknown as Array<Array<{ where: { AND?: unknown[] } }>>;
    const nextWhere = calls[1]?.[0]?.where;
    expect(nextWhere?.AND).toEqual([
      {
        OR: [
          { startingPrice: { gt: '10.0000' } },
          {
            startingPrice: '10.0000',
            id: { gt: '40000000-0000-4000-8000-000000000001' },
          },
        ],
      },
    ]);
  });
});
