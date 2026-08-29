import { plainToInstance } from 'class-transformer';
import { validate } from 'class-validator';
import { PreferredLanguage } from '@prisma/client';
import { CreateLeadDto } from './create-lead.dto';

describe('CreateLeadDto', () => {
  it('normalizes common international phone formatting to E.164', async () => {
    const dto = plainToInstance(CreateLeadDto, {
      fullName: 'Ayşe Demir',
      phone: '00 90 (555) 111-22-33',
      preferredLanguage: PreferredLanguage.TR,
      currency: 'TRY',
      consentToDeveloper: true,
      consentVersion: 'kvkk-lead-v1',
    });
    expect(dto.phone).toBe('+905551112233');
    expect(await validate(dto)).toHaveLength(0);
  });

  it('rejects national-only and negative monetary input', async () => {
    const dto = plainToInstance(CreateLeadDto, {
      fullName: 'Test User',
      phone: '05551112233',
      preferredLanguage: PreferredLanguage.EN,
      budgetMin: '-1',
      currency: 'TRY',
      consentToDeveloper: true,
      consentVersion: 'v1',
    });
    const errors = await validate(dto);
    expect(errors.map(({ property }) => property)).toEqual(
      expect.arrayContaining(['phone', 'budgetMin']),
    );
  });

  it('trims consentVersion and rejects whitespace-only input', async () => {
    const valid = plainToInstance(CreateLeadDto, {
      fullName: 'Test User',
      phone: '+442071838750',
      preferredLanguage: PreferredLanguage.EN,
      currency: 'TRY',
      consentToDeveloper: true,
      consentVersion: '  kvkk-lead-v1  ',
    });
    expect(valid.consentVersion).toBe('kvkk-lead-v1');
    expect(await validate(valid)).toHaveLength(0);

    const empty = plainToInstance(CreateLeadDto, {
      ...valid,
      consentVersion: '   ',
    });
    expect((await validate(empty)).map(({ property }) => property)).toContain('consentVersion');
  });
});
