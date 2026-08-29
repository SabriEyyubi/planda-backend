import { plainToInstance } from 'class-transformer';
import { validate } from 'class-validator';
import { CreateUnitDto } from './upsert-inventory.dto';

const validUnit = {
  unitNumber: 'A-1',
  roomType: '2+1',
  netArea: '86.50',
  grossArea: '104.00',
  price: '8750000.0000',
  currency: 'TRY',
};

describe('CreateUnitDto', () => {
  it('accepts decimal values within database precision', async () => {
    expect(await validate(plainToInstance(CreateUnitDto, validUnit))).toHaveLength(0);
  });

  it.each([
    ['netArea', '123456789.00'],
    ['grossArea', '123456789.00'],
    ['price', '1234567890123456.0000'],
    ['netArea', '86.500'],
    ['price', '10.00000'],
  ])('rejects %s values outside database precision', async (field, value) => {
    const errors = await validate(plainToInstance(CreateUnitDto, { ...validUnit, [field]: value }));
    expect(errors.map(({ property }) => property)).toContain(field);
  });
});
