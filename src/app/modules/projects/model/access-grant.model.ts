import type { ProjectLevel } from './project-actions';

/**
 * crmp P1-B: project access grants (dms PR #27, P1-A). A grant gives an employee who is not on the
 * project a level on some areas of it, optionally limited to some stages, for a window.
 *
 * Wire enums (dms `Projects.Contracts/Enums.cs`): the level is `ProjectMemberAccess` (1 Viewer,
 * 2 Editor, 3 Manager — `ProjectLevel` here), the areas are `ProjectAccessArea` flags (`:159-168`)
 * and the status is `ProjectAccessGrantStatus` (`:172-178`).
 */
export const ACCESS_AREA_FLAGS = {
  Overview: 1,
  StagesAndTasks: 2,
  Documents: 4,
  Sites: 8,
  Crm: 16,
  Team: 32,
} as const;

export type AccessArea = keyof typeof ACCESS_AREA_FLAGS;

/** Display order of the areas (the flag order). */
export const ACCESS_AREAS: readonly AccessArea[] = [
  'Overview',
  'StagesAndTasks',
  'Documents',
  'Sites',
  'Crm',
  'Team',
];

export type GrantStatus = 'Upcoming' | 'Active' | 'Expired' | 'Revoked';

export const GRANT_STATUS_BY_INT: Readonly<Record<number, GrantStatus>> = {
  1: 'Upcoming',
  2: 'Active',
  3: 'Expired',
  4: 'Revoked',
};

export const LEVEL_INT: Readonly<Record<ProjectLevel, number>> = {
  Viewer: 1,
  Editor: 2,
  Manager: 3,
};

/** `['Overview', 'Documents']` → 5. Unknown names are ignored. */
export function areasToFlags(areas: readonly AccessArea[]): number {
  return areas.reduce((sum, a) => sum | (ACCESS_AREA_FLAGS[a] ?? 0), 0);
}

/** 5 → `['Overview', 'Documents']`, in display order. A non-number reads as no area. */
export function flagsToAreas(flags: unknown): AccessArea[] {
  const n = typeof flags === 'string' && /^\d+$/.test(flags) ? Number(flags) : flags;
  if (typeof n !== 'number' || !Number.isFinite(n)) return [];
  return ACCESS_AREAS.filter((a) => (n & ACCESS_AREA_FLAGS[a]) === ACCESS_AREA_FLAGS[a]);
}

/** How the caller reaches a project (`ProjectAccessResponse`, GrantContracts.cs:32-38). */
export type AccessSource = 'ReadAll' | 'Member' | 'Grant';

/** `myAccess` on `ProjectResponse` / `ProjectDetailsResponse`. `myLevel` always equals `level`. */
export interface ProjectAccess {
  source: AccessSource;
  level: ProjectLevel;
  areas: AccessArea[];
  /** Empty: every stage (or no stage limit). */
  stageIds: string[];
  expiresAtUtc: string | null;
}

/** One grant as `GET /api/projects/{projectId}/access-grants` lists it (GrantContracts.cs:12-16). */
export interface ProjectAccessGrant {
  id: string;
  projectId: string;
  employeeId: string;
  employeeName: string | null;
  level: ProjectLevel;
  areas: AccessArea[];
  stageIds: string[];
  startsAtUtc: string;
  expiresAtUtc: string | null;
  reason: string;
  grantedById: string;
  grantedAtUtc: string;
  revokedAtUtc: string | null;
  revokedById: string | null;
  revokeReason: string | null;
  status: GrantStatus;
}

/** One of the caller's own grants (`GET /api/me/access-grants`, GrantContracts.cs:20-23). */
export interface MyAccessGrant {
  grantId: string;
  projectId: string;
  projectCode: string;
  projectName: string;
  level: ProjectLevel;
  areas: AccessArea[];
  stageIds: string[];
  startsAtUtc: string;
  expiresAtUtc: string | null;
  reason: string;
  status: GrantStatus;
}

/** `POST …/access-grants` (ProjectAccessGrantEndpoints.cs:77-79). Dates are UTC `Z`. */
export interface CreateAccessGrantRequest {
  employeeId: string;
  level: ProjectLevel;
  areas: AccessArea[];
  /** Empty: the whole project. */
  stageIds: string[];
  /** Null: now. */
  startsAtUtc: string | null;
  /** Null: no end. */
  expiresAtUtc: string | null;
  reason: string;
}

