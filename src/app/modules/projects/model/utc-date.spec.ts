import { describe, expect, it } from 'vitest';
import { toUtcDate } from './utc-date';

describe('toUtcDate (crmp: dates are sent as UTC Z)', () => {
  it('sends a picked calendar day as that day at 00:00Z', () => {
    expect(toUtcDate('2026-11-07')).toBe('2026-11-07T00:00:00Z');
  });
  it('normalises an offset timestamp to Z', () => {
    expect(toUtcDate('2026-11-07T02:00:00+02:00')).toBe('2026-11-07T00:00:00.000Z');
  });
  it('maps empty and invalid values to null', () => {
    expect(toUtcDate('')).toBeNull();
    expect(toUtcDate(null)).toBeNull();
    expect(toUtcDate('not a date')).toBeNull();
  });
});
