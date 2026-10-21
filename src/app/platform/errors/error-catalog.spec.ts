import { describe, expect, it } from 'vitest';
import { ERROR_MESSAGES, friendlyMessage } from './error-catalog';

/** 002b A5: the authentications family against backend remediation v3 (`AuthErrors.cs`). */
describe('ERROR_MESSAGES — authentications (002b A5)', () => {
  it.each([
    ['authentications.StaleToken', 'Your session is no longer valid. Please sign in again.'],
    ['authentications.LockedOut', 'Too many attempts. Try again in 15 minutes.'],
    ['authentications.RefreshTokenReused', 'Your session has ended. Please sign in again.'],
  ])('carries %s', (code, message) => {
    expect(ERROR_MESSAGES[code]).toBe(message);
    expect(friendlyMessage(code, 'fallback')).toBe(message);
  });

  it('no longer carries authentications.UserNotActive (deleted in the backend)', () => {
    expect('authentications.UserNotActive' in ERROR_MESSAGES).toBe(false);
  });
});
