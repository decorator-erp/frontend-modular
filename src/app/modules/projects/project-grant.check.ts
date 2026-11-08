import { Injector } from '@angular/core';
import { ActivatedRouteSnapshot, UrlTree } from '@angular/router';
import { Observable, catchError, map, of } from 'rxjs';
import { ProjectService } from './data/project.service';
import { ProjectAccessGrantService } from './data/project-access-grant.service';
import type { AccessArea, ProjectAccess } from './model/access-grant.model';
import { claimCheck, grantCovers, impliedCodes, isGrantAccess } from './model/project-access';

/**
 * crmp P1-B: the grant half of `ProjectGrantGuard`, loaded only when the token lacks the code (a lazy
 * chunk, so the project services stay out of the initial bundle). See the guard for the rules.
 */
export function grantAdmits(
  injector: Injector,
  route: ActivatedRouteSnapshot,
  permission: string,
  deny: UrlTree,
): Observable<true | UrlTree> {
  const area = route.data['grantArea'] as AccessArea;
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
    return injector
      .get(ProjectService)
      .getById(projectId)
      .pipe(
        map((p) => (admits(p.myAccess) ? (true as const) : deny)),
        catchError(() => of(deny)),
      );
  }
  return injector
    .get(ProjectAccessGrantService)
    .mine()
    .pipe(
      map((rows) =>
        rows.some(
          (g) =>
            g.status === 'Active' &&
            grantCovers({ source: 'Grant', ...g }, area) &&
            impliedCodes(area, g.level).includes(permission),
        )
          ? (true as const)
          : deny,
      ),
      catchError(() => of(deny)),
    );
}
