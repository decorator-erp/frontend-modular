import { inject } from '@angular/core';
import { CanActivateFn, Router } from '@angular/router';
import { AuthStore } from './auth.store';
import { PERM } from '../permissions/permissions.constants';

/**
 * The office shell's away-guard (T107, FR-038) — a Client-role user must never reach
 * it. This **mirrors, never replaces** the server's own scoping (every office read the
 * shell renders is independently gated server-side); it exists so a client landing on
 * an office URL by habit or a stale bookmark bounces to their own shell instead of a
 * screen that would 403 field-by-field.
 */
export const NotClientGuard: CanActivateFn = () => {
  const auth = inject(AuthStore);
  const router = inject(Router);

  if (auth.isClient()) {
    router.navigate(['/portal']);
    return false;
  }
  return true;
};

/**
 * The mirror image, on the client shell's own root: a caller without the client
 * portal capability (an office user, or an unauthenticated one past `AuthGuard`) must
 * not land inside `/portal` — it renders against portal-scoped stores that assume a
 * portal-eligible caller. Gated on the `crm.portal` capability rather than the Client
 * role, so portal eligibility is a grantable permission, not a hardcoded role check.
 */
export const ClientOnlyGuard: CanActivateFn = () => {
  const auth = inject(AuthStore);
  const router = inject(Router);

  if (!auth.can(PERM.crm.portal)) {
    router.navigate(['/dashboard']);
    return false;
  }
  return true;
};
