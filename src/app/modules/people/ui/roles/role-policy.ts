/**
 * What the backend ALWAYS refuses for a role, mirrored so the screens can hide it instead of
 * offering a button that can only fail (006b-1 #6; server-authoritative otherwise).
 *
 * Backend: `DefaultRoles.All` / `DefaultRoles.FullAccessRoles`
 * (`Identity.Infrastructure/Persistence/Seeders/DefaultRoles.cs`), matched case-insensitively as
 * `RoleService.IsSystemRole` and `DelegationGuard.IsFullAccess` do.
 */
const SYSTEM_ROLES = ['admin', 'manager', 'employee', 'client'];
const FULL_ACCESS_ROLES = ['admin', 'manager'];

/** Seeded roles keep their name: rename and delete answer 409 `roles.SystemRole`. */
export function isSystemRole(name: string | null | undefined): boolean {
  return !!name && SYSTEM_ROLES.includes(name.toLowerCase());
}

/** Full-access roles always hold the whole catalog: claim edits answer 409 `roles.FullAccessLocked`. */
export function isFullAccessRole(name: string | null | undefined): boolean {
  return !!name && FULL_ACCESS_ROLES.includes(name.toLowerCase());
}

export const FULL_ACCESS_REASON = 'Always holds every permission — read-only';
export const SYSTEM_ROLE_NAME_HINT = 'System roles keep their name. The description can change.';
