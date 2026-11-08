import { PERM } from '@platform/permissions';
import type { Project, ProjectDetails, ProjectStatus } from './project.model';
import type { AccessArea, ProjectAccess } from './access-grant.model';
import { claimCheck, isGrantAccess } from './project-access';

/**
 * crmp A-3: the caller's project level and the level each project action needs.
 *
 * `myLevel` (contract §2.17.2) is an int on `ProjectResponse` and at the top of `ProjectDetailsResponse`:
 * 1 Viewer, 2 Editor, 3 Manager. Below the level an action is 403 `projects.InsufficientLevel`; the
 * route claim is checked before it. A button is shown only when the claim AND the level allow it.
 * Because a level can change between load and click, the 403 still gets its catalog message.
 */
export type ProjectLevel = 'Viewer' | 'Editor' | 'Manager';

const LEVEL_RANK: Record<ProjectLevel, number> = { Viewer: 1, Editor: 2, Manager: 3 };
const LEVEL_BY_INT: Record<number, ProjectLevel> = { 1: 'Viewer', 2: 'Editor', 3: 'Manager' };

/** Map the wire value (int or name) to a level; anything else is Viewer, the least privilege. */
export function toProjectLevel(raw: unknown): ProjectLevel {
  if (typeof raw === 'number') return LEVEL_BY_INT[raw] ?? 'Viewer';
  if (typeof raw === 'string') {
    if (/^\d+$/.test(raw)) return LEVEL_BY_INT[Number(raw)] ?? 'Viewer';
    if (raw === 'Viewer' || raw === 'Editor' || raw === 'Manager') return raw;
  }
  return 'Viewer';
}

export function levelAtLeast(level: ProjectLevel, required: ProjectLevel): boolean {
  return LEVEL_RANK[level] >= LEVEL_RANK[required];
}

interface ActionRule {
  /** The level the backend marks the command with (`IRequiresProjectEditor` / `IRequiresProjectManager`). */
  level: ProjectLevel;
  /** The route claims; any one of them passes (`RequirePermission` / `RequireAnyPermission`). */
  anyOf: readonly string[];
  /** The `Map*` call that carries the rule (dms `Projects.Infrastructure/Endpoints`). */
  endpoint: string;
}

/**
 * The contract's action → level table (§2.17.2, built from Projects.Contracts) joined with each route's
 * claim. Reads need only Viewer and are not listed.
 */
