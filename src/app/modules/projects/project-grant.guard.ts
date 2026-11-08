import { Injector, inject } from '@angular/core';
import { CanActivateFn, Router } from '@angular/router';
import { firstValueFrom } from 'rxjs';
import { AuthStore } from '@platform/auth/auth.store';

/**
 * crmp P1-B: `PermissionGuard` plus the grant. A grantee's token does not carry the codes a grant
 * implies (the backend admits them live), so a route that a grant opens passes when:
 *  - the token holds `data.permission` (members, as before); or
 *  - the route names a project (`:projectId` / `:id`) whose `myAccess` is a grant on `data.grantArea`
 *    that implies the code — covering `:stageId` when present, or any stage for a list route
 *    (`data.grantList`, whose rows the backend filters by the grant's stages); or
 *  - the route names no project (the Sites list, a survey) and one of the caller's Active grants is a
 *    whole-project grant on that area implying the code.
 * Otherwise → /403, like `PermissionGuard`. The backend still scopes every request. The grant half
 * (`project-grant.check.ts`) is a lazy chunk, read only when the token lacks the code.
 */
export const ProjectGrantGuard: CanActivateFn = (route) => {
  const auth = inject(AuthStore);
  const router = inject(Router);
  const injector = inject(Injector);
  const permission = route.data['permission'] as string | undefined;
  if (!permission || auth.can(permission)) return true;
  const deny = router.createUrlTree(['/403']);
  if (!route.data['grantArea']) return deny;
  return import('./project-grant.check')
    .then((m) => firstValueFrom(m.grantAdmits(injector, route, permission, deny)))
    .catch(() => deny);
};