/** `PUT …/access-grants/{grantId}` (ProjectAccessGrantEndpoints.cs:81-83). */
export interface UpdateAccessGrantRequest {
  level: ProjectLevel;
  areas: AccessArea[];
  stageIds: string[];
  expiresAtUtc: string | null;
  reason: string;
}

/** The backend's `Reason` limit (`ProjectAccessGrant.ReasonMaxLength`). */
export const GRANT_REASON_MAX = 500;

/** A grant that can still change or be revoked. */
export function isGrantOpen(g: Pick<ProjectAccessGrant, 'status'>): boolean {
  return g.status === 'Active' || g.status === 'Upcoming';
}

const LEVEL_BY_INT: Readonly<Record<number, ProjectLevel>> = {
  1: 'Viewer',
  2: 'Editor',
  3: 'Manager',
};

/** The wire level (int, numeric string or name) → `ProjectLevel`; anything else is Viewer. */
export function grantLevel(raw: unknown): ProjectLevel {
  if (typeof raw === 'number') return LEVEL_BY_INT[raw] ?? 'Viewer';
  if (typeof raw === 'string') {
    if (/^\d+$/.test(raw)) return LEVEL_BY_INT[Number(raw)] ?? 'Viewer';
    if (raw === 'Editor' || raw === 'Manager') return raw;
  }
  return 'Viewer';
}

function rec(source: unknown): Record<string, unknown> {
  return source && typeof source === 'object' ? (source as Record<string, unknown>) : {};
}

function ids(raw: unknown): string[] {
  return Array.isArray(raw) ? raw.filter((x): x is string => typeof x === 'string') : [];
}

function str(raw: unknown): string | null {
  return typeof raw === 'string' && raw !== '' ? raw : null;
}

/**
 * `myAccess` (ProjectAccessResponse) → `ProjectAccess`; null when absent or of an unknown source,
 * so an older response keeps the member behaviour (`myLevel` alone).
 */
export function toProjectAccess(raw: unknown): ProjectAccess | null {
  if (!raw || typeof raw !== 'object') return null;
  const r = rec(raw);
  const source = r['source'];
  if (source !== 'ReadAll' && source !== 'Member' && source !== 'Grant') return null;
  return {
    source,
    level: grantLevel(r['level']),
    areas: flagsToAreas(r['areas']),
    stageIds: ids(r['stageIds']),
    expiresAtUtc: str(r['expiresAtUtc']),
  };
}

function status(raw: unknown): GrantStatus {
  if (typeof raw === 'number') return GRANT_STATUS_BY_INT[raw] ?? 'Expired';
  if (typeof raw === 'string' && /^\d+$/.test(raw))
    return GRANT_STATUS_BY_INT[Number(raw)] ?? 'Expired';
  if (raw === 'Upcoming' || raw === 'Active' || raw === 'Expired' || raw === 'Revoked') return raw;
  return 'Expired';
}

export function toProjectAccessGrant(source: unknown): ProjectAccessGrant {
  const r = rec(source);
  return {
    id: str(r['id']) ?? '',
    projectId: str(r['projectId']) ?? '',
    employeeId: str(r['employeeId']) ?? '',
    employeeName: str(r['employeeName']),
    level: grantLevel(r['level']),
    areas: flagsToAreas(r['areas']),
    stageIds: ids(r['stageIds']),
    startsAtUtc: str(r['startsAtUtc']) ?? '',
    expiresAtUtc: str(r['expiresAtUtc']),
    reason: str(r['reason']) ?? '',
    grantedById: str(r['grantedById']) ?? '',
    grantedAtUtc: str(r['grantedAtUtc']) ?? '',
    revokedAtUtc: str(r['revokedAtUtc']),
    revokedById: str(r['revokedById']),
    revokeReason: str(r['revokeReason']),
    status: status(r['status']),
  };
}

export function toMyAccessGrant(source: unknown): MyAccessGrant {
  const r = rec(source);
  return {
    grantId: str(r['grantId']) ?? '',
    projectId: str(r['projectId']) ?? '',
    projectCode: str(r['projectCode']) ?? '',
    projectName: str(r['projectName']) ?? '',
    level: grantLevel(r['level']),
    areas: flagsToAreas(r['areas']),
    stageIds: ids(r['stageIds']),
    startsAtUtc: str(r['startsAtUtc']) ?? '',
    expiresAtUtc: str(r['expiresAtUtc']),
    reason: str(r['reason']) ?? '',
    status: status(r['status']),
  };
}
