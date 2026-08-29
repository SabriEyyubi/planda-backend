import { nextSessionExpiry, remainingSeconds } from './session-policy';

describe('session policy', () => {
  it('slides up to but never beyond the absolute deadline', () => {
    const now = new Date('2026-01-29T00:00:00.000Z');
    const absolute = new Date('2026-01-31T00:00:00.000Z');
    expect(nextSessionExpiry(now, 30 * 86400, absolute)).toEqual(absolute);
    expect(remainingSeconds(now, absolute)).toBe(2 * 86400);
  });
});
