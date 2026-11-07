import { describe, expect, it } from 'vitest';
import { PERM } from '@platform/permissions';
import {
  PROJECT_ACTIONS,
  ProjectAction,
  ProjectGateInput,
  ProjectLevel,
  canChangeComment,
  canExecuteTask,
  canProjectAction,
  isProjectClosed,
  toProjectLevel,
} from './project-actions';

const ALL = new Set<string>(Object.values(PROJECT_ACTIONS).flatMap((r) => [...r.anyOf]));
const canAll = (p: string) => ALL.has(p);
const open = (myLevel: ProjectLevel): ProjectGateInput => ({
  myLevel,
  status: 'InProgress',
  isActive: true,
});

/** Contract §2.17.2: the Editor-level commands. Every other write is Manager. */
const EDITOR_ACTIONS: ProjectAction[] = [
  'task.start',
  'task.complete',
  'subtask.create',
  'subtask.update',
  'subtask.delete',
  'subtask.reopen',
  'subtask.complete',
  'comment.add',
  'comment.edit',
  'comment.delete',
];
const ACTIONS = Object.keys(PROJECT_ACTIONS) as ProjectAction[];

describe('myLevel (crmp A-3)', () => {
  it('maps the wire int and name to a level, and anything else to Viewer', () => {
    expect([1, 2, 3, '2', 'Manager', 0, null, 'x'].map(toProjectLevel)).toEqual([
      'Viewer',
      'Editor',
      'Manager',
      'Editor',
      'Manager',
      'Viewer',
      'Viewer',
      'Viewer',
    ]);
  });
});

describe('canProjectAction — action → level table (contract §2.17.2)', () => {
  it.each(ACTIONS)('%s: Viewer never, Manager always (with the claim)', (action) => {
    expect(canProjectAction(open('Viewer'), action, canAll)).toBe(false);
    expect(canProjectAction(open('Manager'), action, canAll)).toBe(true);
  });

  it.each(ACTIONS)('%s: Editor exactly when the contract marks it Editor', (action) => {
    expect(canProjectAction(open('Editor'), action, canAll)).toBe(EDITOR_ACTIONS.includes(action));
  });

  it('needs the route claim even at Manager level', () => {
    expect(canProjectAction(open('Manager'), 'member.add', () => false)).toBe(false);
    expect(
      canProjectAction(open('Manager'), 'member.add', (p) => p === PERM.projects.manageMembers),
    ).toBe(true);
  });

  it('accepts either claim where the route takes either (task start: manage or complete)', () => {
    expect(
      canProjectAction(open('Editor'), 'task.start', (p) => p === PERM.stageTasks.complete),
    ).toBe(true);
    expect(
      canProjectAction(open('Editor'), 'task.complete', (p) => p === PERM.stageTasks.manage),
    ).toBe(false);
  });

  it('a closed project blocks work writes but not the project housekeeping', () => {
    for (const status of ['OnHold', 'Completed', 'Cancelled'] as const) {
      const closed: ProjectGateInput = { myLevel: 'Manager', status, isActive: true };
      expect(isProjectClosed(closed)).toBe(true);
      expect(canProjectAction(closed, 'task.create', canAll)).toBe(false);
      expect(canProjectAction(closed, 'project.status', canAll)).toBe(true);
    }
    const inactive: ProjectGateInput = {
      myLevel: 'Manager',
      status: 'InProgress',
      isActive: false,
    };
    expect(canProjectAction(inactive, 'stage.create', canAll)).toBe(false);
    expect(canProjectAction(inactive, 'project.active', canAll)).toBe(true);
  });

  it('reads the level off ProjectDetails (top level) and Project', () => {
    const project = { myLevel: 'Editor', status: 'Draft', isActive: true } as never;
    expect(canProjectAction(project, 'subtask.create', canAll)).toBe(true);
    const details = {
      myLevel: 'Viewer',
      project: { myLevel: 'Viewer', status: 'Draft', isActive: true },
    } as never;
    expect(canProjectAction(details, 'subtask.create', canAll)).toBe(false);
    expect(canProjectAction(null, 'subtask.create', canAll)).toBe(false);
  });
});

describe('rules that do not depend on the level', () => {
  const editorOnly = (p: string) => p === PERM.stageTasks.complete || p === PERM.stageTasks.read;

  it('task start/complete: the assignee, the stage_tasks.manage claim, or a Manager (TaskExecutors.cs:17-35)', () => {
    const task = { assignedToId: 'E1' };
    expect(canExecuteTask(open('Editor'), task, 'E1', editorOnly, 'task.start')).toBe(true);
    expect(canExecuteTask(open('Editor'), task, 'E2', editorOnly, 'task.start')).toBe(false);
    expect(canExecuteTask(open('Manager'), task, 'E2', editorOnly, 'task.complete')).toBe(true);
    expect(canExecuteTask(open('Editor'), task, 'E2', canAll, 'task.start')).toBe(true);
    expect(canExecuteTask(open('Viewer'), task, 'E1', canAll, 'task.start')).toBe(false);
  });

  it('comment edit/delete: the author or the stage_tasks.manage claim — not the Manager level (TaskCommentHandlers.cs:87-107)', () => {
    const comment = { employeeId: 'E1' };
    expect(canChangeComment(open('Editor'), comment, 'E1', editorOnly, 'comment.edit')).toBe(true);
    expect(canChangeComment(open('Manager'), comment, 'E2', editorOnly, 'comment.delete')).toBe(
      false,
    );
    expect(canChangeComment(open('Editor'), comment, 'E2', canAll, 'comment.delete')).toBe(true);
  });
});
