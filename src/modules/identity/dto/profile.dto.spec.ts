import { plainToInstance } from 'class-transformer';
import { validate } from 'class-validator';
import { PreferredLanguage } from '@prisma/client';
import { UpdateProfileDto } from './profile.dto';

describe('UpdateProfileDto', () => {
  it('normalizes international phone and currency', async () => {
    const dto = plainToInstance(UpdateProfileDto, {
      fullName: '  Ada Lovelace  ',
      phone: '00 90 (555) 111-2233',
      preferredLanguage: PreferredLanguage.EN,
      preferredCurrency: ' usd ',
    });
    expect(await validate(dto)).toEqual([]);
    expect(dto).toMatchObject({
      fullName: 'Ada Lovelace',
      phone: '+905551112233',
      preferredCurrency: 'USD',
    });
  });

  it.each([{ phone: '05551112233' }, { preferredCurrency: 'EURO' }, { fullName: 'A' }])(
    'rejects invalid profile input %#',
    async (input) => {
      expect(await validate(plainToInstance(UpdateProfileDto, input))).not.toHaveLength(0);
    },
  );
});
