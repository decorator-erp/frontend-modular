import { ProjectAccessStore } from '../../stores/project-access.store';
import { TestBed } from '@angular/core/testing';
import { ActivatedRoute, convertToParamMap, provideRouter } from '@angular/router';
import { of } from 'rxjs';
import { describe, expect, it } from 'vitest';
import { DepartmentService, EmployeeService } from '@modules/people';
import { PermissionsService } from '@platform/permissions';
import { ProjectTaskService } from '../../data/project-task.service';
import { ProjectService } from '../../data/project.service';
import { ProjectStageService } from '../../data/project-stage.service';
import { TaskDetailComponent } from './task-detail.component';

/**
 * crmp review R1-F8: TaskRequest has no start date (dms TaskEndpoints.cs:228) — the editor is off.
 * Sync W1-4: it is now removed outright (no `canEditStart`, no 'start' field on the date editor).
 */
describe('TaskDetailComponent — planned start is read-only (crmp R1-F8)', () => {
  it('never opens the start-date editor, even for a task manager', () => {
    TestBed.configureTestingModule({
      providers: [
        provideRouter([]),
        {
          provide: ActivatedRoute,
          useValue: { snapshot: { paramMap: convertToParamMap({ id: 'P1', taskId: 'T1' }) } },
        },
        { provide: ProjectTaskService, useValue: { getDetails: () => of(null) } },
        { provide: ProjectService, useValue: { getById: () => of(null) } },
        { provide: ProjectStageService, useValue: { getDetails: () => of(null) } },
        {
          provide: EmployeeService,
          useValue: { listPaged: () => of({ items: [] }), getMe: () => of({ id: 'E1' }) },
        },
        { provide: PermissionsService, useValue: { can: () => true } },
        { provide: DepartmentService, useValue: { getById: () => of(null) } },
        {
          provide: ProjectAccessStore,
          useValue: {
            ensure: () => undefined,
            can: () => true,
            canExecute: () => true,
            project: () => () => null,
          },
        },
      ],
    });
    const c = TestBed.runInInjectionContext(() => new TaskDetailComponent());
    expect('canEditStart' in c).toBe(false);
    // @ts-expect-error — 'start' is no longer an editable date field (sync W1-4).
    c.startEditDate('start', '2026-12-01');
    expect(c.editingField()).toBeNull();
    c.startEditDate('due', '2026-12-01');
    expect(c.editingField()).toBe('due');
  });
});