export const PROJECT_ACTIONS = {
  'project.update': {
    level: 'Manager',
    anyOf: [PERM.projects.update],
    endpoint: 'ProjectEndpoints.cs:59',
  },
  'project.delete': {
    level: 'Manager',
    anyOf: [PERM.projects.delete],
    endpoint: 'ProjectEndpoints.cs:85',
  },
  'project.status': {
    level: 'Manager',
    anyOf: [PERM.projects.changeStatus],
    endpoint: 'ProjectEndpoints.cs:69',
  },
  'project.active': {
    level: 'Manager',
    anyOf: [PERM.projects.setActive],
    endpoint: 'ProjectEndpoints.cs:77',
  },
  'member.add': {
    level: 'Manager',
    anyOf: [PERM.projects.manageMembers],
    endpoint: 'ProjectMemberEndpoints.cs:32',
  },
  'member.access': {
    level: 'Manager',
    anyOf: [PERM.projects.manageMembers],
    endpoint: 'ProjectMemberEndpoints.cs:41',
  },
  'member.remove': {
    level: 'Manager',
    anyOf: [PERM.projects.manageMembers],
    endpoint: 'ProjectMemberEndpoints.cs:50',
  },
  'scope.manage': {
    level: 'Manager',
    anyOf: [PERM.scope.manage],
    endpoint: 'ScopeOfWorkEndpoints.cs:33-79',
  },
  'scope.confirm': {
    level: 'Manager',
    anyOf: [PERM.scope.confirm],
    endpoint: 'ScopeOfWorkEndpoints.cs:87',
  },
  'stage.create': {
    level: 'Manager',
    anyOf: [PERM.stages.manage],
    endpoint: 'StageEndpoints.cs:41',
  },
  'stage.update': {
    level: 'Manager',
    anyOf: [PERM.stages.manage],
    endpoint: 'StageEndpoints.cs:52',
  },
  'stage.delete': {
    level: 'Manager',
    anyOf: [PERM.stages.manage],
    endpoint: 'StageEndpoints.cs:62',
  },
  'stage.complete': {
    level: 'Manager',
    anyOf: [PERM.stages.complete],
    endpoint: 'StageEndpoints.cs:70',
  },
  'stage.reject': {
    level: 'Manager',
    anyOf: [PERM.stages.reject],
    endpoint: 'StageEndpoints.cs:78',
  },
  'stageGate.create': {
    level: 'Manager',
    anyOf: [PERM.stages.manageGates],
    endpoint: 'GateEndpoints.cs:32',
  },
  'taskGate.create': {
    level: 'Manager',
    anyOf: [PERM.stageTasks.manageGates],
    endpoint: 'GateEndpoints.cs:50',
  },
  // Review B1 (supersedes R1-F7): the route takes either gates claim (RequireAnyPermission, GateEndpoints.cs:66,75),
  // but the handler then needs the owner's claim: stage gate → stages.manage_gates, task gate →
  // stage_tasks.manage_gates (GateConditionHandlers.cs:294,355; GateOwners.MayManage :401-404).
  'stageGate.delete': {
    level: 'Manager',
    anyOf: [PERM.stages.manageGates],
    endpoint: 'GateEndpoints.cs:60',
  },
  'taskGate.delete': {
    level: 'Manager',
    anyOf: [PERM.stageTasks.manageGates],
    endpoint: 'GateEndpoints.cs:60',
  },
  'stageGate.satisfy': {
    level: 'Manager',
    anyOf: [PERM.stages.manageGates],
    endpoint: 'GateEndpoints.cs:68',
  },
  'taskGate.satisfy': {
    level: 'Manager',
    anyOf: [PERM.stageTasks.manageGates],
    endpoint: 'GateEndpoints.cs:68',
  },
  'task.create': {
    level: 'Manager',
    anyOf: [PERM.stageTasks.manage],
    endpoint: 'TaskEndpoints.cs:35',
  },
  'task.update': {
    level: 'Manager',
    anyOf: [PERM.stageTasks.manage],
    endpoint: 'TaskEndpoints.cs:46',
  },
  'task.delete': {
    level: 'Manager',
    anyOf: [PERM.stageTasks.manage],
    endpoint: 'TaskEndpoints.cs:56',
  },
  'task.assign': {
    level: 'Manager',
    anyOf: [PERM.stageTasks.assign],
    endpoint: 'TaskEndpoints.cs:81',
  },
  'task.start': {
    level: 'Editor',
    anyOf: [PERM.stageTasks.manage, PERM.stageTasks.complete],
    endpoint: 'TaskEndpoints.cs:90',
  },
  'task.complete': {
    level: 'Editor',
    anyOf: [PERM.stageTasks.complete],
    endpoint: 'TaskEndpoints.cs:98',
  },
  'task.reject': {
    level: 'Manager',
    anyOf: [PERM.stageTasks.manage],
    endpoint: 'TaskEndpoints.cs:106',
  },
  'task.cancel': {
    level: 'Manager',
    anyOf: [PERM.stageTasks.manage],
    endpoint: 'TaskEndpoints.cs:115',
  },
  'task.reopen': {
    level: 'Manager',
    anyOf: [PERM.stageTasks.manage],
    endpoint: 'TaskEndpoints.cs:123',
  },
  'subtask.create': {
    level: 'Editor',
    anyOf: [PERM.stageTasks.manage],
    endpoint: 'TaskEndpoints.cs:141',
  },
  'subtask.update': {
    level: 'Editor',
    anyOf: [PERM.stageTasks.manage],
    endpoint: 'TaskEndpoints.cs:151',
  },
  'subtask.delete': {
    level: 'Editor',
    anyOf: [PERM.stageTasks.manage],
    endpoint: 'TaskEndpoints.cs:161',
  },
  'subtask.reopen': {
    level: 'Editor',
    anyOf: [PERM.stageTasks.manage, PERM.stageTasks.complete],
    endpoint: 'TaskEndpoints.cs:169',
  },
  'subtask.complete': {
    level: 'Editor',
    anyOf: [PERM.stageTasks.manage, PERM.stageTasks.complete],
    endpoint: 'TaskEndpoints.cs:177',
  },
  'comment.add': {
    level: 'Editor',
    anyOf: [PERM.stageTasks.manage, PERM.stageTasks.complete],
    endpoint: 'TaskEndpoints.cs:195',
  },
  'comment.edit': {
    level: 'Editor',
    anyOf: [PERM.stageTasks.read],
    endpoint: 'TaskEndpoints.cs:206',
  },
  'comment.delete': {
    level: 'Editor',
    anyOf: [PERM.stageTasks.read],
    endpoint: 'TaskEndpoints.cs:215',
  },
  'team.create': {
    level: 'Manager',
    anyOf: [PERM.stageTeams.manage],
    endpoint: 'TeamEndpoints.cs:32',
  },
  'team.addMember': {
    level: 'Manager',
    anyOf: [PERM.stageTeams.manage],
    endpoint: 'TeamEndpoints.cs:65',
  },
  'team.removeMember': {
    level: 'Manager',
    anyOf: [PERM.stageTeams.manage],
    endpoint: 'TeamEndpoints.cs:41',
  },
  'team.role': {
    level: 'Manager',
    anyOf: [PERM.stageTeams.manage],
    endpoint: 'TeamEndpoints.cs:74',
  },
  'team.head': {
    level: 'Manager',
    anyOf: [PERM.stageTeams.manage],
    endpoint: 'TeamEndpoints.cs:83',
  },
} as const satisfies Record<string, ActionRule>;

