import { LeadStatus, PreferredLanguage, Prisma } from '@prisma/client';
import { ConfigService } from '@nestjs/config';
import { createHash } from 'node:crypto';
import { AppException } from '../../common/exceptions/app.exception';
import { PrismaService } from '../../infrastructure/database/prisma.service';
import { CreateLeadDto } from './dto/create-lead.dto';
import { MarketplaceService } from './marketplace.service';

const config = {
  getOrThrow: jest.fn(() => 'kvkk-lead-v1'),
} as unknown as ConfigService;

const dto: CreateLeadDto = {
  fullName: ' Ayşe Demir ',
  phone: '+905551112233',
  email: 'AYSE@EXAMPLE.TEST',
  preferredLanguage: PreferredLanguage.TR,
  unitPreference: ' 2+1 ',
  budgetMin: '8000000.0000',
  budgetMax: '12000000.0000',
  currency: 'TRY',
  consentToDeveloper: true,
  consentVersion: 'kvkk-lead-v1',
};

function requestHash(): string {
  return createHash('sha256')
    .update(
      JSON.stringify({
        fullName: 'Ayşe Demir',
        phone: '+905551112233',
        email: 'ayse@example.test',
        preferredLanguage: PreferredLanguage.TR,
        unitPreference: '2+1',
        budgetMin: '8000000.0000',
        budgetMax: '12000000.0000',
        currency: 'TRY',
        consentToDeveloper: true,
        consentVersion: 'kvkk-lead-v1',
      }),
    )
    .digest('hex');
}

function lead(
  hash = requestHash(),
): Prisma.LeadGetPayload<{ include: { project: { select: { name: true } } } }> {
  const now = new Date('2026-08-27T10:00:00.000Z');
  return {
    id: '40000000-0000-4000-8000-000000000001',
    projectId: '30000000-0000-4000-8000-000000000001',
    buyerUserId: '20000000-0000-4000-8000-000000000001',
    idempotencyKey: 'lead-1',
    requestHash: hash,
    fullName: 'Ayşe Demir',
    phone: '+905551112233',
    email: 'ayse@example.test',
    preferredLanguage: PreferredLanguage.TR,
    unitPreference: '2+1',
    budgetMin: new Prisma.Decimal('8000000.0000'),
    budgetMax: new Prisma.Decimal('12000000.0000'),
    currency: 'TRY',
    consentVersion: 'kvkk-lead-v1',
    consentedAt: now,
    status: LeadStatus.NEW,
    closedReason: null,
    version: 1,
    createdAt: now,
    updatedAt: now,
    project: { name: 'Nova' },
  };
}

describe('MarketplaceService lead idempotency', () => {
  it('returns the original lead for the same scoped key and normalized payload', async () => {
    const findUnique = jest.fn().mockResolvedValue(lead());
    const create = jest.fn();
    const prisma = {
      project: { findFirst: jest.fn().mockResolvedValue({ id: 'p', name: 'Nova' }) },
      lead: { findUnique, create },
    } as unknown as PrismaService;
    const result = await new MarketplaceService(prisma, config).createLead(
      '20000000-0000-4000-8000-000000000001',
      '30000000-0000-4000-8000-000000000001',
      'lead-1',
      dto,
    );
    expect(result.id).toBe('40000000-0000-4000-8000-000000000001');
    expect(create).not.toHaveBeenCalled();
  });

  it('rejects reuse of the same project-scoped key with another payload', async () => {
    const prisma = {
      project: { findFirst: jest.fn().mockResolvedValue({ id: 'p', name: 'Nova' }) },
      lead: { findUnique: jest.fn().mockResolvedValue(lead('0'.repeat(64))) },
    } as unknown as PrismaService;
    await expect(
      new MarketplaceService(prisma, config).createLead(
        '20000000-0000-4000-8000-000000000001',
        '30000000-0000-4000-8000-000000000001',
        'lead-1',
        dto,
      ),
    ).rejects.toMatchObject({ code: 'IDEMPOTENCY_KEY_REUSED' } satisfies Partial<AppException>);
  });

  it('resolves a concurrent unique-key race to the one persisted lead', async () => {
    const findUnique = jest.fn().mockResolvedValueOnce(null).mockResolvedValueOnce(lead());
    const transaction = jest.fn<Promise<unknown>, [(tx: PrismaService) => Promise<unknown>]>();
    const prisma = {
      project: { findFirst: jest.fn().mockResolvedValue({ id: 'p', name: 'Nova' }) },
      lead: {
        findUnique,
        create: jest.fn().mockRejectedValue(
          new Prisma.PrismaClientKnownRequestError('unique', {
            code: 'P2002',
            clientVersion: '6.19.0',
          }),
        ),
      },
      projectEngagementDaily: { upsert: jest.fn() },
      $transaction: transaction,
    } as unknown as PrismaService;
    transaction.mockImplementation(
      (work: (tx: PrismaService) => Promise<unknown>): Promise<unknown> => work(prisma),
    );
    const result = await new MarketplaceService(prisma, config).createLead(
      '20000000-0000-4000-8000-000000000001',
      '30000000-0000-4000-8000-000000000001',
      'lead-1',
      dto,
    );
    expect(result.id).toBe('40000000-0000-4000-8000-000000000001');
    expect(findUnique).toHaveBeenCalledTimes(2);
  });

  it('rejects a stale client consent version before writing a lead', async () => {
    const projectFindFirst = jest.fn();
    const leadCreate = jest.fn();
    const prisma = {
      project: { findFirst: projectFindFirst },
      lead: { findUnique: jest.fn(), create: leadCreate },
    } as unknown as PrismaService;
    await expect(
      new MarketplaceService(prisma, config).createLead(
        '20000000-0000-4000-8000-000000000001',
        '30000000-0000-4000-8000-000000000001',
        'lead-1',
        { ...dto, consentVersion: 'kvkk-lead-v0' },
      ),
    ).rejects.toMatchObject({
      code: 'LEAD_CONSENT_VERSION_MISMATCH',
    } satisfies Partial<AppException>);
    expect(projectFindFirst).not.toHaveBeenCalled();
    expect(leadCreate).not.toHaveBeenCalled();
  });
});
