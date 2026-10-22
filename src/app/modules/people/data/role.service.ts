import { Injectable, inject } from '@angular/core';
import { HttpContext } from '@angular/common/http';
import { Observable } from 'rxjs';
import { map, tap } from 'rxjs/operators';
import { RoleResponse } from '../model/people.model';
import { UserListItem } from '../model/user.model';
import { PagedResult } from '@platform/types/paged-result';
import { UserService } from './user.service';
import { ApiService } from '@platform/http/api.service';
import { handled } from '@platform/http/handled-errors';
import { AuthStore } from '@platform/auth/auth.store';

/**
 * `/api/roles` — five role routes plus the three user-assignment routes.
 *
 * Every `catchError` fallback chain this service used to carry is gone. They were second guesses
 * at a second nonexistent URL (`/roles/create` then `/roles`, `/roles/update` then `/roles/{id}`),
 * and their only effect was to make a failure surface as the WRONG 404 — the second URL's, never
 * the real one's.
 */
@Injectable({ providedIn: 'root' })
export class RoleService extends ApiService {
  private readonly authStore = inject(AuthStore);
  private readonly usersApi = inject(UserService);

  /**
   * `opts.context` is opt-in (spec 002c): the permissions page's catalog load handles 403 itself
   * and passes `handled(403)`; the roles screen and `LookupCache` do not, and keep the toast.
   */
  getAll(opts: { context?: HttpContext } = {}): Observable<RoleResponse[]> {
    return this.get<unknown>('/roles', undefined, { context: opts.context }).pipe(
      map((response) => this.unwrapArray(response).map((role) => this.normalizeRole(role))),
    );
  }

  getById(roleId: string): Observable<RoleResponse> {
    return this.get<unknown>(`/roles/${roleId}`).pipe(
      map((response) => this.normalizeRole(this.unwrap(response))),
    );
  }

  /** `CreateRoleCommand` binds `name` ONLY — a description has to follow in an update. */
  create(name: string): Observable<{ roleId: string }> {
    return this.post<{ roleId: string }>('/roles', { name });
  }

  /**
   * `UpdateRoleRequest(Name, Description?)` — BOTH fields are bound and persisted.
   *
   * The old service sent neither `description` nor anything the backend recognised, so every
   * rename silently nulled the description. Callers must pass the current value through when they
   * are only changing the name.
   */
  update(roleId: string, name: string, description: string | null = null): Observable<void> {
    return this.put<void>(`/roles/${roleId}`, { name, description });
  }

  deleteRole(roleId: string): Observable<void> {
    return this.delete<void>(`/roles/${roleId}`);
  }

  /**
   * Roles held by one user — `GET /api/roles/users/{userId}`.
   *
   * Backend v3: authenticated, and the handler answers for yourself or with `roles.read`; anyone
   * else gets **404** `users.NotFound` (`GetUserRolesQueryHandler`), so no route gate is needed for
   * your own roles (006b-1 #19). The pre-v3 note that it returned `200 []` for an unknown user no
   * longer holds.
   */
  getUserRoles(userId: string): Observable<RoleResponse[]> {
    return this.get<unknown>(`/roles/users/${userId}`).pipe(
      map((response) => this.unwrapArray(response).map((role) => this.normalizeRole(role))),
    );
  }

  /**
   * Who holds a role — `GET /api/roles/{roleId}/users` (backend v3, `roles.read`), paged; an
   * unknown role answers 404 (006b-1 #18). Same `PagedResult<UserListItem>` as `/api/users`.
   */
  users(roleId: string, page = 1, pageSize = 50): Observable<PagedResult<UserListItem>> {
    return this.get<unknown>(`/roles/${roleId}/users`, { page, pageSize }).pipe(
      map((response) => this.usersApi.normalizePaged(response, pageSize)),
    );
  }

  assignToUser(userId: string, roleId: string): Observable<void> {
    // 403 `CannotDelegate` is handled: the assign-role dialog shows the reason inline.
    return this.post<void>(`/roles/${roleId}/users/${userId}`, {}, { context: handled(403) }).pipe(
      tap(() => this.refreshSelf(userId)),
    );
  }

  removeFromUser(userId: string, roleId: string): Observable<void> {
    return this.delete<void>(`/roles/${roleId}/users/${userId}`).pipe(
      tap(() => this.refreshSelf(userId)),
    );
  }

  /** A role change to YOUR OWN account must repair the token, or the UI and the API disagree. */
  private refreshSelf(userId: string): void {
    if (userId === this.authStore.user()?.userId) {
      void this.authStore.refreshPermissions();
    }
  }

  private normalizeRole(source: unknown): RoleResponse {
    return {
      id: this.field<string>(source, 'id') ?? '',
      name: this.field<string>(source, 'name') ?? '',
      description: this.field<string | null>(source, 'description') ?? null,
      isActive: this.field<boolean>(source, 'isActive') ?? true,
    };
  }
}
