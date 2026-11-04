import { Injectable, inject, isDevMode } from '@angular/core';
import { HttpContext } from '@angular/common/http';
import { Observable, of } from 'rxjs';
import { map, switchMap } from 'rxjs/operators';
import {
  CreateEmployeeRequest,
  EmployeeFull,
  EmployeeListItem,
  EmployeeListResponse,
  EmployeeOverview,
  EmployeeProjectRef,
  EmployeeQueryFilter,
  EmployeeResponse,
  EmployeeTaskRef,
} from '../model/people.model';
import { Paged } from '@platform/types/paged';
import { PagedResult } from '@platform/types/paged-result';
import { ApiService } from '@platform/http/api.service';
import { RoleService } from './role.service';

/** `GetEmployeesQueryValidator` caps `pageSize` at 200. See `listPaged` for why we honour it. */
const MAX_PAGE_SIZE = 200;
/** Bound on the auto-pagination loop: at most this many requests for one `listPaged` call. */
const MAX_PAGES = 5;
/** Hard ceiling on rows returned from one `listPaged` call. */
const MAX_ROWS = 1000;

interface RawPage {
  items: EmployeeListItem[];
  totalCount: number;
  pageNumber: number;
  totalPages: number;
}

interface Accumulated {
  items: EmployeeListItem[];
  totalCount: number;
  pageNumber: number;
  totalPages: number;
  truncated: boolean;
}

/** Fields `PUT /api/employees/{id}` actually binds. Nothing else on the entity is updatable. */
/**
 * `PUT /api/employees/{id}` is a FULL replacement in backend v3 (006b-2 #14): all six fields are
 * sent every time, and a cleared field is `null`, never `""` — `"endDate": ""` fails model binding
 * (`DateOnly?`, no lenient converter: a 400 on every save with a blank end date; 006 report V1).
 * `firstName`/`lastName` are optional, and only meaningful together (both or neither).
 */
export type EmployeePatch = {
  jobTitle: string;
  contractType: string;
  phoneNumber: string | null;
  emergencyContactPhone: string | null;
  notes: string | null;
  endDate: string | null;
  firstName?: string;
  lastName?: string;
};

/**
 * Employees: the HR write surface (create/update/activate/assign) and the directory reads
 * (`getMe`, `getFull`, `listPaged`, `byRole`, the overview/project/task refs) that used to live
 * in a second service, `shared/api/employee-directory.service.ts`.
 *
 * The two halves still speak DIFFERENT DTO families over the same endpoints:
 * `EmployeeListResponse`/`EmployeeResponse` (`appUserId`, no track key) for the write surface,
 * `EmployeeListItem`/`EmployeeFull` (`userId`, synthetic `trackKey`) for the directory reads.
 * Reconciling them is people-module work (plan 3.4) and deliberately NOT done here.
 *
 * Several directory methods have no backend at all and stay marked TODO(backend-gap) below.
 */
@Injectable({ providedIn: 'root' })
export class EmployeeService extends ApiService {
  private readonly roles = inject(RoleService);
  /**
   * `GET /api/employees`. Paging is optional server-side (defaults 1 / 50) but always sent here so
   * the page size is ours to choose. `pageSize` is capped at 200 by
   * `GetEmployeesQueryValidator` — dormant today, since no query validator actually runs, but
   * honoured regardless.
   */
  getAll(
    filter: EmployeeQueryFilter = {},
    pageNumber = 1,
    pageSize = 200,
  ): Observable<PagedResult<EmployeeListResponse>> {
    const params: Record<string, unknown> = { pageNumber, pageSize };
    if (filter.jobTitle) params['jobTitleFilter'] = filter.jobTitle;
    return this.get<unknown>('/employees', params).pipe(
      map((r) => this.normalizePaged(r, pageSize)),
    );
  }

  getById(id: string, options?: { context?: HttpContext }): Observable<EmployeeResponse> {
    return this.get<unknown>(`/employees/${id}`, undefined, options).pipe(
      map((r) => this.normalizeEmployeeResponse(this.unwrap(r))),
    );
  }

