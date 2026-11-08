import { NO_ERRORS_SCHEMA } from '@angular/core';
import { TestBed } from '@angular/core/testing';
import { FormsModule } from '@angular/forms';
import { NgComponentOutlet } from '@angular/common';
import { ActivatedRoute, RouterLink, convertToParamMap, provideRouter } from '@angular/router';
import { of } from 'rxjs';
import { describe, expect, it, vi } from 'vitest';
import { DepartmentService, EmployeeService } from '@modules/people';
import { PermissionsService } from '@platform/permissions';
import { ProjectTaskService } from '../../data/project-task.service';
import { ProjectService } from '../../data/project.service';
import { ProjectStageService } from '../../data/project-stage.service';
import { ProjectAccessStore } from '../../stores/project-access.store';
import type { ProjectTask, TaskDetails } from '../../model/project.model';
import { TaskDetailComponent } from './task-detail.component';

function task(o: Partial<ProjectTask> = {}): ProjectTask {
  return {
    id: 'T1',
    projectId: 'P1',
    projectStageId: null,
    stageTaskId: null,
    assignedToId: null,
    name: 'Paint the hall',
    description: null,
    order: 1,
    status: 'Open',
    priority: 'Medium',
    weight: 1,
    notes: null,
    estimatedStartDate: null,
    startedOnUtc: null,
    completedOnUtc: null,
    dueDate: null,
    progressPercent: null,
    ...o,
  };
}

/** The page's own template, child panels left as inert elements (NO_ERRORS_SCHEMA). */
function render(t: ProjectTask) {
  const getById = vi.fn(() => of({ id: 'D4', name: 'Joinery' }));
  const details: TaskDetails = {
    task: t,
    subTasks: [],
    subTasksCount: 0,
    commentsCount: 0,
    gates: { total: 0, pending: 0, satisfied: 0, rejected: 0 },
  };
  TestBed.configureTestingModule({
    providers: [
      provideRouter([]),
      {
        provide: ActivatedRoute,
        useValue: { snapshot: { paramMap: convertToParamMap({ id: 'P1', taskId: 'T1' }) } },
      },
      { provide: ProjectTaskService, useValue: { getDetails: () => of(details) } },
      { provide: ProjectService, useValue: { getById: () => of(null) } },
      { provide: ProjectStageService, useValue: { getDetails: () => of(null) } },
      {
        provide: EmployeeService,
        useValue: { listPaged: () => of({ items: [] }), getMe: () => of({ id: 'E1' }) },
      },
      { provide: DepartmentService, useValue: { getById } },
      { provide: PermissionsService, useValue: { can: () => true } },
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
  TestBed.overrideComponent(TaskDetailComponent, {
    set: { imports: [FormsModule, RouterLink, NgComponentOutlet], schemas: [NO_ERRORS_SCHEMA] },
  });
  const fixture = TestBed.createComponent(TaskDetailComponent);
  fixture.detectChanges();
  return { el: fixture.nativeElement as HTMLElement, getById, fixture };
}

describe('TaskDetailComponent — sync with the backend contract', () => {
  it('W1-4: shows no Start date or Duration row (the task has no planned start)', () => {
    const { el } = render(task({ dueDate: '2026-12-01' }));
    expect(el.textContent).toContain('Due date');
    expect(el.textContent).not.toContain('Start date');
    expect(el.textContent).not.toContain('Set start date');
    expect(el.textContent).not.toContain('Duration');
  });

  it('W1-13: hides the Linked-items panel (no dependency-tree backend)', () => {
    const { el } = render(task());
    expect(el.querySelector('app-dms-linked-items')).toBeNull();
    expect(el.textContent).not.toContain('Linked items');
  });

  it("W2-10: shows the task's department, resolved by name with one read", () => {
    const { el, getById } = render(task({ departmentId: 'D4' }));
    expect(getById).toHaveBeenCalledTimes(1);
    expect(getById).toHaveBeenCalledWith('D4');
    expect(el.querySelector('[data-department]')?.textContent).toContain('Joinery');
  });

  it('W2-10: no department row and no read when the task has none', () => {
    const { el, getById } = render(task());
    expect(getById).not.toHaveBeenCalled();
    expect(el.querySelector('[data-department]')).toBeNull();
  });

  it('W1-5: the History tab asks for the entity name the backend writes ("ProjectTask")', () => {
    const { fixture, el } = render(task());
    fixture.componentInstance.activityView.set('history');
    fixture.detectChanges();
    expect(el.querySelector('app-activity-feed')?.getAttribute('entityName')).toBe('ProjectTask');
  });
});
