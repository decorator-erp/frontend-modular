import { Injectable } from '@angular/core';
import { Observable } from 'rxjs';
import { map } from 'rxjs/operators';
import { ApiService } from '@platform/http/api.service';
import { handled } from '@platform/http/handled-errors';
import {
  CreateAccessGrantRequest,
  LEVEL_INT,
  MyAccessGrant,
  ProjectAccessGrant,
  UpdateAccessGrantRequest,
  GRANT_STATUS_BY_INT,
  GrantStatus,
  areasToFlags,
  flagsToAreas,
  grantLevel,
  ids,
  rec,
  str,
} from '../model/access-grant.model';

// The list/mine read maps live with the service (a lazy chunk); `toProjectAccess`, which every
// project read needs, stays in the model.
function status(raw: unknown): GrantStatus {
  if (typeof raw === 'number') return GRANT_STATUS_BY_INT[raw] ?? 'Expired';
  if (typeof raw === 'string' && /^\d+$/.test(raw))
    return GRANT_STATUS_BY_INT[Number(raw)] ?? 'Expired';
  if (raw === 'Upcoming' || raw === 'Active' || raw === 'Expired' || raw === 'Revoked') return raw;
  return 'Expired';
}

function toProjectAccessGrant(source: unknown): ProjectAccessGrant {
  const r = rec(source);
  return {
    id: str(r['id']) ?? '',
    projectId: str(r['projectId']) ?? '',
    employeeId: str(r['employeeId']) ?? '',
    employeeName: str(r['employeeName']),
    level: grantLevel(r['level']),
    areas: flagsToAreas(r['areas']),
    stageIds: ids(r['stageIds']),
    startsAtUtc: str(r['startsAtUtc']) ?? '',
    expiresAtUtc: str(r['expiresAtUtc']),
    reason: str(r['reason']) ?? '',
    grantedById: str(r['grantedById']) ?? '',
    grantedAtUtc: str(r['grantedAtUtc']) ?? '',
    revokedAtUtc: str(r['revokedAtUtc']),
    revokedById: str(r['revokedById']),
    revokeReason: str(r['revokeReason']),
    status: status(r['status']),
  };
}

function toMyAccessGrant(source: unknown): MyAccessGrant {
  const r = rec(source);
  return {
    grantId: str(r['grantId']) ?? '',
    projectId: str(r['projectId']) ?? '',
    projectCode: str(r['projectCode']) ?? '',
    projectName: str(r['projectName']) ?? '',
    level: grantLevel(r['level']),
    areas: flagsToAreas(r['areas']),
    stageIds: ids(r['stageIds']),
    startsAtUtc: str(r['startsAtUtc']) ?? '',
    expiresAtUtc: str(r['expiresAtUtc']),
    reason: str(r['reason']) ?? '',
    status: status(r['status']),
  };
}

/**
 * crmp P1-B: project access grants — `/api/projects/{projectId}/access-grants` and
 * `/api/me/access-grants` (dms `ProjectAccessGrantEndpoints.cs:25-74`). Every project route needs
 * `project.read`; the handler then admits only a `project.manage_access` holder or a Manager by
 * membership (403 `projects.access_grants.NotAllowed`). The writes' refusals are shown by the caller
 * (`friendly(errorHandler.parse(err))`), so the global toast skips them.
 */
@Injectable({ providedIn: 'root' })
export class ProjectAccessGrantService extends ApiService {
  /** `GET …/access-grants`: every state, newest first (`:27`). 403/404 are the page's own states. */
  list(projectId: string): Observable<ProjectAccessGrant[]> {
    return this.get<unknown>(`/projects/${projectId}/access-grants`, undefined, {
      context: handled(403, 404),
    }).pipe(map((r) => this.unwrapArray(r).map((g) => toProjectAccessGrant(g))));
  }

  /** `POST …/access-grants` → 200 `{ grantId }` (`:36`). */
  create(projectId: string, req: CreateAccessGrantRequest): Observable<string> {
    return this.post<unknown>(
      `/projects/${projectId}/access-grants`,
      {
        employeeId: req.employeeId,
        level: LEVEL_INT[req.level],
        areas: areasToFlags(req.areas),
        stageIds: req.stageIds,
        startsAtUtc: req.startsAtUtc,
        expiresAtUtc: req.expiresAtUtc,
        reason: req.reason,
      },
      { context: handled(400, 403, 404, 409) },
    ).pipe(map((r) => this.unwrapId(r, 'grantId')));
  }

  /** `PUT …/access-grants/{grantId}` → 204 (`:46`); a revoked or expired grant is 409 NotEditable. */
  update(projectId: string, grantId: string, req: UpdateAccessGrantRequest): Observable<unknown> {
    return this.put(
      `/projects/${projectId}/access-grants/${grantId}`,
      {
        level: LEVEL_INT[req.level],
        areas: areasToFlags(req.areas),
        stageIds: req.stageIds,
        expiresAtUtc: req.expiresAtUtc,
        reason: req.reason,
      },
      { context: handled(400, 403, 404, 409) },
    );
  }

  /** `POST …/access-grants/{grantId}/revoke { reason? }` → 204 (`:56`). Final; effective next request. */
  revoke(projectId: string, grantId: string, reason?: string | null): Observable<unknown> {
    return this.post(
      `/projects/${projectId}/access-grants/${grantId}/revoke`,
      { reason: reason?.trim() || null },
      { context: handled(403, 404, 409) },
    );
  }

  /** `GET /api/me/access-grants` (`:67`, signed-in only): the caller's Active and Upcoming grants. */
  mine(): Observable<MyAccessGrant[]> {
    return this.get<unknown>('/me/access-grants').pipe(
      map((r) => this.unwrapArray(r).map((g) => toMyAccessGrant(g))),
    );
  }
}