  /**
   * Creates the login and the employee record together.
   *
   * Department is a SECOND call: `CreateEmployeeCommand` binds no department field at all. The
   * employee exists either way — if the department assignment fails, the create still stands.
   */
  create(req: CreateEmployeeRequest, departmentId?: string | null): Observable<string> {
    return this.post<unknown>('/employees', req).pipe(
      map((r) => this.field<string>(this.unwrap(r), 'employeeId') ?? ''),
      switchMap((employeeId) =>
        employeeId && departmentId
          ? this.assignToDepartment(employeeId, departmentId).pipe(map(() => employeeId))
          : of(employeeId),
      ),
    );
  }

  /**
   * An edit on an INACTIVE employee answers 409 `employees.Inactive` since backend v3 — it used to
   * be a silent 204 (`UpdateEmployeeCommandHandler.cs:40–41`; `EmployeeErrors.cs:17`). Callers
   * still should not offer it; the edit dialog maps the code to a form message (006b-2 #14).
   */
  update(id: string, patch: EmployeePatch): Observable<void> {
    return this.put<void>(`/employees/${id}`, patch);
  }

  activate(id: string): Observable<void> {
    return this.post<void>(`/employees/${id}/activate`, {});
  }

  deactivate(id: string): Observable<void> {
    return this.post<void>(`/employees/${id}/deactivate`, {});
  }

  // There is no DELETE /api/employees/{id} in dms-modular — `employees.delete` is a declared
  // constant with no endpoint. `deactivate()` is the only removal path; the old `deleteEmployee()`
  // pointed at `/employees/{id}/delete`, which never existed here.

  assignToDepartment(employeeId: string, departmentId: string): Observable<void> {
    return this.post<void>(`/employees/${employeeId}/department/${departmentId}`, {});
  }

  private normalizePaged(
    response: unknown,
    requestedPageSize: number,
  ): PagedResult<EmployeeListResponse> {
    const value = this.unwrap<Record<string, unknown>>(response);
    return {
      items: this.unwrapArray(this.field<unknown>(value, 'items') ?? value).map((e) =>
        this.normalizeEmployee(e),
      ),
      totalCount: this.field<number>(value, 'totalCount') ?? 0,
      // The wire sends `pageNumber` (already 1-based); there is no `pageIndex` here.
      page: this.field<number>(value, 'pageNumber') ?? 1,
      pageSize: this.field<number>(value, 'pageSize') ?? requestedPageSize,
      totalPages: this.field<number>(value, 'totalPages') ?? 1,
    };
  }

  private normalizeEmployee(source: unknown): EmployeeListResponse {
    return {
      id: this.field<string>(source, 'id') ?? '',
      appUserId: this.field<string>(source, 'appUserId') ?? '',
      fullName: this.field<string>(source, 'fullName') ?? '',
      email: this.field<string | null>(source, 'email') ?? null,
      jobTitle: this.field<string>(source, 'jobTitle') ?? '',
      isActive: this.field<boolean>(source, 'isActive') ?? false,
      primaryDepartmentId: this.field<string | null>(source, 'primaryDepartmentId') ?? null,
    };
  }

  private normalizeEmployeeResponse(source: unknown): EmployeeResponse {
    return {
      ...this.normalizeEmployee(source),
      hireDate: this.field<string>(source, 'hireDate') ?? '',
      endDate: this.field<string | null>(source, 'endDate') ?? null,
      notes: this.field<string | null>(source, 'notes') ?? null,
      contractType: String(this.field(source, 'contractType') ?? ''),
      phoneNumber: this.field<string | null>(source, 'phoneNumber') ?? null,
      emergencyContactPhone: this.field<string | null>(source, 'emergencyContactPhone') ?? null,
    };
  }

  // ---- directory reads (folded in from shared/api/employee-directory.service.ts) ----
  /**
   * The signed-in user's own employee record.
   *
   * 404 means the caller has no employee record — a client user legitimately has none, so treat it
   * as an empty state, never an error. 403 means `employees.view_own` has not been granted: the
   * `Employee` role is seeded with NO permission claims (`DefaultRoles.FullAccessRoles` is admin
   * and manager only), so on a fresh environment this is the normal answer until an administrator
   * grants it. Both are "no profile to show", not failures.
   */
  getMe(opts: { context?: HttpContext } = {}): Observable<EmployeeFull> {
    // `opts.context` is opt-in (spec 002c): the profile page passes `handled(403)`.
    return this.get<unknown>('/employees/me', undefined, { context: opts.context }).pipe(
      map((r) => this.normalizeFull(this.unwrap(r))),
    );
  }

