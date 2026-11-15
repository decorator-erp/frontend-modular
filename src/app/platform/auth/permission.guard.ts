import { inject } from '@angular/core';
import { CanActivateFn, Router } from '@angular/router';
import { AuthStore } from './auth.store';

export const PermissionGuard: CanActivateFn = (route) => {
  const authStore = inject(AuthStore);
  const router = inject(Router);
  // UI-1: a list means "any of these" (a page whose parts need different permissions).
  const permission = route.data['permission'] as string | string[] | undefined;
  const required = Array.isArray(permission) ? permission : permission ? [permission] : [];

  // `permission` is a live backend claim string (PERM.*) — check it directly.
  if (required.length === 0 || required.some((p) => authStore.can(p))) {
    return true;
  }

  router.navigate(['/403']);
  return false;
};