export type ProjectAction = keyof typeof PROJECT_ACTIONS;

/**
 * crmp P1-B: the grant area each action belongs to (dms scope decorators: `ProjectScopeDecorator`
 * passes Stages & tasks). Project housekeeping and scope are Overview, members and teams are Team —
 * both read-only for a grant at every level.
 */
export const PROJECT_ACTION_AREA: Readonly<Record<ProjectAction, AccessArea>> = {
  'project.update': 'Overview',
  'project.delete': 'Overview',
  'project.status': 'Overview',
  'project.active': 'Overview',
  'member.add': 'Team',
  'member.access': 'Team',
  'member.remove': 'Team',
  'scope.manage': 'Overview',
  'scope.confirm': 'Overview',
  'stage.create': 'StagesAndTasks',
  'stage.update': 'StagesAndTasks',
  'stage.delete': 'StagesAndTasks',
  'stage.complete': 'StagesAndTasks',
  'stage.reject': 'StagesAndTasks',
  'stageGate.create': 'StagesAndTasks',
  'taskGate.create': 'StagesAndTasks',
  'stageGate.delete': 'StagesAndTasks',
  'taskGate.delete': 'StagesAndTasks',
  'stageGate.satisfy': 'StagesAndTasks',
  'taskGate.satisfy': 'StagesAndTasks',
  'task.create': 'StagesAndTasks',
  'task.update': 'StagesAndTasks',
  'task.delete': 'StagesAndTasks',
  'task.assign': 'StagesAndTasks',
  'task.start': 'StagesAndTasks',
  'task.complete': 'StagesAndTasks',
  'task.reject': 'StagesAndTasks',
  'task.cancel': 'StagesAndTasks',
  'task.reopen': 'StagesAndTasks',
  'subtask.create': 'StagesAndTasks',
  'subtask.update': 'StagesAndTasks',
  'subtask.delete': 'StagesAndTasks',
  'subtask.reopen': 'StagesAndTasks',
  'subtask.complete': 'StagesAndTasks',
  'comment.add': 'StagesAndTasks',
  'comment.edit': 'StagesAndTasks',
  'comment.delete': 'StagesAndTasks',
  'team.create': 'Team',
  'team.addMember': 'Team',
  'team.removeMember': 'Team',
  'team.role': 'Team',
  'team.head': 'Team',
};

/**
 * crmp P1-B: a grant never writes to the project itself, its scope, members, teams or stage structure
 * (dms GrantAreaPermissions.cs:16-22 — the codes are never implied). Listed so the rule does not hang
 * on the implied table alone.
 */
const NEVER_FOR_GRANT: ReadonlySet<ProjectAction> = new Set<ProjectAction>([
  'project.update',
  'project.delete',
  'project.status',
  'project.active',
  'member.add',
  'member.access',
  'member.remove',
  'scope.manage',
  'scope.confirm',
  'stage.create',
  'stage.update',
  'stage.delete',
  'team.create',
  'team.addMember',
  'team.removeMember',
  'team.role',
  'team.head',
]);

/** What `canProjectAction` needs to know about the project. */
export interface ProjectGateInput {
  myLevel: ProjectLevel;
  status: ProjectStatus;
  isActive: boolean;
  /** crmp P1-B: how the caller reaches the project; null/absent keeps the member behaviour. */
  myAccess?: ProjectAccess | null;
}

const CLOSED_STATUSES: readonly ProjectStatus[] = ['OnHold', 'Completed', 'Cancelled'];

/**
 * A closed project (inactive, OnHold, Completed or Cancelled) refuses work writes with 409
 * `projects.Closed` (contract §2.17). Project-level housekeeping (status, active, delete, update,
 * members) stays open so a Manager can reopen or tidy it.
 */
