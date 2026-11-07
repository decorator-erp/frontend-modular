import { TestBed } from '@angular/core/testing';
import { of } from 'rxjs';
import { describe, expect, it, vi } from 'vitest';
import { PERM, PermissionsService } from '@platform/permissions';
import { ProjectSubTaskService } from '../../data/project-subtask.service';
import { ProjectAction, ProjectLevel, canProjectAction } from '../../model/project-actions';
import { ProjectAccessStore } from '../../stores/project-access.store';
import { SubtasksPanelComponent } from './subtasks-panel.component';

const subs = [
  { id: 'S1', projectTaskId: 'T1', title: 'Measure', order: 10, isRequired: true, isDone: false },
  { id: 'S2', projectTaskId: 'T1', title: 'Photos', order: 20, isRequired: false, isDone: true },
];

/** crmp P-5: sub-task writes are Editor-level; only required ones are marked REQUIRED. */
describe('SubtasksPanelComponent — levels (crmp P-5)', () => {
  function render(level: ProjectLevel) {
    const grants = new Set<string>([PERM.stageTasks.manage, PERM.stageTasks.complete]);
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
});
