import { MembershipRole } from '@prisma/client';
import { hasOrganizationCapability, OrganizationCapability } from './organization-permissions';

describe('organization permission policy', () => {
  it('allows OWNER and ADMIN to manage while MEMBER remains read-only', () => {
    expect(
      hasOrganizationCapability(MembershipRole.OWNER, OrganizationCapability.PROJECT_MANAGE),
    ).toBe(true);
    expect(
      hasOrganizationCapability(MembershipRole.ADMIN, OrganizationCapability.PROJECT_MANAGE),
    ).toBe(true);
    expect(
      hasOrganizationCapability(MembershipRole.MEMBER, OrganizationCapability.PROJECT_MANAGE),
    ).toBe(false);
    expect(
      hasOrganizationCapability(MembershipRole.MEMBER, OrganizationCapability.PROJECT_READ),
    ).toBe(true);
  });
});