export function isProjectClosed(p: Pick<ProjectGateInput, 'status' | 'isActive'>): boolean {
  return !p.isActive || CLOSED_STATUSES.includes(p.status);
}

// crmp review R1-F6: comments are not refused on a closed project (no closed check in dms
// TaskCommentHandlers.cs), so they stay open with the project housekeeping.
const OPEN_ON_CLOSED: ReadonlySet<ProjectAction> = new Set<ProjectAction>([
  'comment.add',
  'comment.edit',
  'comment.delete',
  'project.update',
  'project.delete',
  'project.status',
  'project.active',
  'member.add',
  'member.access',
  'member.remove',
]);

/** Read the gate inputs off a `Project` or a `ProjectDetails`. */
export function projectGate(source: Project | ProjectDetails): ProjectGateInput {
  if ('project' in source) {
    return {
      myLevel: source.myLevel,
      status: source.project.status,
      isActive: source.project.isActive,
      myAccess: source.myAccess ?? source.project.myAccess ?? null,
    };
  }
  return {
    myLevel: source.myLevel,
    status: source.status,
    isActive: source.isActive,
    myAccess: source.myAccess ?? null,
  };
}

function toGate(project: Project | ProjectDetails | ProjectGateInput): ProjectGateInput {
  return 'project' in project ? projectGate(project) : (project as ProjectGateInput);
}

/**
 * The one shared gate for every project action button: the route claim (any of), the caller's level,
 * and — for work writes — an open project. `can` is `PermissionsService.can`.
 *
 * crmp P1-B: when the caller reaches the project only through a grant (`myAccess.source === 'Grant'`),
 * the action must be in a granted area (and, for stage and task actions, `stageId` among the grant's
 * stages unless it is whole-project), the level is the grant's, and the claim is read from the grant's
 * implied table — the token does not carry those codes. Project, scope, member and team writes are
 * never allowed to a grant.
 */
export function canProjectAction(
  project: Project | ProjectDetails | ProjectGateInput | null | undefined,
  action: ProjectAction,
  can: (permission: string) => boolean,
  stageId?: string | null,
): boolean {
  if (!project) return false;
  const gate = toGate(project);
  if (isGrantAccess(gate.myAccess) && NEVER_FOR_GRANT.has(action)) return false;
  const claim = claimCheck(gate.myAccess, PROJECT_ACTION_AREA[action], can, stageId);
  const level = isGrantAccess(gate.myAccess) ? gate.myAccess.level : gate.myLevel;
  const rule: ActionRule = PROJECT_ACTIONS[action];
  if (!rule.anyOf.some((p) => claim(p))) return false;
  if (!levelAtLeast(level, rule.level)) return false;
  if (!OPEN_ON_CLOSED.has(action) && isProjectClosed(gate)) return false;
  // R2-2: only adding a member is refused on an inactive project (404; dms ProjectMemberHandlers.cs:46,
  // the only ProjectIsLiveAsync caller); change-access and remove stay open.
  if (action === 'member.add' && !gate.isActive) return false;
  return true;
}

/**
 * Task start/complete: besides the Editor level, the caller must be the assignee, hold
 * `stage_tasks.manage`, or be the project Manager (`projects.tasks.NotAssignee`, dms
 * `TaskExecutors.cs:17-35`).
 */
export function canExecuteTask(
  project: ProjectGateInput,
  task: { assignedToId: string | null },
  me: string | null,
  can: (permission: string) => boolean,
  action: 'task.start' | 'task.complete',
  stageId?: string | null,
): boolean {
  if (!canProjectAction(project, action, can, stageId)) return false;
  const claim = claimCheck(project.myAccess, 'StagesAndTasks', can, stageId);
  const level = isGrantAccess(project.myAccess) ? project.myAccess.level : project.myLevel;
  return (
    (!!me && task.assignedToId === me) ||
    claim(PERM.stageTasks.manage) ||
    levelAtLeast(level, 'Manager')
  );
}

/**
 * Comment edit/delete: besides Editor, the caller must be the author or hold the `stage_tasks.manage`
 * claim — the claim, not the Manager level (`projects.comments.NotAuthor`, `TaskCommentHandlers.cs:87-107`).
 */
export function canChangeComment(
  project: ProjectGateInput,
  comment: { employeeId: string },
  me: string | null,
  can: (permission: string) => boolean,
  action: 'comment.edit' | 'comment.delete',
  stageId?: string | null,
): boolean {
  if (!canProjectAction(project, action, can, stageId)) return false;
  const claim = claimCheck(project.myAccess, 'StagesAndTasks', can, stageId);
  return (!!me && comment.employeeId === me) || claim(PERM.stageTasks.manage);
}
