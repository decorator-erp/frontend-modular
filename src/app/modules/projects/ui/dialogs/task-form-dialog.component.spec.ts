import { TestBed } from '@angular/core/testing';
import { of } from 'rxjs';
import { TaskFormDialogComponent, TaskFormDialogData } from './task-form-dialog.component';
import { ProjectTaskService } from '../../data/project-task.service';
import { ProjectStageService } from '../../data/project-stage.service';
import { EmployeeService } from '@modules/people';
import { ErrorHandlerService } from '@platform/http/error-handler.service';
import { ToastService } from '@platform/feedback/toast.service';
import { PERA_MODAL_DATA, PeraModalRef } from '@ds';
import type { CreateProjectTaskRequest, UpdateProjectTaskRequest } from '../../model/project.model';

describe('TaskFormDialogComponent', () => {
  let created: CreateProjectTaskRequest | null;
  let updated: { id: string; req: UpdateProjectTaskRequest } | null;
  let closedWith: unknown;
  const modalRef = {
    close: (r: unknown) => {
      closedWith = r;
    },
  };

  function make(data: TaskFormDialogData): TaskFormDialogComponent {
    created = null;
    updated = null;
    closedWith = undefined;
    TestBed.resetTestingModule();
    TestBed.configureTestingModule({
      imports: [TaskFormDialogComponent],
      providers: [
        {
          provide: ProjectTaskService,
          useValue: {
            create: (req: CreateProjectTaskRequest) => {
              created = req;
              return of('t-1');
            },
            update: (id: string, req: UpdateProjectTaskRequest) => {
              updated = { id, req };
              return of(undefined);
            },
          },
        },
        { provide: ProjectStageService, useValue: { getByProject: () => of([]) } },
        { provide: EmployeeService, useValue: { listPaged: () => of({ items: [] }) } },
        {
          provide: ErrorHandlerService,
          useValue: {
            parse: () => ({
              status: 409,
              generalMessage: 'x',
              fieldErrors: {},
              code: 'project_tasks.UpdateFailed',
              raw: null,
            }),
          },
        },
        { provide: ToastService, useValue: { show: () => undefined } },
        { provide: PeraModalRef, useValue: modalRef },
        { provide: PERA_MODAL_DATA, useValue: data },
      ],
    });
    return TestBed.createComponent(TaskFormDialogComponent).componentInstance;
  }

  it('create posts the CreateProjectTaskRequest shape (startDate, projectStageId, numeric weight/order)', () => {
    const c = make({ mode: 'create', projectId: 'p1', projectStageId: 's1', nextOrder: 20 });
    c.form.patchValue({
      name: 'Issue redlined floor plan',
      estimatedStartDate: '2026-04-01',
      dueDate: '2026-04-18',
    });
    c.submit();
    expect(created).toEqual({
      projectId: 'p1',
      name: 'Issue redlined floor plan',
      order: 20,
      weight: 1,
      priority: 'Medium',
      projectStageId: 's1',
      assignedToId: null,
      startDate: '2026-04-01',
      dueDate: '2026-04-18',
      description: null,
      notes: null,
    });
    expect(closedWith).toBe(true);
  });

  it('edit PUTs the UpdateProjectTaskRequest shape (estimatedStartDate, no stage/assignee)', () => {
    const c = make({
      mode: 'edit',
      projectId: 'p1',
      taskId: 't9',
      initial: {
        name: 'Old',
        order: 20,
        weight: 2,
        priority: 'High',
        estimatedStartDate: '2026-04-01',
        dueDate: null,
        description: null,
        notes: null,
      },
    });
    expect(c.isEdit).toBe(true);
    c.form.patchValue({ name: 'New name' });
    c.submit();
    expect(updated?.id).toBe('t9');
    expect(updated?.req).toEqual({
      name: 'New name',
      order: 20,
      weight: 2,
      priority: 'High',
      estimatedStartDate: '2026-04-01',
      dueDate: null,
      description: null,
      notes: null,
    });
    expect(created).toBeNull();
  });

  it('blocks submit when weight is not greater than 0', () => {
    const c = make({ mode: 'create', projectId: 'p1', nextOrder: 10 });
    c.form.patchValue({ name: 'Task', weight: '0' });
    c.submit();
    expect(created).toBeNull();
    expect(closedWith).toBeUndefined();
  });
});
