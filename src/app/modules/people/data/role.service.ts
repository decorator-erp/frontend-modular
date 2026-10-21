import { Injectable, inject } from '@angular/core';
import { Observable } from 'rxjs';
import { map, tap } from 'rxjs/operators';
import { RoleResponse } from '../model/people.model';
import { ApiService } from '@platform/http/api.service';
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

  getAll(): Observable<RoleResponse[]> {
    return this.get<unknown>('/roles').pipe(
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
   * Roles held by one user.
   *
   * Returns `200 []` for an UNKNOWN user, not 404 — the backend cannot tell "no such user" apart
   * from "user has no roles". An empty array is therefore not proof the user exists; do not render
   * it as a confident statement.
   */
  getUserRoles(userId: string): Observable<RoleResponse[]> {
    return this.get<unknown>(`/roles/users/${userId}`).pipe(
      map((response) => this.unwrapArray(response).map((role) => this.normalizeRole(role))),
    );
  }

  assignToUser(userId: string, roleId: string): Observable<void> {
    return this.post<void>(`/roles/${roleId}/users/${userId}`, {}).pipe(
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
