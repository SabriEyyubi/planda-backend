export const SESSION_ABSOLUTE_TTL_SECONDS = 30 * 24 * 60 * 60;

export function nextSessionExpiry(
  now: Date,
  refreshTtlSeconds: number,
  absoluteExpiresAt: Date,
): Date {
  return new Date(Math.min(now.getTime() + refreshTtlSeconds * 1000, absoluteExpiresAt.getTime()));
}

export function remainingSeconds(now: Date, expiresAt: Date): number {
  return Math.max(0, Math.floor((expiresAt.getTime() - now.getTime()) / 1000));
}
