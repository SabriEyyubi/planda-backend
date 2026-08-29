import { ProjectStatus } from '@prisma/client';

export type ProjectActor = 'DEVELOPER' | 'ADMIN';

export function canTransitionProject(
  actor: ProjectActor,
  from: ProjectStatus,
  to: ProjectStatus,
): boolean {
  if (actor === 'DEVELOPER') return from === ProjectStatus.DRAFT && to === ProjectStatus.IN_REVIEW;
  return (
    (from === ProjectStatus.IN_REVIEW && to === ProjectStatus.PUBLISHED) ||
    (from === ProjectStatus.PUBLISHED && to === ProjectStatus.ARCHIVED)
  );
}
