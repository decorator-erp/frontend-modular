import { PERM } from '@platform/permissions';
import type { Project, ProjectDetails, ProjectStatus } from './project.model';

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

/** What `canProjectAction` needs to know about the project. */
export interface ProjectGateInput {
  myLevel: ProjectLevel;
  status: ProjectStatus;
  isActive: boolean;
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

const OPEN_ON_CLOSED: ReadonlySet<ProjectAction> = new Set<ProjectAction>([
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
    };
  }
  return { myLevel: source.myLevel, status: source.status, isActive: source.isActive };
}

/**
 * The one shared gate for every project action button: the route claim (any of), the caller's level,
 * and — for work writes — an open project. `can` is `PermissionsService.can`.
 */
export function canProjectAction(
  project: Project | ProjectDetails | ProjectGateInput | null | undefined,
  action: ProjectAction,
  can: (permission: string) => boolean,
): boolean {
  if (!project) return false;
  const gate =
    'myLevel' in project && 'status' in project && 'isActive' in project
      ? (project as ProjectGateInput)
      : projectGate(project as Project | ProjectDetails);
  const rule: ActionRule = PROJECT_ACTIONS[action];
  if (!rule.anyOf.some((p) => can(p))) return false;
  if (!levelAtLeast(gate.myLevel, rule.level)) return false;
  if (!OPEN_ON_CLOSED.has(action) && isProjectClosed(gate)) return false;
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
): boolean {
  if (!canProjectAction(project, action, can)) return false;
  return (
    (!!me && task.assignedToId === me) ||
    can(PERM.stageTasks.manage) ||
    levelAtLeast(project.myLevel, 'Manager')
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
): boolean {
  if (!canProjectAction(project, action, can)) return false;
  return (!!me && comment.employeeId === me) || can(PERM.stageTasks.manage);
}
