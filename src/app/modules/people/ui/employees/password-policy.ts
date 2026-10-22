import { cryptoRandomPassword } from '@shared/ui/password';

/**
 * Backend v3's password policy, mirrored (006b-2 #23): `Identity.Contracts/IdentityPasswordPolicy`
 * — 8+ characters, an ASCII digit, lower, upper, and a non-alphanumeric character. A create whose
 * password fails any of it answers `employees.WeakPassword`.
 */
export function meetsPasswordPolicy(password: string): boolean {
  return (
    password.length >= 8 &&
    /[0-9]/.test(password) &&
    /[a-z]/.test(password) &&
    /[A-Z]/.test(password) &&
    /[^A-Za-z0-9]/.test(password)
  );
}

/**
 * A temporary password the server will accept. `cryptoRandomPassword(16)` guarantees lower, upper
 * and digit but NOT a symbol (roughly one draw in eight has none), so draw again until the policy
 * holds. The bound is never reached in practice (each draw passes with p ≈ 0.88).
 */
export function policyPassword(): string {
  for (let attempt = 0; attempt < 64; attempt++) {
    const candidate = cryptoRandomPassword(16);
    if (meetsPasswordPolicy(candidate)) return candidate;
  }
  // Unreachable in practice; guarantee a symbol rather than send a password that must fail.
  return cryptoRandomPassword(15) + '!';
}
