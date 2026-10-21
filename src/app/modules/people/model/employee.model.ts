/**
 * Employee directory DTOs — the `EmployeeListItem`/`EmployeeFull` family read by
 * `EmployeeService`'s directory half. Moved out of `shared/api/models.ts` unchanged when
 * EmployeeDirectoryService was folded into core (core may not import from shared).
 *
 * Deliberately NOT reconciled with `EmployeeListResponse`/`EmployeeResponse` in
 * `core/models/index.ts` — they mirror the same endpoint with different field names
 * (`userId` vs `appUserId`) and only this family carries `trackKey`. Field-mapping the two
 * families is people-module work (plan 3.4), not dedup.
 */
/**
 * Mirrors `EmployeeProfile` — what `GET /api/employees` returns per row.
 *
 * `firstName`/`lastName` are gone: the wire sends a single `fullName`, composed in Identity.
 * `departments[]` and `roles[]` are gone too — HR holds no roles at all, and department membership
 * arrives as the scalar `primaryDepartmentId`. Join it against `LookupCache.departments()` for a
 * name; there is no `departmentName` on the wire.
 */
export interface EmployeeListItem {
  id: string;
  /** The Identity user id (`appUserId`) — what the role and permission routes key on. */
  userId: string;
  fullName: string;
  email: string;
  jobTitle: string;
  isActive: boolean;
  primaryDepartmentId: string | null;
  /** Render-only `@for` key — synthetic when the server omitted `id`. Never send it. */
  trackKey: string;
}

/**
 * Mirrors `EmployeeDetailResponse` — the 13 fields of `GET /api/employees/{id}` and
 * `/api/employees/me`. Strictly richer than the list item.
 *
 * No `userName`, `createdAt` or `lastLoginAt`: those live in Identity and no HR route exposes
 * them. No `emergencyContactName` either — its column was dropped by migration
 * `20260827091145_UpdateEmployeeEntity`.
 */
export interface EmployeeFull extends EmployeeListItem {
  contractType: string;
  phoneNumber: string | null;
  emergencyContactPhone: string | null;
  hireDate: string;
  endDate: string | null;
  notes: string | null;
}

/** Mirrors EmployeeOverviewResponse. */
export interface EmployeeOverview {
  employeeId: string;
  userId: string;
  fullName: string;
  email: string;
  jobTitle: string;
  isActive: boolean;
  stageTeamCount: number;
  projectCount: number;
  assignedTaskCount: number;
  activeStageCount: number;
}

/** Mirrors EmployeeProjectResponse. */
export interface EmployeeProjectRef {
  projectId: string;
  projectName: string;
  code: string;
  status: string;
  isHead: boolean;
  roles: string[];
}

/** Mirrors EmployeeTaskResponse. */
export interface EmployeeTaskRef {
  taskId: string;
  name: string;
  status: string;
  projectId: string;
  projectName: string;
  projectStageId: string | null;
  stageName: string | null;
  dueDate: string | null;
  /** Render-only `@for` key — synthetic when the server omitted `taskId`. Never send it. */
  trackKey: string;
}
