import { Injectable, inject } from '@angular/core';
import { Observable, tap } from 'rxjs';
import { map } from 'rxjs/operators';
import {
  DenyPermissionRequest,
  EffectivePermissionsResponse,
  GrantPermissionRequest,
  ModulePermissionSet,
  PermissionResponse,
  RevokePermissionRequest,
} from '../model/people.model';
import { ApiService } from '@platform/http/api.service';
import { handled } from '@platform/http/handled-errors';
import { AuthStore } from '@platform/auth/auth.store';

/**
 * `/api/permissions` — the catalog, role-permission writes, and per-user overrides.
 *
 * Every `catchError` fallback chain is gone for the same reason as in `RoleService`: they guessed
 * at a second nonexistent URL and made failures surface as the wrong 404.
 *
 * OVERRIDES ARE NOT UPSERTS. A unique `(userId, permission)` index means a second grant or deny
 * for the same pair returns `PermissionOverrideAlreadyExists`. To flip a grant into a deny you
 * must `revoke()` first, then post the new one.
 */
@Injectable({ providedIn: 'root' })
export class PermissionService extends ApiService {
  private readonly authStore = inject(AuthStore);

  /**
   * The whole catalog, grouped by the module that declares each permission.
   *
   * Requires `roles.read` or `permissions.manage` server-side (backend v3, so a role editor can
   * read it too). Anyone else gets a 403: render a failure state, not an empty matrix.
   */
  getAll(): Observable<ModulePermissionSet[]> {
    // 403 is handled: the only caller renders the "needs roles.read or permissions.manage" state.
    return this.get<unknown>('/permissions', undefined, { context: handled(403) }).pipe(
      map((response) =>
        this.unwrapArray(response).map((set) => ({
          module: this.field<string>(set, 'module') ?? '',
          permissions: this.field<string[]>(set, 'permissions') ?? [],
        })),
      ),
    );
  }

  getRolePermissions(roleId: string): Observable<PermissionResponse[]> {
    return this.get<unknown>(`/permissions/roles/${roleId}`).pipe(
      map((response) =>
        this.unwrapArray(response).map((permission) => this.normalizePermission(permission)),
      ),
    );
  }

  getUserPermissions(userId: string): Observable<PermissionResponse[]> {
    return this.get<unknown>(`/permissions/users/${userId}`).pipe(
      map((response) =>
        this.unwrapArray(response).map((permission) => this.normalizePermission(permission)),
      ),
    );
  }

  getUserEffective(userId: string): Observable<EffectivePermissionsResponse> {
    return this.get<unknown>(`/permissions/users/${userId}/effective`).pipe(
      map((response) => this.normalizeEffective(this.unwrap(response))),
    );
  }

  /**
   * The caller's own effective set. `/me/effective` reads the user from the token; one route for
   * self (006b-1 #5b). `getUserEffective(id)` stays for the admin screen.
   */
  getMyEffective(): Observable<EffectivePermissionsResponse> {
    return this.get<unknown>('/permissions/me/effective').pipe(
      map((response) => this.normalizeEffective(this.unwrap(response))),
    );
  }

  /** Both ids are in the path; the body is empty. Gated on `roles.manage`, not `permissions.*`. */
  assignToRole(roleId: string, permission: string): Observable<void> {
    // 403 `CannotDelegate` is handled: the matrix shows the server's reason inline.
    return this.put<void>(
      `/permissions/roles/${roleId}/${encodeURIComponent(permission)}`,
      {},
      { context: handled(403) },
    );
  }

  removeFromRole(roleId: string, permission: string): Observable<void> {
    return this.delete<void>(
      `/permissions/roles/${roleId}/${encodeURIComponent(permission)}`,
      undefined,
      { context: handled(403) },
    );
  }

  /*
   * Override writes mark 403 handled (spec 002c): `CannotDelegate` and `SelfModification` are
   * explained by every caller — the override dialog's banner, the permissions page's own toast.
   */
  grant(req: GrantPermissionRequest): Observable<void> {
    return this.post<void>(
      `/permissions/users/${req.targetUserId}/overrides/grant`,
      {
        permission: req.permission,
        reason: req.reason ?? null,
        // `expiresAtUtc`, NOT `expiresAt`. The old name bound to null on the server, so every timed
        // override silently became permanent. The RESPONSE field really is `expiresAt` — the
        // asymmetry is the backend's, and `normalizeEffective` reads the response name.
        expiresAtUtc: req.expiresAt ?? null,
      },
      { context: handled(403) },
    ).pipe(tap(() => this.refreshSelf(req.targetUserId)));
  }

  deny(req: DenyPermissionRequest): Observable<void> {
    return this.post<void>(
      `/permissions/users/${req.targetUserId}/overrides/deny`,
      {
        permission: req.permission,
        reason: req.reason ?? null,
        expiresAtUtc: null,
      },
      { context: handled(403) },
    ).pipe(tap(() => this.refreshSelf(req.targetUserId)));
  }

  /** Deletes the override row outright; the user reverts to whatever their roles grant. */
  revoke(req: RevokePermissionRequest): Observable<void> {
    return this.delete<void>(
      `/permissions/users/${req.targetUserId}/overrides/${encodeURIComponent(req.permission)}`,
      undefined,
      { context: handled(403) },
    ).pipe(tap(() => this.refreshSelf(req.targetUserId)));
  }

  /** An override on YOUR OWN account must repair the token, or the UI and the API disagree. */
  private refreshSelf(targetUserId: string): void {
    if (targetUserId === this.authStore.user()?.userId) {
      void this.authStore.refreshPermissions();
    }
  }

  private normalizePermission(source: unknown): PermissionResponse {
    return {
      claimType: this.field<string>(source, 'claimType') ?? '',
      claimValue: this.field<string>(source, 'claimValue') ?? '',
      group: this.field<string>(source, 'group') ?? '',
      displayName: this.field<string>(source, 'displayName') ?? '',
      description: this.field<string | null>(source, 'description') ?? null,
    };
  }

  private normalizeEffective(source: unknown): EffectivePermissionsResponse {
    return {
      userId: this.field<string>(source, 'userId') ?? '',
      permissions: this.field<string[]>(source, 'permissions') ?? [],
      // Note: the server returns ALL override rows here, expired ones included, while the
      // `permissions` array above already excludes anything expired.
      overrides: this.unwrapArray(this.field<unknown>(source, 'overrides')).map((override) => ({
        id: this.field<string>(override, 'id') ?? '',
        permission: this.field<string>(override, 'permission') ?? '',
        isGranted: this.field<boolean>(override, 'isGranted') ?? false,
        grantedById: this.field<string>(override, 'grantedById') ?? '',
        reason: this.field<string | null>(override, 'reason') ?? null,
        expiresAt: this.field<string | null>(override, 'expiresAt') ?? null,
      })),
    };
  }
}
