import { TestBed } from '@angular/core/testing';
import { of } from 'rxjs';
import { describe, expect, it } from 'vitest';
import { PERM } from '@platform/permissions';
import { ProjectTaskService } from '../../data/project-task.service';
import {
  ProjectAction,
  ProjectGateInput,
  ProjectLevel,
  canExecuteTask,
  canProjectAction,
} from '../../model/project-actions';
import type { ProjectTask } from '../../model/project.model';
import { ProjectAccessStore } from '../../stores/project-access.store';
import { TaskStatusActionsComponent } from './status-actions.component';

const ALL = new Set<string>([
  PERM.stageTasks.manage,
  PERM.stageTasks.complete,
  PERM.stageTasks.assign,
]);
const EXEC_ONLY = new Set<string>([PERM.stageTasks.complete]);

/** crmp P-3/P-4: task buttons follow claim AND level AND open project, plus the assignee rule. */
describe('TaskStatusActionsComponent — levels (crmp P-3/P-4)', () => {
  function render(
    status: string,
    level: ProjectLevel,
    grants: Set<string>,
    assignee: string | null,
  ) {
    const gate: ProjectGateInput = { myLevel: level, status: 'InProgress', isActive: true };
    const can = (p: string) => grants.has(p);
    TestBed.configureTestingModule({
      imports: [TaskStatusActionsComponent],
      providers: [
        { provide: ProjectTaskService, useValue: { start: () => of(undefined) } },
        {
          provide: ProjectAccessStore,
          useValue: {
            can: (_id: string, a: ProjectAction) => canProjectAction(gate, a, can),
            canExecute: (
              _id: string,
              t: { assignedToId: string | null },
              a: 'task.start' | 'task.complete',
            ) => canExecuteTask(gate, t, 'ME', can, a),
            refresh: () => undefined,
          },
        },
      ],
    });
    const f = TestBed.createComponent(TaskStatusActionsComponent);
    f.componentRef.setInput('task', {
      id: 'T1',
      projectId: 'P1',
      name: 't',
      status,
      assignedToId: assignee,
    } as ProjectTask);
    f.detectChanges();
    const el = f.nativeElement as HTMLElement;
    return (sel: string) => !!el.querySelector(sel);
  }

  it('Viewer: no buttons at all', () => {
    const has = render('Open', 'Viewer', ALL, 'ME');
    expect(['[data-start]', '[data-delete]', '[data-cancel]'].some(has)).toBe(false);
  });

  it('Editor: starts or completes only their own task; never delete/cancel', () => {
    expect(render('Open', 'Editor', EXEC_ONLY, 'ME')('[data-start]')).toBe(true);
    TestBed.resetTestingModule();
    expect(render('Open', 'Editor', EXEC_ONLY, 'OTHER')('[data-start]')).toBe(false);
    TestBed.resetTestingModule();
    const has = render('InProgress', 'Editor', EXEC_ONLY, 'ME');
    expect(has('[data-complete]')).toBe(true);
    expect(has('[data-cancel]')).toBe(false);
  });

  it('Manager: start anyone’s task, cancel, delete before it starts, reopen when closed', () => {
    const open = render('Open', 'Manager', ALL, 'OTHER');
    expect(open('[data-start]')).toBe(true);
    expect(open('[data-delete]')).toBe(true);
    expect(open('[data-cancel]')).toBe(true);
    TestBed.resetTestingModule();
    const started = render('InProgress', 'Manager', ALL, 'OTHER');
    expect(started('[data-delete]')).toBe(false);
    TestBed.resetTestingModule();
    const done = render('Completed', 'Manager', ALL, 'OTHER');
    expect(done('[data-reopen]')).toBe(true);
    expect(done('[data-cancel]')).toBe(false);
  });
});
