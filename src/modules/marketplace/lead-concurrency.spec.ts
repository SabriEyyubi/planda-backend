import { ConfigService } from '@nestjs/config';
import { LeadStatus } from '@prisma/client';
import { PrismaService } from '../../infrastructure/database/prisma.service';
import * as leadPolicy from './lead-policy';
import { MarketplaceService } from './marketplace.service';

function setup(status: LeadStatus = LeadStatus.NEW): {
  service: MarketplaceService;
  tx: {
    lead: {
      findFirst: jest.Mock;
      updateMany: jest.Mock;
      findFirstOrThrow: jest.Mock;
    };
    auditLog: { create: jest.Mock };
  };
} {
  const before = {
    id: 'lead-1',
    projectId: 'project-1',
    project: { name: 'Example', developerOrganizationId: 'org-1' },
    fullName: 'Example Buyer',
    phone: '+905550000001',
    email: null,
    preferredLanguage: 'TR',
    unitPreference: null,
    budgetMin: null,
    budgetMax: null,
    currency: 'TRY',
    closedReason: null,
    status,
    version: 3,
    createdAt: new Date('2026-09-26T00:00:00Z'),
    updatedAt: new Date('2026-09-26T00:00:00Z'),
  };
  const tx = {
    lead: {
      findFirst: jest.fn().mockResolvedValue(before),
      updateMany: jest.fn().mockResolvedValue({ count: 1 }),
      findFirstOrThrow: jest.fn().mockResolvedValue({
        ...before,
        status: LeadStatus.CONTACTED,
        version: 4,
      }),
    },
    auditLog: { create: jest.fn().mockResolvedValue({}) },
  };
  const service = new MarketplaceService(
    {
      $transaction: jest.fn((callback: (client: typeof tx) => Promise<unknown>) => callback(tx)),
    } as unknown as PrismaService,
    { getOrThrow: jest.fn(() => 'test-consent-v1') } as unknown as ConfigService,
  );
  return { service, tx };
}

describe('developer lead optimistic concurrency', () => {
  afterEach(() => jest.restoreAllMocks());

  it.each([2, 4])(
    'rejects mismatched version %s before transition policy or writes',
    async (expectedVersion) => {
      const { service, tx } = setup(LeadStatus.CLOSED);
      const transition = jest.spyOn(leadPolicy, 'canTransitionLead');
      const reason = jest.spyOn(leadPolicy, 'requiresClosedReason');
      await expect(
        service.updateDeveloperLead(
          'manager-1',
          'lead-1',
          { expectedVersion, status: LeadStatus.CONTACTED },
          {},
        ),
      ).rejects.toMatchObject({ code: 'LEAD_CONCURRENCY_CONFLICT', status: 409 });
      expect(transition).not.toHaveBeenCalled();
      expect(reason).not.toHaveBeenCalled();
      expect(tx.lead.updateMany).not.toHaveBeenCalled();
      expect(tx.auditLog.create).not.toHaveBeenCalled();
    },
  );

  it('updates a matching version using the atomic version and management scope', async () => {
    const { service, tx } = setup();
    const result = await service.updateDeveloperLead(
      'manager-1',
      'lead-1',
      { expectedVersion: 3, status: LeadStatus.CONTACTED },
      {},
    );
    expect(result).toMatchObject({ status: LeadStatus.CONTACTED, version: 4 });
    expect(tx.lead.updateMany).toHaveBeenCalledWith({
      where: {
        id: 'lead-1',
        version: 3,
        project: {
          developerOrganization: {
            type: 'DEVELOPER',
            status: 'ACTIVE',
            memberships: { some: { userId: 'manager-1', role: { in: ['OWNER', 'ADMIN'] } } },
          },
        },
      },
      data: { status: LeadStatus.CONTACTED, closedReason: null, version: { increment: 1 } },
    });
    expect(tx.auditLog.create).toHaveBeenCalledWith({
      data: expect.objectContaining({
        before: { status: LeadStatus.NEW, version: 3 },
        after: { status: LeadStatus.CONTACTED, version: 4 },
      }) as unknown,
    });
  });

  it('still rejects a write race after a matching initial read without auditing success', async () => {
    const { service, tx } = setup();
    tx.lead.updateMany.mockResolvedValue({ count: 0 });
    await expect(
      service.updateDeveloperLead(
        'manager-1',
        'lead-1',
        { expectedVersion: 3, status: LeadStatus.CONTACTED },
        {},
      ),
    ).rejects.toMatchObject({ code: 'LEAD_CONCURRENCY_CONFLICT', status: 409 });
    expect(tx.lead.findFirstOrThrow).not.toHaveBeenCalled();
    expect(tx.auditLog.create).not.toHaveBeenCalled();
  });

  it('retains transition validation when the version matches', async () => {
    const { service, tx } = setup(LeadStatus.CLOSED);
    await expect(
      service.updateDeveloperLead(
        'manager-1',
        'lead-1',
        { expectedVersion: 3, status: LeadStatus.CONTACTED },
        {},
      ),
    ).rejects.toMatchObject({ code: 'INVALID_LEAD_STATUS_TRANSITION', status: 422 });
    expect(tx.lead.updateMany).not.toHaveBeenCalled();
  });
});
