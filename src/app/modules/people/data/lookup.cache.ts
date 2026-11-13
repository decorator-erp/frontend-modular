import { Injectable, inject } from '@angular/core';
import { Observable, of } from 'rxjs';
import { PERM, PermissionsService } from '@platform/permissions';
import { DepartmentResponse, RoleResponse } from '../model/people.model';
import { CachedQuery } from '@platform/http/cached-query';
import { DepartmentService } from './department.service';
import { RoleService } from './role.service';

/**
 * Session-level cache for slow-changing reference lookups.
 *
 * Departments and roles are fetched independently by many list/detail/dialog
 * screens on every `ngOnInit`. Routing those reads through this store means the
 * data is fetched once and shared (see {@link CachedQuery}); a mutation calls the
 * matching `invalidate*()` so the next read re-fetches.
 *
 * Migration: replace `inject(DepartmentService).getAll()` /
 * `inject(RoleService).getAll()` in components with `inject(LookupCache).departments()`
 * / `.roles()`, and call `invalidateDepartments()` / `invalidateRoles()` from the
 * components that create/update/delete those entities.
 */
@Injectable({ providedIn: 'root' })
export class LookupCache {
  private readonly departmentsApi = inject(DepartmentService);
  private readonly rolesApi = inject(RoleService);
  private readonly perms = inject(PermissionsService);

  private readonly departmentsQuery = new CachedQuery(() => this.departmentsApi.getAll());
  private readonly rolesQuery = new CachedQuery(() => this.rolesApi.getAll());

  /** UI-1: GET /api/departments needs departments.read — an empty list (no 403 toast) without it. */
  departments(): Observable<DepartmentResponse[]> {
    if (!this.perms.can(PERM.departments.read)) return of([]);
    return this.departmentsQuery.get();
  }

  /** UI-1: GET /api/roles needs roles.read — an empty list without it. */
  roles(): Observable<RoleResponse[]> {
    if (!this.perms.can(PERM.roles.read)) return of([]);
    return this.rolesQuery.get();
  }

  invalidateDepartments(): void {
    this.departmentsQuery.invalidate();
  }

  invalidateRoles(): void {
    this.rolesQuery.invalidate();
  }
}
