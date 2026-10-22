import { describe, expect, it } from 'vitest';
import { cryptoRandomPassword } from '@shared/ui/password';
import { meetsPasswordPolicy, policyPassword } from './password-policy';

/** 006b-2 #23: the client rule mirrors backend v3's `IdentityPasswordPolicy`. */
describe('password policy (006b-2 #23)', () => {
  it.each([
    ['Abcdef1!', true],
    ['abcdef1!', false], // no upper
    ['ABCDEF1!', false], // no lower
    ['Abcdefg!', false], // no digit
    ['Abcdefg1', false], // no symbol
    ['Ab1!', false], // too short
  ])('%s → %s', (password, ok) => {
    expect(meetsPasswordPolicy(password)).toBe(ok);
  });

  it('property: every generated password over 2000 samples meets the policy and is 16 long', () => {
    for (let i = 0; i < 2000; i++) {
      const pw = policyPassword();
      expect(pw).toHaveLength(16);
      expect(meetsPasswordPolicy(pw)).toBe(true);
    }
  });

  it('why the re-draw exists: cryptoRandomPassword(16) alone sometimes has no symbol', () => {
    // p(no symbol) ≈ (56/64)^16 ≈ 0.12 per draw, so 500 draws miss it with p ≈ 10^-28.
    const misses = Array.from({ length: 500 }, () => cryptoRandomPassword(16)).filter(
      (pw) => !meetsPasswordPolicy(pw),
    );
    expect(misses.length).toBeGreaterThan(0);
  });
});
