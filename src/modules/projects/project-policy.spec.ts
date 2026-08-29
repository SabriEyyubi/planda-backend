import { ProjectStatus } from '@prisma/client';
import { canTransitionProject } from './project-policy';

describe('project status policy', () => {
  it('allows only developer submission for review', () => {
    expect(canTransitionProject('DEVELOPER', ProjectStatus.DRAFT, ProjectStatus.IN_REVIEW)).toBe(
      true,
    );
    expect(canTransitionProject('DEVELOPER', ProjectStatus.DRAFT, ProjectStatus.PUBLISHED)).toBe(
      false,
    );
    expect(canTransitionProject('DEVELOPER', ProjectStatus.IN_REVIEW, ProjectStatus.DRAFT)).toBe(
      false,
    );
  });
  it('allows the locked admin publication lifecycle', () => {
    expect(canTransitionProject('ADMIN', ProjectStatus.IN_REVIEW, ProjectStatus.PUBLISHED)).toBe(
      true,
    );
    expect(canTransitionProject('ADMIN', ProjectStatus.PUBLISHED, ProjectStatus.ARCHIVED)).toBe(
      true,
    );
    expect(canTransitionProject('ADMIN', ProjectStatus.DRAFT, ProjectStatus.PUBLISHED)).toBe(false);
  });
});
