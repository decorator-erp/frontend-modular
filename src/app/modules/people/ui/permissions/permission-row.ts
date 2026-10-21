/**
 * One row of the permissions matrix.
 *
 * `value` is the wire permission string — `PermissionResponse.claimValue`, and the identity used
 * for every read and every write. `group` and `displayName` are DERIVED, not sent:
 * `GET /api/permissions` returns `ModulePermissionSet(module, permissions: string[])` and nothing
 * else, so the module name is the group and the label has to be computed.
 */
export interface PermissionRow {
  value: string;
  group: string;
  displayName: string;
}

/**
 * Turn `employees.set_active` into `Employees set active`.
 *
 * The backend derives its own label the same way (`ApplicationRoleClaim.Create` splits on `.` and
 * `_`) but title-cases every word. We use sentence case instead, per the project's casing rule —
 * and nothing is lost, because the raw permission string is rendered in mono directly beneath the
 * label, so the exact claim is always visible.
 */
export function permissionDisplayName(value: string): string {
  const words = value.split(/[._]+/).filter(Boolean).join(' ');
  return words ? words.charAt(0).toUpperCase() + words.slice(1) : value;
}
