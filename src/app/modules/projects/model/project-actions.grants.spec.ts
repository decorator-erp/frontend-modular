import { describe, expect, it } from 'vitest';
import { PERM } from '@platform/permissions';
import {
  PROJECT_ACTIONS,
  ProjectAction,
  ProjectGateInput,
  canChangeComment,
  canExecuteTask,
  canProjectAction,
  projectActionArea,
} from './project-actions';
import type { AccessArea, ProjectAccess } from './access-grant.model';
import { GRANT_AREA_PERMISSIONS, claimCheck, grantCovers } from './project-access';
import type { ProjectLevel } from './project-actions';

/** crmp P1-B: grant-sourced gating (dms GrantAreaPermissions.cs, ProjectAccessContext.Covers). */
const noClaims = (): boolean => false;
const allClaims = (): boolean => true;

function grant(
  level: ProjectLevel,
  areas: AccessArea[],
  stageIds: string[] = [],
): ProjectGateInput {
  const myAccess: ProjectAccess = { source: 'Grant', level, areas, stageIds, expiresAtUtc: null };
  return { myLevel: level, status: 'InProgress', isActive: true, myAccess };
}

const NEVER: ProjectAction[] = [
  'project.update',
  'project.delete',
  'project.status',
  'project.active',
  'member.add',
  'member.access',
  'member.remove',
  'scope.manage',
  'scope.confirm',
  'team.create',
  'team.addMember',
  'team.removeMember',
  'team.role',
  'team.head',
  'stage.create',
  'stage.update',
  'stage.delete',
];

describe('canProjectAction — grant-sourced access (crmp P1-B)', () => {
  it('maps every action to an area', () => {
    for (const action of Object.keys(PROJECT_ACTIONS) as ProjectAction[]) {
      expect(['Overview', 'StagesAndTasks', 'Documents', 'Sites', 'Crm', 'Team']).toContain(
        projectActionArea(action),
      );
    }
    expect(projectActionArea('task.complete')).toBe('StagesAndTasks');
    expect(projectActionArea('member.add')).toBe('Team');
    expect(projectActionArea('project.update')).toBe('Overview');
    expect(projectActionArea('scope.confirm')).toBe('Overview');
    expect(projectActionArea('team.head')).toBe('Team');
    expect(projectActionArea('stageGate.satisfy')).toBe('StagesAndTasks');
    expect(projectActionArea('comment.edit')).toBe('StagesAndTasks');
  });

  it('a grant never writes to the project, scope, members, teams or stage structure — even Manager on every area with every claim', () => {
    const g = grant('Manager', ['Overview', 'StagesAndTasks', 'Documents', 'Sites', 'Crm', 'Team']);
    for (const action of NEVER) {
      expect(canProjectAction(g, action, allClaims, 'S1'), action).toBe(false);
    }
  });

  it("satisfies the claim from the grant's implied table, not the token", () => {
    const g = grant('Editor', ['StagesAndTasks']);
    expect(canProjectAction(g, 'task.complete', noClaims, 'S1')).toBe(true);
    expect(canProjectAction(g, 'subtask.create', noClaims, 'S1')).toBe(true);
    expect(canProjectAction(g, 'comment.add', noClaims, 'S1')).toBe(true);
  });

  it('ignores token claims the grant does not imply', () => {
    const g = grant('Viewer', ['StagesAndTasks']);
    // A Viewer grant implies stage_tasks.read only; the token's manage claim does not count.
    expect(canProjectAction(g, 'task.complete', allClaims, 'S1')).toBe(false);
  });

  it('needs the area', () => {
    const g = grant('Manager', ['Documents', 'Overview']);
    expect(canProjectAction(g, 'task.complete', noClaims, 'S1')).toBe(false);
    expect(canProjectAction(g, 'stage.complete', noClaims, 'S1')).toBe(false);
  });

  it('takes the level from the grant: Editor cannot assign or complete a stage, Manager can', () => {
    expect(
      canProjectAction(grant('Editor', ['StagesAndTasks']), 'task.assign', noClaims, 'S1'),
    ).toBe(false);
    expect(
      canProjectAction(grant('Editor', ['StagesAndTasks']), 'stage.complete', noClaims, 'S1'),
    ).toBe(false);
    expect(
      canProjectAction(grant('Manager', ['StagesAndTasks']), 'task.assign', noClaims, 'S1'),
    ).toBe(true);
    expect(
      canProjectAction(grant('Manager', ['StagesAndTasks']), 'stage.complete', noClaims, 'S1'),
    ).toBe(true);
    expect(
      canProjectAction(grant('Manager', ['StagesAndTasks']), 'stageGate.create', noClaims, 'S1'),
    ).toBe(true);
  });

  it('a stage-limited grant covers only its stages, and no stageless stage/task action', () => {
    const g = grant('Editor', ['StagesAndTasks'], ['S1']);
    expect(canProjectAction(g, 'task.complete', noClaims, 'S1')).toBe(true);
    expect(canProjectAction(g, 'task.complete', noClaims, 'S2')).toBe(false);
    expect(canProjectAction(g, 'task.complete', noClaims)).toBe(false);
    // A whole-project grant needs no stage.
    expect(canProjectAction(grant('Editor', ['StagesAndTasks']), 'task.complete', noClaims)).toBe(
      true,
    );
  });

  it('still refuses work on a closed project', () => {
    const g = { ...grant('Manager', ['StagesAndTasks']), status: 'OnHold' as const };
    expect(canProjectAction(g, 'task.complete', noClaims, 'S1')).toBe(false);
  });

  it('task execution: a grant Manager may start any task; a grant Editor only their own', () => {
    const m = grant('Manager', ['StagesAndTasks']);
    const e = grant('Editor', ['StagesAndTasks']);
    const task = { assignedToId: 'OTHER' };
    expect(canExecuteTask(m, task, 'ME', noClaims, 'task.start', 'S1')).toBe(true);
    // An Editor grant implies stage_tasks.manage, which also passes (backend TaskExecutors.cs:17-35).
    expect(canExecuteTask(e, task, 'ME', noClaims, 'task.start', 'S1')).toBe(true);
    expect(
      canExecuteTask(
        grant('Viewer', ['StagesAndTasks']),
        task,
        'ME',
        allClaims,
        'task.start',
        'S1',
      ),
    ).toBe(false);
  });

  it("comments: an Editor grant implies stage_tasks.manage, so may change another's comment", () => {
    const e = grant('Editor', ['StagesAndTasks']);
    expect(canChangeComment(e, { employeeId: 'OTHER' }, 'ME', noClaims, 'comment.edit', 'S1')).toBe(
      true,
    );
    expect(
      canChangeComment(
        grant('Editor', ['StagesAndTasks'], ['S1']),
        { employeeId: 'OTHER' },
        'ME',
        noClaims,
        'comment.edit',
        'S9',
      ),
    ).toBe(false);
  });
});

