/**
 * Auth DTOs, split out of the old `core/models/index.ts` barrel (288 L, dissolved per
 * `modular-monolith-plan.md` §3.11: "Auth DTOs → `platform/auth/`"). `core/models/**` otherwise
 * does not port with 002 — see spec 002-platform, contradiction C3.
 *
 * Fields ported verbatim from the old `core/models/index.ts`. `RefreshTokenRequest` is NOT
 * carried over — zero consumers repo-wide at SOURCE_SHA (die-by-omission, charter §5).
 * `PermissionOverrideDto` is included because `EffectivePermissionsResponse.overrides` needs it.
 */

export interface LoginRequest {
  email: string;
  password: string;
}
export interface AuthResponse {
  token: string;
  refreshToken: string;
  expiration: string;
}

export interface AuthState {
  userId: string;
  userName: string;
  email: string;
  roles: string[];
  permissions: string[];
  isActive: boolean;
  isSupervisor: boolean;
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