  getFull(id: string): Observable<EmployeeFull> {
    return this.get<unknown>(`/employees/${id}`).pipe(
      map((r) => this.normalizeFull(this.unwrap(r))),
    );
  }

  // TODO(backend-gap): no GET /api/employees/me/overview in dms-modular. Nothing aggregates an
  // employee's project/task/stage counts over HTTP.
  getMyOverview(): Observable<EmployeeOverview> {
    return this.get<unknown>('/employees/me/overview').pipe(
      map((r) => this.normalizeOverview(this.unwrap(r))),
    );
  }

  // TODO(backend-gap): no GET /api/employees/{id}/overview in dms-modular.
  getOverview(id: string): Observable<EmployeeOverview> {
    return this.get<unknown>(`/employees/${id}/overview`).pipe(
      map((r) => this.normalizeOverview(this.unwrap(r))),
    );
  }

  // TODO(backend-gap): no GET /api/employees/me/projects in dms-modular.
  getMineProjects(): Observable<EmployeeProjectRef[]> {
    return this.get<unknown>('/employees/me/projects').pipe(
      map((r) => this.unwrapArray(r).map((p) => this.normalizeProjectRef(p))),
    );
  }

  // TODO(backend-gap): no GET /api/employees/{id}/projects in dms-modular.
  getProjects(id: string): Observable<EmployeeProjectRef[]> {
    return this.get<unknown>(`/employees/${id}/projects`).pipe(
      map((r) => this.unwrapArray(r).map((p) => this.normalizeProjectRef(p))),
    );
  }

  // TODO(backend-gap): no GET /api/employees/me/tasks in dms-modular.
  getMineTasks(): Observable<EmployeeTaskRef[]> {
    return this.get<unknown>('/employees/me/tasks').pipe(
      map((r) => this.unwrapArray(r).map((t) => this.normalizeTaskRef(t))),
    );
  }

  // TODO(backend-gap): no GET /api/employees/{id}/tasks in dms-modular.
  getTasks(id: string): Observable<EmployeeTaskRef[]> {
    return this.get<unknown>(`/employees/${id}/tasks`).pipe(
      map((r) => this.unwrapArray(r).map((t) => this.normalizeTaskRef(t))),
    );
  }

  /**
   * The members of a role, as directory rows — `GET /api/roles/{roleId}/users` via
   * `RoleService.users()` (006b-1 #24; backend v3 added the route). A `UserListItem` is an
   * account, not an HR record: `id`/`userId`/`trackKey` are the user id, `fullName` is first +
   * last name (email when both are blank), and there is no job title or department on it.
   */
  byRole(roleId: string, page = 1, pageSize = 100): Observable<Paged<EmployeeListItem>> {
    return this.roles.users(roleId, page, pageSize).pipe(
      map((result) => ({
        items: result.items.map((u) => ({
          id: u.id,
          userId: u.id,
          fullName: `${u.firstName} ${u.lastName}`.trim() || u.email,
          email: u.email,
          jobTitle: '',
          isActive: u.isActive,
          primaryDepartmentId: null,
          trackKey: u.id,
        })),
        totalCount: result.totalCount,
        pageIndex: result.page,
        totalPages: result.totalPages,
        truncated: false,
      })),
    );
  }

