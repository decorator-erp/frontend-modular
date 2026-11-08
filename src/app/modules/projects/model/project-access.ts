import { PERM } from '@platform/permissions';
import type { ProjectLevel } from './project-actions';
import type { AccessArea, ProjectAccess } from './access-grant.model';

/**
 * crmp P1-B: what a grant opens, mirrored from dms `Projects.Contracts/GrantAreaPermissions.cs:27-67`.
 * Area → level → the route codes that level ADDS; levels are cumulative.
 *
 * A grantee's token does NOT carry these codes (`/api/permissions/me/effective` omits them; the
 * backend admits the grantee live, per request). So for grant-sourced access the claim half of every
 * gate reads this table instead of `PermissionsService.can`. Members and `project.read_all` keep the
 * token check.
 */
export const GRANT_AREA_PERMISSIONS: Readonly<
  Record<AccessArea, Readonly<Record<ProjectLevel, readonly string[]>>>
> = {
  Overview: {
    Viewer: [PERM.projects.read, PERM.scope.read],
    Editor: [],
    Manager: [],
  },
  StagesAndTasks: {
    Viewer: [PERM.projects.read, PERM.stageTasks.read],
    Editor: [PERM.stageTasks.complete, PERM.stageTasks.manage],
    Manager: [
      PERM.stageTasks.assign,
      PERM.stages.complete,
      PERM.stages.reject,
      PERM.stages.manageGates,
      PERM.stageTasks.manageGates,
    ],
  },
  Documents: {
    Viewer: [PERM.projects.read, PERM.documents.read],
    Editor: [PERM.documents.upload, PERM.documents.update],
    Manager: [PERM.documents.delete],
  },
  Sites: {
    Viewer: [PERM.projects.read, 'sites.read'],
    Editor: ['sites.create', 'sites.update', 'sites.submit'],
    Manager: ['sites.approve', 'sites.delete'],
  },
  Crm: {
    Viewer: [
      PERM.projects.read,
      'crm.briefs.read',
      'crm.spaces.read',
      'crm.items.read',
      'crm.artifacts.read',
      'crm.periods.read',
    ],
    Editor: [
      'crm.briefs.manage',
      'crm.spaces.manage',
      'crm.items.create',
      'crm.items.update',
      'crm.artifacts.manage',
    ],
    Manager: [
      'crm.briefs.send',
      'crm.items.send',
      'crm.items.supersede',
      'crm.periods.open',
      'crm.periods.extend',
      'crm.periods.close',
    ],
  },
  Team: {
    Viewer: [PERM.projects.read],
    Editor: [],
    Manager: [],
  },
};

const LEVELS: readonly ProjectLevel[] = ['Viewer', 'Editor', 'Manager'];

/** The codes a grant of `level` on `area` implies (cumulative). */
export function impliedCodes(area: AccessArea, level: ProjectLevel): readonly string[] {
  const byLevel = GRANT_AREA_PERMISSIONS[area];
  const upTo = LEVELS.indexOf(level);
  return LEVELS.slice(0, upTo + 1).flatMap((l) => byLevel[l]);
}

/** True when the caller reaches the project only through a grant. */
export function isGrantAccess(access: ProjectAccess | null | undefined): access is ProjectAccess {
  return access?.source === 'Grant';
}

/**
 * dms `ProjectAccessContext.Covers` (`:78-87`): the grant holds the area AND (it is whole-project, OR
 * the stage is one of its stages, OR — with no stage — the area is Overview). So a stage-limited grant
 * never opens Sites, CRM or project-level documents. Non-grant access covers everything.
 */
export function grantCovers(
  access: ProjectAccess | null | undefined,
  area: AccessArea,
  stageId?: string | null,
): boolean {
  if (!isGrantAccess(access)) return true;
  if (!access.areas.includes(area)) return false;
  if (access.stageIds.length === 0) return true;
  return stageId ? access.stageIds.includes(stageId) : area === 'Overview';
}

/**
 * The claim half of a gate for `area`: the token check (`can`) for members and read_all; for a grant,
 * the implied table — and nothing when the grant does not cover the area (and stage).
 */
export function claimCheck(
  access: ProjectAccess | null | undefined,
  area: AccessArea,
  can: (permission: string) => boolean,
  stageId?: string | null,
): (permission: string) => boolean {
  if (!isGrantAccess(access)) return can;
  if (!grantCovers(access, area, stageId)) return () => false;
  const codes = impliedCodes(area, access.level);
  return (permission) => codes.includes(permission);
}

/**
 * crmp P1-B: who may manage grants on a project (dms ProjectAccessGrantHandlers.cs:80-89): a holder of
 * `project.manage_access`, or a Manager by membership — never through a grant, never `read_all` alone.
 */
export function canManageGrants(
  access: ProjectAccess | null | undefined,
  can: (permission: string) => boolean,
): boolean {
  if (can(PERM.projects.manageAccess)) return true;
  return access?.source === 'Member' && access.level === 'Manager';
}

/** The highest level the caller may grant: `project.manage_access` → Manager; else their member level. */
export function grantLevelCap(
  access: ProjectAccess | null | undefined,
  can: (permission: string) => boolean,
): ProjectLevel {
  if (can(PERM.projects.manageAccess)) return 'Manager';
  return access?.source === 'Member' ? access.level : 'Viewer';
}