describe('members and read_all keep the token check (crmp P1-B)', () => {
  const member: ProjectGateInput = {
    myLevel: 'Manager',
    status: 'InProgress',
    isActive: true,
    myAccess: { source: 'Member', level: 'Manager', areas: [], stageIds: [], expiresAtUtc: null },
  };
  const legacy: ProjectGateInput = { myLevel: 'Manager', status: 'InProgress', isActive: true };

  it.each([member, legacy])('claims come from the token (%#)', (p) => {
    expect(canProjectAction(p, 'member.add', (c) => c === PERM.projects.manageMembers)).toBe(true);
    expect(canProjectAction(p, 'member.add', noClaims)).toBe(false);
    expect(canProjectAction(p, 'task.assign', allClaims, 'ANY')).toBe(true);
    expect(canProjectAction(p, 'task.assign', allClaims)).toBe(true);
  });

  it('read_all is not limited by areas or stages', () => {
    const ra: ProjectGateInput = {
      ...legacy,
      myAccess: {
        source: 'ReadAll',
        level: 'Manager',
        areas: [],
        stageIds: [],
        expiresAtUtc: null,
      },
    };
    expect(canProjectAction(ra, 'project.update', allClaims)).toBe(true);
  });
});

describe('GRANT_AREA_PERMISSIONS / grantCovers', () => {
  it('mirrors GrantAreaPermissions.cs (spot checks)', () => {
    expect(GRANT_AREA_PERMISSIONS.Overview.Viewer).toEqual(['project.read', 'scope.read']);
    expect(GRANT_AREA_PERMISSIONS.Documents.Manager).toEqual(['documents.delete']);
    expect(GRANT_AREA_PERMISSIONS.Sites.Editor).toEqual([
      'sites.create',
      'sites.update',
      'sites.submit',
    ]);
    expect(GRANT_AREA_PERMISSIONS.Team.Editor).toEqual([]);
    const all = Object.values(GRANT_AREA_PERMISSIONS).flatMap((l) => Object.values(l).flat());
    for (const never of [
      'project.read_all',
      'project.manage_members',
      'project.manage_access',
      'project.update',
      'stages.read',
      'stages.manage',
      'stage_teams.manage',
    ]) {
      expect(all).not.toContain(never);
    }
  });

  it('a stage-limited grant covers Overview without a stage, nothing else stageless', () => {
    const a: ProjectAccess = {
      source: 'Grant',
      level: 'Manager',
      areas: ['Overview', 'Sites', 'Crm', 'Documents'],
      stageIds: ['S1'],
      expiresAtUtc: null,
    };
    expect(grantCovers(a, 'Overview')).toBe(true);
    expect(grantCovers(a, 'Sites')).toBe(false);
    expect(grantCovers(a, 'Crm')).toBe(false);
    expect(grantCovers(a, 'Documents')).toBe(false);
    expect(grantCovers(a, 'Documents', 'S1')).toBe(true);
    expect(claimCheck(a, 'Sites', allClaims)('sites.read')).toBe(false);
    expect(claimCheck(null, 'Sites', noClaims)('sites.read')).toBe(false);
    expect(claimCheck(null, 'Sites', allClaims)('sites.read')).toBe(true);
  });
});