  /**
   * Paged directory — `GET /api/employees`.
   *
   * Server filters: `pageNumber`, `pageSize`, `jobTitleFilter`. Nothing else. Name/email search,
   * department and role filters are all applied by the caller.
   *
   * AUTO-PAGINATION. Eleven call sites ask for `pageSize: 500`, eight of them in features outside
   * this migration's scope. Rather than edit those (which would silently truncate their pickers),
   * this method clamps each REQUEST to `MAX_PAGE_SIZE` and walks forward until the caller's
   * requested count is satisfied — 500 becomes at most three requests. The walk is bounded by
   * `MAX_PAGES` and `MAX_ROWS`; when a bound cuts the result short while the server still has more,
   * the returned page carries `truncated: true` and dev builds warn, so a short list is never
   * mistaken for a complete one.
   *
   * The 200 cap is LOAD-BEARING since backend v3 Phase 0: query validators run
   * (`ModuleCqrsRegistration.cs:128` decorates every query handler with
   * `ValidationDecorator.QueryHandler`), and `GetEmployeeProfilesQueryValidator` requires `pageSize`
   * in 1..200 (`GetEmployeeProfilesQueryHandler.cs:22`). A request above 200 answers 400, so the
   * clamp is what keeps a `pageSize=500` call site working.
   *
   * Inactive employees are hidden server-side unless `includeInactive=true` (v3 Phase 2;
   * `EmployeeEndpoints.cs:38–43`, `GetEmployeeProfilesQueryHandler.cs:44–47`; 006b-2 #10). The
   * client-side `isActive` narrowing is now a FALLBACK: it narrows what was fetched rather than
   * what was searched, so it only matters when `includeInactive` brought inactive rows back.
   */
  listPaged(
    opts: {
      page?: number;
      pageSize?: number;
      isActive?: boolean;
      jobTitle?: string;
      /**
       * Backend v3 hides inactive employees unless `includeInactive=true` (006b-2 #10). Pickers leave
       * it unset (active only); the list's *All* / *Inactive* filters set it. The client-side
       * `isActive` narrowing below stays as a fallback.
       */
      includeInactive?: boolean;
    } = {},
  ): Observable<Paged<EmployeeListItem>> {
    const startPage = Math.max(1, opts.page ?? 1);
    const wanted = Math.max(1, opts.pageSize ?? MAX_PAGE_SIZE);
    const target = Math.min(wanted, MAX_ROWS);

    return this.fetchFrom(startPage, target, MAX_PAGES, opts.jobTitle, opts.includeInactive).pipe(
      map((acc) => {
        const items =
          opts.isActive === undefined
            ? acc.items
            : acc.items.filter((e) => e.isActive === opts.isActive);

        if (acc.truncated && isDevMode()) {
          console.warn(
            `[directory] listPaged asked for ${wanted} rows but stopped at ${acc.items.length} ` +
              `(bounded at ${MAX_PAGES} requests / ${MAX_ROWS} rows). The server has ` +
              `${acc.totalCount}. The result is INCOMPLETE.`,
          );
        }

        return {
          items,
          totalCount: acc.totalCount,
          pageIndex: acc.pageNumber,
          totalPages: acc.totalPages,
          truncated: acc.truncated,
        };
      }),
    );
  }

  /** Walk pages forward until `remaining` is satisfied, the server runs out, or we hit the bound. */
  private fetchFrom(
    pageNumber: number,
    remaining: number,
    pagesLeft: number,
    jobTitle?: string,
    includeInactive?: boolean,
  ): Observable<Accumulated> {
    const params: Record<string, unknown> = {
      pageNumber,
      pageSize: Math.min(remaining, MAX_PAGE_SIZE),
    };
    if (jobTitle) params['jobTitleFilter'] = jobTitle;
    if (includeInactive) params['includeInactive'] = true;

    return this.get<unknown>('/employees', params).pipe(
      switchMap((response) => {
        const page = this.readPage(response, pageNumber);
        const stillWanted = remaining - page.items.length;
        const serverHasMore = pageNumber < page.totalPages;

        if (!serverHasMore || stillWanted <= 0) {
          return of({ ...page, truncated: false });
        }
        if (pagesLeft <= 1) {
          // Bound reached with rows still outstanding — say so rather than return a short list.
          return of({ ...page, truncated: true });
        }
        return this.fetchFrom(
          pageNumber + 1,
          stillWanted,
          pagesLeft - 1,
          jobTitle,
          includeInactive,
        ).pipe(
          map((rest) => ({
            items: [...page.items, ...rest.items],
            totalCount: rest.totalCount || page.totalCount,
            pageNumber: page.pageNumber,
            totalPages: rest.totalPages || page.totalPages,
            truncated: rest.truncated,
          })),
        );
      }),
    );
  }

  // ---- normalisation -------------------------------------------------------

