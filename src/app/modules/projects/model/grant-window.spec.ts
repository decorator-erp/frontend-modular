import { describe, expect, it } from 'vitest';
import { localInputToUtc, presetEnd, utcToLocalInput } from './grant-window';

/** crmp P1-B: date-times are Cairo wall clock, sent as UTC Z. */
describe('grant window (crmp P1-B)', () => {
  it('reads a datetime-local value as Cairo time', () => {
    // Cairo is UTC+2 in December (no DST).
    expect(localInputToUtc('2026-12-01T12:00')).toBe('2026-12-01T10:00:00.000Z');
    expect(utcToLocalInput('2026-12-01T10:00:00Z')).toBe('2026-12-01T12:00');
    expect(localInputToUtc('')).toBeNull();
    expect(localInputToUtc('nope')).toBeNull();
    expect(utcToLocalInput(null)).toBe('');
  });

  it('presets run from the base', () => {
    const base = new Date('2026-11-08T10:00:00Z');
    expect(presetEnd('day', base)?.toISOString()).toBe('2026-11-09T10:00:00.000Z');
    expect(presetEnd('week', base)?.toISOString()).toBe('2026-11-15T10:00:00.000Z');
    expect(presetEnd('none', base)).toBeNull();
    expect(presetEnd('custom', base)).toBeNull();
  });
});
