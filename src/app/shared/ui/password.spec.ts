import { describe, expect, it } from 'vitest';
import { cryptoRandomPassword } from './password';

/** The backend's rule: `Identity.Contracts/IdentityPasswordPolicy`. */
const acceptedByBackend = (p: string) =>
  p.length >= 8 && /[0-9]/.test(p) && /[a-z]/.test(p) && /[A-Z]/.test(p) && /[^A-Za-z0-9]/.test(p);

describe('cryptoRandomPassword (LC-2)', () => {
  it('always meets the backend password rule — the symbol was missing in ~1 of 8 before', () => {
    for (let i = 0; i < 2000; i++) {
      const p = cryptoRandomPassword(16);
      expect(p).toHaveLength(16);
      expect(acceptedByBackend(p), p).toBe(true);
    }
  });

  it('never goes below the backend minimum of 8 characters', () => {
    for (let i = 0; i < 200; i++) {
      const p = cryptoRandomPassword(4);
      expect(p).toHaveLength(8);
      expect(acceptedByBackend(p), p).toBe(true);
    }
  });

  it('is random: 500 draws are all different', () => {
    const seen = new Set(Array.from({ length: 500 }, () => cryptoRandomPassword(16)));
    expect(seen.size).toBe(500);
  });
});