  /** `PagedResult<T>` carries `pageNumber` — there is no `pageIndex` on the wire. */
  private readPage(response: unknown, requestedPage: number): RawPage {
    const value = this.unwrap<Record<string, unknown>>(response);
    return {
      items: this.unwrapArray(this.field<unknown>(value, 'items') ?? value).map((e) =>
        this.normalizeListItem(e),
      ),
      totalCount: this.field<number>(value, 'totalCount') ?? 0,
      pageNumber: this.field<number>(value, 'pageNumber') ?? requestedPage,
      totalPages: this.field<number>(value, 'totalPages') ?? 1,
    };
  }

  /** Mirrors `EmployeeProfile` — the list item. No name split, no department name, no roles. */
  normalizeListItem(source: unknown): EmployeeListItem {
    return {
      id: this.field<string>(source, 'id') ?? '',
      userId: this.field<string>(source, 'appUserId') ?? '',
      fullName: this.field<string>(source, 'fullName') ?? '',
      email: this.field<string>(source, 'email') ?? '',
      jobTitle: this.field<string>(source, 'jobTitle') ?? '',
      isActive: this.field<boolean>(source, 'isActive') ?? false,
      primaryDepartmentId: this.field<string | null>(source, 'primaryDepartmentId') ?? null,
      trackKey: this.trackKeyFor(source, 'EmployeeListItem.id', 'id'),
    };
  }

  /** Mirrors `EmployeeDetailResponse` — 13 fields, strictly richer than the list item. */
  private normalizeFull(source: unknown): EmployeeFull {
    return {
      ...this.normalizeListItem(source),
      contractType: String(this.field(source, 'contractType') ?? ''),
      phoneNumber: this.field<string | null>(source, 'phoneNumber') ?? null,
      emergencyContactPhone: this.field<string | null>(source, 'emergencyContactPhone') ?? null,
      hireDate: this.field<string>(source, 'hireDate') ?? '',
      endDate: this.field<string | null>(source, 'endDate') ?? null,
      notes: this.field<string | null>(source, 'notes') ?? null,
      // Absent on an older payload: assume the login is on rather than raise a false alarm.
      loginActive: this.field<boolean>(source, 'loginActive') ?? true,
    };
  }

  private normalizeOverview(source: unknown): EmployeeOverview {
    return {
      employeeId: this.field<string>(source, 'employeeId', 'id') ?? '',
      userId: this.field<string>(source, 'userId', 'appUserId') ?? '',
      fullName: this.field<string>(source, 'fullName') ?? '',
      email: this.field<string>(source, 'email') ?? '',
      jobTitle: this.field<string>(source, 'jobTitle') ?? '',
      isActive: this.field<boolean>(source, 'isActive') ?? false,
      stageTeamCount: this.num(this.field(source, 'stageTeamCount')),
      projectCount: this.num(this.field(source, 'projectCount')),
      assignedTaskCount: this.num(this.field(source, 'assignedTaskCount')),
      activeStageCount: this.num(this.field(source, 'activeStageCount')),
    };
  }

  private normalizeProjectRef(source: unknown): EmployeeProjectRef {
    return {
      projectId: this.field<string>(source, 'projectId', 'id') ?? '',
      projectName: this.field<string>(source, 'projectName', 'name') ?? '',
      code: this.field<string>(source, 'code') ?? '',
      status: String(this.field(source, 'status') ?? ''),
      isHead: this.field<boolean>(source, 'isHead') ?? false,
      roles: this.field<string[]>(source, 'roles') ?? [],
    };
  }

  private normalizeTaskRef(source: unknown): EmployeeTaskRef {
    return {
      taskId: this.field<string>(source, 'taskId', 'id') ?? '',
      name: this.field<string>(source, 'name') ?? '',
      status: String(this.field(source, 'status') ?? ''),
      projectId: this.field<string>(source, 'projectId') ?? '',
      projectName: this.field<string>(source, 'projectName') ?? '',
      projectStageId: this.field<string | null>(source, 'projectStageId') ?? null,
      stageName: this.field<string | null>(source, 'stageName') ?? null,
      dueDate: this.field<string | null>(source, 'dueDate') ?? null,
      trackKey: this.trackKeyFor(source, 'EmployeeTaskRef.taskId', 'taskId', 'id'),
    };
  }

  private num(v: unknown): number {
    const n = typeof v === 'string' ? parseFloat(v) : (v as number);
    return typeof n === 'number' && !isNaN(n) ? n : 0;
  }
}
