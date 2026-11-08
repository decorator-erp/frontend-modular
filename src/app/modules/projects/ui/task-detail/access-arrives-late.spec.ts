import { TestBed } from '@angular/core/testing';
import { signal } from '@angular/core';
import { of } from 'rxjs';
import { describe, expect, it } from 'vitest';
import { PERM, PermissionsService } from '@platform/permissions';
import { ProjectSubTaskService } from '../../data/project-subtask.service';
import { ProjectAction, ProjectLevel, canProjectAction } from '../../model/project-actions';
import { ProjectAccessStore } from '../../stores/project-access.store';
import { SubtasksPanelComponent } from './subtasks-panel.component';

/**
 * crmp review R-P2-F1: the project (and its level) can arrive after the panel first renders. The write
 * buttons must appear then — they are `@if` on a signal read, not a `*peraCan` input that never re-runs.
 */
describe('access arriving after first render (crmp R-P2-F1)', () => {
  it('shows the sub-task writes once the level arrives, and hides them again when it drops', () => {
    const level = signal<ProjectLevel | null>(null);
    const grants = new Set<string>([PERM.stageTasks.manage, PERM.stageTasks.complete]);
    TestBed.configureTestingModule({
      imports: [SubtasksPanelComponent],
      providers: [
        {
          provide: ProjectSubTaskService,
          useValue: {
            getByTask: () =>
              of([
                {
                  id: 'S1',
                  projectTaskId: 'T1',
                  title: 'x',
                  order: 1,
                  isRequired: true,
                  isDone: false,
                },
              ]),
          },
        },
        { provide: PermissionsService, useValue: { can: () => true } },
        {
          provide: ProjectAccessStore,
          useValue: {
            me: () => null,
            claim: (_id: string, _area: string, p: string) => grants.has(p),
            can: (_id: string, a: ProjectAction) => {
              const l = level();
              return (
                !!l &&
                canProjectAction({ myLevel: l, status: 'InProgress', isActive: true }, a, (p) =>
                  grants.has(p),
                )
              );
            },
          },
        },
      ],
    });
    const f = TestBed.createComponent(SubtasksPanelComponent);
    f.componentRef.setInput('projectId', 'P1');
    f.componentRef.setInput('taskId', 'T1');
    f.detectChanges();
    const el = f.nativeElement as HTMLElement;
    expect(el.querySelector('[data-delete]')).toBeNull();

    level.set('Editor');
    f.detectChanges();
    expect(el.querySelector('[data-delete]')).toBeTruthy();
    expect(el.textContent).toContain('Edit');

    level.set('Viewer');
    f.detectChanges();
    expect(el.querySelector('[data-delete]')).toBeNull();
  });
});
