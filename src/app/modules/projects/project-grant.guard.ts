import { inject } from '@angular/core';
import { CanActivateFn, Router } from '@angular/router';
import { catchError, map, of } from 'rxjs';
import { AuthStore } from '@platform/auth/auth.store';
import { ProjectService } from './data/project.service';
import { ProjectAccessGrantService } from './data/project-access-grant.service';
import type { AccessArea, ProjectAccess } from './model/access-grant.model';
import { claimCheck, grantCovers, impliedCodes, isGrantAccess } from './model/project-access';

/**
 * crmp P1-B: `PermissionGuard` plus the grant. A grantee's token does not carry the codes a grant
 * implies (the backend admits them live), so a route that a grant opens passes when:
 *  - the token holds `data.permission` (members, as before); or
 *  - the route names a project (`:projectId` / `:id`) whose `myAccess` is a grant on `data.grantArea`
 *    that implies the code — covering `:stageId` when present, or any stage for a list route
 *    (`data.grantList`, whose rows the backend filters by the grant's stages); or
 *  - the route names no project (the Sites list, a survey) and one of the caller's Active grants is a
 *    whole-project grant on that area implying the code.
 * Otherwise → /403, like `PermissionGuard`. The backend still scopes every request.
 */
export const ProjectGrantGuard: CanActivateFn = (route) => {
  const auth = inject(AuthStore);
  const router = inject(Router);
  const permission = route.data['permission'] as string | undefined;
  if (!permission || auth.can(permission)) return true;
  const deny = router.createUrlTree(['/403']);
  const area = route.data['grantArea'] as AccessArea | undefined;
  if (!area) return deny;
  const list = route.data['grantList'] === true;
  const projectId = route.paramMap.get('projectId') ?? route.paramMap.get('id');
  const stageId = route.paramMap.get('stageId');

  const admits = (access: ProjectAccess | null | undefined): boolean => {
    if (!isGrantAccess(access)) return false;
    if (list)
      return access.areas.includes(area) && impliedCodes(area, access.level).includes(permission);
    return claimCheck(access, area, () => false, stageId)(permission);
  };

  if (projectId) {
    return inject(ProjectService)
      .getById(projectId)
      .pipe(
        map((p) => (admits(p.myAccess) ? true : deny)),
        catchError(() => of(deny)),
      );
  }
  return inject(ProjectAccessGrantService)
    .mine()
    .pipe(
      map((rows) =>
        rows.some(
          (g) =>
            g.status === 'Active' &&
            grantCovers({ source: 'Grant', ...g, expiresAtUtc: g.expiresAtUtc }, area) &&
            impliedCodes(area, g.level).includes(permission),
        )
          ? true
          : deny,
      ),
      catchError(() => of(deny)),
    );
};
