import { LeadStatus } from '@prisma/client';

const transitions: Record<LeadStatus, readonly LeadStatus[]> = {
  NEW: [LeadStatus.CONTACTED, LeadStatus.CLOSED],
  CONTACTED: [LeadStatus.QUALIFIED, LeadStatus.CLOSED],
  QUALIFIED: [LeadStatus.CLOSED],
  CLOSED: [],
};

export function canTransitionLead(from: LeadStatus, to: LeadStatus): boolean {
  return from === to || transitions[from].includes(to);
}

export function requiresClosedReason(status: LeadStatus, reason?: string): boolean {
  return status === LeadStatus.CLOSED && !reason?.trim();
}
