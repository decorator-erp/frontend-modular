// The people slice of the old `core/models/index.ts` at SOURCE_SHA (spec 006): lines 25–85 and
// 116–203, byte-for-byte, plus its `export * from './employee.model'` line. The client slice
// (87–114) belongs to 005; the auth DTOs (1–23) were ported to `platform/auth` at 002.

// Sync W2-11: `/api/users` exists now (dms Identity UserEndpoints.cs — `GET /api/users`, paged
// `PagedResult<UserListItem>`, read by `UserService`), and `GET /api/roles/{roleId}/users` lists a
// role's members (`RoleService.users()`). User records are still created through POST
// /api/employees and POST /api/clients. The old UserListResponse / DetailedUserResponse /
// AddUserRequest / UpdateUserRequest shapes that used to sit here stay deleted.

/** `EmployeeProfile` — one row of `GET /api/employees`. */
export interface EmployeeListResponse {
  id: string;
  appUserId: string;
  /** `firstName`/`lastName` are not on the wire; Identity composes a single display name. */
  fullName: string;
  email: string | null;
  jobTitle: string;
  isActive: boolean;
  /** Was `departmentId`. There is no `departmentName` — join `LookupCache.departments()`. */
  primaryDepartmentId: string | null;
}

/** `EmployeeDetailResponse` — the 13 fields of `GET /api/employees/{id}` and `/me`. */
export interface EmployeeResponse extends EmployeeListResponse {
  hireDate: string;
  endDate: string | null;
  notes: string | null;
  /** `"FullTime" | "PartTime" | "Contract" | "Internship"` — the enum NAME, never the int. */
  contractType: string;
  phoneNumber: string | null;
  emergencyContactPhone: string | null;
}

/**
 * `CreateEmployeeCommand`. Creates the Identity login and the HR record in one call.
 *
 * Dropped from the old shape because the backend binds none of them: `userName`, `roleId`
 * (the handler always assigns the `Employee` role), `departmentId` (a separate second call —
 * see `EmployeeService.create`), `grantPermissions` and `denyPermissions`.
 */
export interface CreateEmployeeRequest {
  email: string;
  password: string;
  firstName: string;
  lastName: string;
  jobTitle: string;
  /** Required. `"YYYY-MM-DD"`, and must fall between 50 years ago and a year from now. */
  hireDate: string;
  /** The enum NAME (`"FullTime"`), not the integer the old dialog sent. */
  contractType: string;
  phoneNumber?: string | null;
  emergencyContactPhone?: string | null;
  notes?: string | null;
}

/** `jobTitleFilter` is the ONLY server-side filter. Everything else is applied client-side. */
export interface EmployeeQueryFilter {
  jobTitle?: string;
}

/**
 * The wire sends exactly these five fields.
 *
 * No `createdAt` — the entity has `CreatedAtUtc` but the DTO never projects it, and neither
 * department nor employee responses expose any timestamp. No `departmentHead` OBJECT either: the
 * head is the scalar `departmentHeadId`, and `Department` has no navigation property for it.
 */
export interface DepartmentResponse {
  id: string;
  name: string;
  description: string | null;
  departmentHeadId: string | null;
  isActive: boolean;
  /** Backend v3 (`DepartmentResponse.HeadName`): the head's display name, or null (006b-2 #22). */
  headName: string | null;
  /** Backend v3: active members who are active employees (006b-2 #22). */
  memberCount: number;
}
export interface CreateDepartmentRequest {
  name: string;
  description?: string;
}
export interface UpdateDepartmentRequest {
  name: string;
  description?: string;
}
export interface DepartmentUserRequest {
  userId: string;
}

export interface RoleResponse {
  id: string;
  /** Was `roleName`. The wire field is `name`. */
  name: string;
  description: string | null;
  isActive: boolean;
}

/** `GET /api/permissions` — the catalog, grouped by the module that declares each permission. */
export interface ModulePermissionSet {
  module: string;
  permissions: string[];
}

/**
 * A permission as returned by `GET /api/permissions/roles/{roleId}` and
 * `GET /api/permissions/users/{userId}`.
 *
 * Carries NO `id`, NO `roleId` and NO `name` — the permission string itself lives in
 * `claimValue`, and that is the identity to match on and to send back in a write.
 * `claimType` is always the literal `"permissions"`.
 */
export interface PermissionResponse {
  claimType: string;
  claimValue: string;
  group: string;
  displayName: string;
  description: string | null;
}
export interface GrantPermissionRequest {
  targetUserId: string;
  permission: string;
  reason?: string;
  expiresAt?: string;
}
export interface DenyPermissionRequest {
  targetUserId: string;
  permission: string;
  reason?: string;
}
export interface RevokePermissionRequest {
  targetUserId: string;
  permission: string;
}
export interface EffectivePermissionsResponse {
  userId: string;
  permissions: string[];
  overrides: PermissionOverrideDto[];
}
export interface PermissionOverrideDto {
  id: string;
  permission: string;
  isGranted: boolean;
  grantedById: string;
  reason: string | null;
  /**
   * Read-side name only. The GRANT/DENY request field is `expiresAtUtc` — the backend is
   * asymmetric here (`OverrideRequest.ExpiresAtUtc` in, `PermissionOverrideResponse.ExpiresAt`
   * out). `PermissionService` handles the translation; do not "fix" one side to match the other.
   */
  expiresAt: string | null;
}

// Employee directory DTOs (shared/api re-exports them for existing importers).
export * from './employee.model';
