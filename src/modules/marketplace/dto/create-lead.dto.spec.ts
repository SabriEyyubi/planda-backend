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

describe('CreateLeadDto optional context', () => {
  const validLead = {
    fullName: 'Test Buyer',
    phone: '+905551112233',
    preferredLanguage: PreferredLanguage.TR,
    consentToDeveloper: true,
    consentVersion: 'v1',
    currency: 'TRY',
  };
  it('accepts a UUID plan and a message at the 1000-character boundary', async () => {
    const dto = plainToInstance(CreateLeadDto, {
      ...validLead,
      paymentPlanId: '60000000-0000-4000-8000-000000000001',
      message: 'x'.repeat(1000),
    });
    expect(await validate(dto)).toHaveLength(0);
  });
  it('rejects invalid plan IDs and oversized or non-text questions', async () => {
    for (const message of ['x'.repeat(1001), 42]) {
      const dto = plainToInstance(CreateLeadDto, {
        ...validLead,
        paymentPlanId: 'not-a-uuid',
        message,
      });
      expect((await validate(dto)).map(({ property }) => property)).toEqual(
        expect.arrayContaining(['paymentPlanId', 'message']),
      );
    }
  });
  it('rejects a caller-supplied plan-name snapshot with the API whitelist policy', async () => {
    const dto = plainToInstance(CreateLeadDto, { ...validLead, paymentPlanName: 'Forged plan' });
    expect(
      (await validate(dto, { whitelist: true, forbidNonWhitelisted: true })).map(
        ({ property }) => property,
      ),
    ).toContain('paymentPlanName');
  });
});
