import { Prisma } from '@prisma/client';
import { PrismaService } from '../../infrastructure/database/prisma.service';
import { DevelopersService } from './developers.service';

describe('Developer catalog currencies', () => {
  const cases = [
    {
      label: 'mixed TRY and USD',
      groups: [
        {
          currency: 'TRY',
          _count: { _all: 2 },
          _min: { startingPrice: new Prisma.Decimal('6500000') },
        },
        {
          currency: 'USD',
          _count: { _all: 1 },
          _min: { startingPrice: new Prisma.Decimal('200000') },
        },
      ],
      expected: { publishedProjectCount: 3, startingPrice: null, currency: null },
    },
    {
      label: 'only TRY',
      groups: [
        {
          currency: 'TRY',
          _count: { _all: 2 },
          _min: { startingPrice: new Prisma.Decimal('6500000.0001') },
        },
      ],
      expected: { publishedProjectCount: 2, startingPrice: '6500000.0001', currency: 'TRY' },
    },
    {
      label: 'only USD',
      groups: [
        {
          currency: 'USD',
          _count: { _all: 2 },
          _min: { startingPrice: new Prisma.Decimal('200000.0001') },
        },
      ],
      expected: { publishedProjectCount: 2, startingPrice: '200000.0001', currency: 'USD' },
    },
    {
      label: 'empty',
      groups: [],
      expected: { publishedProjectCount: 0, startingPrice: null, currency: null },
    },
  ];

  it.each(cases)('returns denomination-safe pricing for $label', async ({ groups, expected }) => {
    const organization = {
      id: 'developer-1',
      name: 'Developer',
      slug: 'developer',
      verifiedAt: null,
      about: null,
      logoUrl: null,
    };
    const groupBy = jest.fn().mockResolvedValue(groups);
    const findFirst = jest.fn().mockResolvedValue(organization);
    const prisma = {
      organization: { findFirst, findUniqueOrThrow: jest.fn().mockResolvedValue(organization) },
      project: { groupBy },
      $transaction: jest.fn((queries: Promise<unknown>[]): Promise<unknown[]> =>
        Promise.all(queries),
      ),
    } as unknown as PrismaService;
    const result = await new DevelopersService(prisma).detail('developer');
    expect(result).toEqual({ ...organization, ...expected });
    expect(findFirst).toHaveBeenCalledWith({
      where: { slug: 'developer', type: 'DEVELOPER', status: 'ACTIVE' },
      select: { id: true },
    });
    expect(groupBy).toHaveBeenCalledWith({
      by: ['currency'],
      where: { developerOrganizationId: 'developer-1', status: 'PUBLISHED' },
      _count: { _all: true },
      _min: { startingPrice: true },
    });
  });
});
