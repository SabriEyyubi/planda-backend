import { LeadStatus } from '@prisma/client';
import { canTransitionLead, requiresClosedReason } from './lead-policy';

describe('lead policy', () => {
  it('allows the forward MVP lifecycle and rejects reopening', () => {
    expect(canTransitionLead(LeadStatus.NEW, LeadStatus.CONTACTED)).toBe(true);
    expect(canTransitionLead(LeadStatus.CONTACTED, LeadStatus.QUALIFIED)).toBe(true);
    expect(canTransitionLead(LeadStatus.CLOSED, LeadStatus.NEW)).toBe(false);
  });

  it('requires a reason only when closing', () => {
    expect(requiresClosedReason(LeadStatus.CLOSED)).toBe(true);
    expect(requiresClosedReason(LeadStatus.CLOSED, 'Bütçe uygun değil')).toBe(false);
    expect(requiresClosedReason(LeadStatus.CONTACTED)).toBe(false);
  });
});
