import { MembershipRole } from '@prisma/client';

export enum OrganizationCapability {
  PROJECT_READ = 'PROJECT_READ',
  PROJECT_MANAGE = 'PROJECT_MANAGE',
}

const ROLE_CAPABILITIES: Record<MembershipRole, ReadonlySet<OrganizationCapability>> = {
  OWNER: new Set([OrganizationCapability.PROJECT_READ, OrganizationCapability.PROJECT_MANAGE]),
  ADMIN: new Set([OrganizationCapability.PROJECT_READ, OrganizationCapability.PROJECT_MANAGE]),
  MEMBER: new Set([OrganizationCapability.PROJECT_READ]),
};

export function hasOrganizationCapability(
  role: MembershipRole,
  capability: OrganizationCapability,
): boolean {
  return ROLE_CAPABILITIES[role].has(capability);
}
