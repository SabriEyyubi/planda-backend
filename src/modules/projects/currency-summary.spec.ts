import { Prisma } from '@prisma/client';
import { PrismaService } from '../../infrastructure/database/prisma.service';
import { ProjectsService } from './projects.service';

describe('Project unit currency summaries', () => {
  const service = new ProjectsService({} as PrismaService);
  const unit = (
    currency: string,
    price: string,
    area = '80',
    roomType = '2+1',
  ): Parameters<ProjectsService['toUnitTypes']>[0][number] => ({
    roomType,
    currency,
    price: new Prisma.Decimal(price),
    netArea: new Prisma.Decimal(area),
    floor: null,
    orientation: null,
    floorPlanImageUrl: null,
  });

  it('keeps same-room TRY and USD counts, prices and areas separate', () => {
    const result = service['toUnitTypes']([
      unit('TRY', '7500000', '90'),
      unit('USD', '200000', '60'),
      unit('TRY', '6500000', '85'),
      unit('USD', '180000', '70'),
      unit('TRY', '9000000', '120', '3+1'),
    ]);
    expect(result).toHaveLength(3);
    expect(result).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          roomType: '2+1',
          currency: 'TRY',
          availableCount: 2,
          startingPrice: '6500000.0000',
          minNetArea: '85.00',
          maxNetArea: '90.00',
        }),
        expect.objectContaining({
          roomType: '2+1',
          currency: 'USD',
          availableCount: 2,
          startingPrice: '180000.0000',
          minNetArea: '60.00',
          maxNetArea: '70.00',
        }),
        expect.objectContaining({ roomType: '3+1', currency: 'TRY', availableCount: 1 }),
      ]),
    );
  });

  it('preserves empty and single-currency behavior and exact decimals', () => {
    expect(service['toUnitTypes']([])).toEqual([]);
    expect(service['toUnitTypes']([unit('USD', '1.0002'), unit('USD', '1.0001')])).toEqual([
      expect.objectContaining({ currency: 'USD', availableCount: 2, startingPrice: '1.0001' }),
    ]);
  });
});
