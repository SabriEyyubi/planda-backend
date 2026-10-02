import { Prisma } from '@prisma/client';
import { PrismaService } from '../../infrastructure/database/prisma.service';
import { LocationsService } from './locations.service';

describe('City catalog currencies', () => {
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
    const province = { id: 'city-1', code: '34', name: 'Istanbul', slug: 'istanbul' };
    const groupBy = jest.fn().mockResolvedValue(groups);
    const prisma = {
      province: {
        findUnique: jest.fn().mockResolvedValue(province),
        findUniqueOrThrow: jest.fn().mockResolvedValue(province),
      },
      project: { groupBy },
      $transaction: jest.fn((queries: Promise<unknown>[]): Promise<unknown[]> =>
        Promise.all(queries),
      ),
    } as unknown as PrismaService;
    const result = await new LocationsService(prisma).city('istanbul');
    expect(result).toEqual({ ...province, ...expected });
    expect(groupBy).toHaveBeenCalledWith({
      by: ['currency'],
      where: { provinceId: 'city-1', status: 'PUBLISHED' },
      _count: { _all: true },
      _min: { startingPrice: true },
    });
  });
});
