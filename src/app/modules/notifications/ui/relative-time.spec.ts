import { formatAbsolute, formatRelative } from './relative-time';

describe('relative-time', () => {
  it('formats a past instant as a relative "ago" string', () => {
    // 3 hours ago relative to real now → dayjs renders "3 hours ago".
    const threeHoursAgo = new Date(Date.now() - 3 * 60 * 60 * 1000).toISOString();
    expect(formatRelative(threeHoursAgo)).toMatch(/ago$/);
  });

  it('formats an absolute local timestamp deterministically', () => {
    // Fixed instant → stable formatted output (local tz independent of the date parts asserted).
    expect(formatAbsolute('2026-07-08T09:12:44Z')).toMatch(/2026/);
    expect(formatAbsolute('2026-07-08T09:12:44Z')).toMatch(/(AM|PM)$/);
  });
});
