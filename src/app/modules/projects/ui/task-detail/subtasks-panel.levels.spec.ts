import { TestBed } from '@angular/core/testing';
import { of } from 'rxjs';
import { describe, expect, it, vi } from 'vitest';
import { PERM, PermissionsService } from '@platform/permissions';
import { ProjectSubTaskService } from '../../data/project-subtask.service';
import type { ProjectTaskStatus } from '../../model/project.model';
import { ProjectAction, ProjectLevel, canProjectAction } from '../../model/project-actions';
import { ProjectAccessStore } from '../../stores/project-access.store';
import { SubtasksPanelComponent } from './subtasks-panel.component';

const subs = [
  { id: 'S1', projectTaskId: 'T1', title: 'Measure', order: 10, isRequired: true, isDone: false },
  { id: 'S2', projectTaskId: 'T1', title: 'Photos', order: 20, isRequired: false, isDone: true },
];

/** crmp P-5: sub-task writes are Editor-level; only required ones are marked REQUIRED. */
describe('SubtasksPanelComponent — levels (crmp P-5)', () => {
  function render(
    level: ProjectLevel,
    opts: {
      grants?: string[];
      taskStatus?: ProjectTaskStatus;
      assignedToId?: string | null;
      me?: string | null;
    } = {},
  ) {
    const grants = new Set<string>(
      opts.grants ?? [PERM.stageTasks.manage, PERM.stageTasks.complete],
    );
    TestBed.configureTestingModule({
      imports: [SubtasksPanelComponent],
      providers: [
        {
          provide: ProjectSubTaskService,
          useValue: { getByTask: () => of(subs), markDone: vi.fn(() => of(undefined)) },
        },
        {
          provide: PermissionsService,
          useValue: {
            can: (p: string | string[]) => (Array.isArray(p) ? p : [p]).some((x) => grants.has(x)),
          },
        },
        {
          provide: ProjectAccessStore,
          useValue: {
            me: () => opts.me ?? null,
            claim: (_id: string, _area: string, p: string) => grants.has(p),
            can: (_id: string, a: ProjectAction) =>
              canProjectAction({ myLevel: level, status: 'InProgress', isActive: true }, a, (p) =>
                grants.has(p),
              ),
          },
        },
      ],
    });
    const f = TestBed.createComponent(SubtasksPanelComponent);
    f.componentRef.setInput('projectId', 'P1');
    f.componentRef.setInput('taskId', 'T1');
    f.componentRef.setInput('taskStatus', opts.taskStatus ?? 'InProgress');
    f.componentRef.setInput('assignedToId', opts.assignedToId ?? null);
    f.detectChanges();
    return { el: f.nativeElement as HTMLElement, c: f.componentInstance };
  }

  it('Viewer: read-only (no toggle, edit, delete or add)', () => {
    const { el, c } = render('Viewer');
    expect(c.canManage()).toBe(false);
    expect(el.textContent).not.toContain('Edit');
    expect(el.querySelector('[data-delete]')).toBeNull();
  });

  it.each(['Editor', 'Manager'] as const)(
    '%s: toggles, edits; delete only on a sub-task not done',
    (lvl) => {
      const { el, c } = render(lvl);
      expect(c.canManage()).toBe(true);
      expect(el.textContent).toContain('Edit');
      expect(el.querySelectorAll('[data-delete]').length).toBe(1);
    },
  );

  it('marks optional sub-tasks as optional and required ones as REQUIRED', () => {
    const { el } = render('Editor');
    expect(el.textContent).toContain('REQUIRED');
    expect(el.querySelectorAll('[data-optional]').length).toBe(1);
  });

  it('B2 (CP-2a): with only stage_tasks.complete, the toggle is for the task assignee (ProjectSubTaskHandlers.cs:48-52)', () => {
    const other = render('Editor', {
      grants: [PERM.stageTasks.complete],
      assignedToId: 'E1',
      me: 'E2',
    });
    expect(other.c.canManage()).toBe(false);
    expect(other.el.querySelector('input[type=checkbox]')).toBeNull();
    TestBed.resetTestingModule();
    const mine = render('Editor', {
      grants: [PERM.stageTasks.complete],
      assignedToId: 'E1',
      me: 'E1',
    });
    expect(mine.c.canManage()).toBe(true);
  });

  it("B2 (CP-2a): a stage_tasks.manage holder toggles any task's sub-tasks", () => {
    const { c } = render('Editor', { assignedToId: 'E1', me: 'E2' });
    expect(c.canManage()).toBe(true);
  });

  it.each(['Completed', 'Cancelled'] as const)(
    'B2 (CP-2b): on a %s task every sub-task write is hidden (409 projects.subtasks.TaskClosed)',
    (taskStatus) => {
      const { el, c } = render('Manager', { taskStatus });
      expect(c.canManage()).toBe(false);
      expect(el.querySelector('input[type=checkbox]')).toBeNull();
      expect(el.textContent).not.toContain('Edit');
      expect(el.querySelector('[data-delete]')).toBeNull();
      expect(el.textContent).not.toContain('New sub-task');
    },
  );
});
