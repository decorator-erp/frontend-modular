const LOWER = 'abcdefghijkmnpqrstuvwxyz';
const UPPER = 'ABCDEFGHJKLMNPQRSTUVWXYZ';
const DIGIT = '23456789';
const SYMBOL = '!@#$%^&*';
const ALPHABET = UPPER + LOWER + DIGIT + SYMBOL;

/** The backend's shortest accepted password (`IdentityPasswordPolicy.RequiredLength`). */
const MIN_LENGTH = 8;

/**
 * Crypto-strong temporary password from a printable alphabet, always accepted by the backend's rule
 * (`Identity.Contracts/IdentityPasswordPolicy`): 8+ characters with a lower-case and an upper-case
 * letter, a digit and a symbol.
 *
 * LC-2: it used to guarantee lower, upper and digit but not a symbol, so about one password in eight
 * was refused — a new client in the lead-convert wizard or Add client failed with "The user could not
 * be created". Each required class now takes its own random position, so one guarantee can never
 * overwrite another.
 */
export function cryptoRandomPassword(length = 16): string {
  const size = Math.max(length, MIN_LENGTH);
  const random = new Uint32Array(size * 2);
  crypto.getRandomValues(random);
  const pick = (set: string, i: number) => set[random[i] % set.length];

  const chars = Array.from({ length: size }, (_, i) => pick(ALPHABET, i));

  // Distinct positions for the four required classes: a partial Fisher–Yates over the indices.
  const positions = Array.from({ length: size }, (_, i) => i);
  for (let i = 0; i < 4; i++) {
    const j = i + (random[size + i] % (size - i));
    [positions[i], positions[j]] = [positions[j], positions[i]];
  }
  [LOWER, UPPER, DIGIT, SYMBOL].forEach((set, k) => {
    chars[positions[k]] = pick(set, size + 4 + k);
  });
  return chars.join('');
}
