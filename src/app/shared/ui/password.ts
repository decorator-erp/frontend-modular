/**
 * Crypto-strong temporary password from a printable alphabet.
 * Guarantees the classes PeraValidators.password checks (lower/upper/digit).
 */
export function cryptoRandomPassword(length = 16): string {
  const alphabet = 'ABCDEFGHJKLMNPQRSTUVWXYZabcdefghijkmnpqrstuvwxyz23456789!@#$%^&*';
  const bytes = new Uint32Array(length);
  crypto.getRandomValues(bytes);
  let out = Array.from(bytes, (b) => alphabet[b % alphabet.length]).join('');
  // Ensure at least one of each required class without losing randomness elsewhere.
  if (!/[a-z]/.test(out)) out = 'a' + out.slice(1);
  if (!/[A-Z]/.test(out)) out = out.slice(0, 1) + 'B' + out.slice(2);
  if (!/\d/.test(out)) out = out.slice(0, 2) + '7' + out.slice(3);
  return out;
}
