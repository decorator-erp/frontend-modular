import { TestBed } from '@angular/core/testing';
import { of } from 'rxjs';
import { SubtaskFormDialogComponent, SubtaskFormDialogData } from './subtask-form-dialog.component';
import { ProjectSubTaskService } from '../../data/project-subtask.service';
import { ErrorHandlerService } from '@platform/http/error-handler.service';
import { ToastService } from '@platform/feedback/toast.service';
import { PERA_MODAL_DATA, PeraModalRef } from '@ds';
import type {
  CreateProjectSubTaskRequest,
  UpdateProjectSubTaskRequest,
} from '../../model/project.model';

describe('SubtaskFormDialogComponent', () => {
  let created: CreateProjectSubTaskRequest | null;
  let updated: { id: string; req: UpdateProjectSubTaskRequest } | null;
  let closedWith: unknown;
  let route: { projectId: string; taskId: string } | null;
  const modalRef = {
    close: (r: unknown) => {
      closedWith = r;
    },
  };

  function make(data: SubtaskFormDialogData): SubtaskFormDialogComponent {
    created = null;
    updated = null;
    route = null;
    closedWith = undefined;
    TestBed.resetTestingModule();
    TestBed.configureTestingModule({
      imports: [SubtaskFormDialogComponent],
      providers: [
        {
          provide: ProjectSubTaskService,
          useValue: {
            create: (projectId: string, taskId: string, req: CreateProjectSubTaskRequest) => {
              created = req;
              route = { projectId, taskId };
              return of('sub-1');
            },
            update: (
              projectId: string,
              taskId: string,
              id: string,
              req: UpdateProjectSubTaskRequest,
            ) => {
              updated = { id, req };
              route = { projectId, taskId };
              return of(undefined);
            },
          },
        },
        {
          provide: ErrorHandlerService,
          useValue: {
            parse: () => ({
              status: 409,
              generalMessage: 'x',
              fieldErrors: {},
              code: 'project_sub_tasks.CreationFailed',
              raw: null,
            }),
          },
        },
        { provide: ToastService, useValue: { show: () => undefined } },
        { provide: PeraModalRef, useValue: modalRef },
        { provide: PERA_MODAL_DATA, useValue: data },
      ],
    });
    return TestBed.createComponent(SubtaskFormDialogComponent).componentInstance;
  }

  it('create posts title/order/isRequired to the project + task route (crmp A-2)', () => {
    const c = make({ mode: 'create', projectId: 'p1', projectTaskId: 't1', nextOrder: 30 });
    c.form.patchValue({ title: 'Confirm ceiling heights', isRequired: true });
    c.submit();
    expect(route).toEqual({ projectId: 'p1', taskId: 't1' });
    expect(created).toEqual({
      title: 'Confirm ceiling heights',
      order: 30,
      isRequired: true,
    });
    expect(closedWith).toBe(true);
  });

  it('edit PUTs title/order/isRequired with the id', () => {
    const c = make({
      mode: 'edit',
      projectId: 'p1',
      projectTaskId: 't1',
      subtaskId: 'sub9',
      initial: { title: 'Old', order: 10, isRequired: false },
    });
    c.form.patchValue({ title: 'New' });
    c.submit();
    expect(updated?.id).toBe('sub9');
    expect(route).toEqual({ projectId: 'p1', taskId: 't1' });
    expect(updated?.req).toEqual({
      title: 'New',
      description: null,
      order: 10,
      isRequired: false,
    });
    expect(created).toBeNull();
  });

  it('B2 (CP-3): edit resends the description — the PUT is a full replace (ManualSubTaskHandlers.cs:133)', () => {
    const c = make({
      mode: 'edit',
      projectId: 'p1',
      projectTaskId: 't1',
      subtaskId: 'sub9',
      initial: { title: 'Old', description: 'From the template', order: 10, isRequired: true },
    });
    c.form.patchValue({ title: 'New' });
    c.submit();
    expect(updated?.req).toEqual({
      title: 'New',
      description: 'From the template',
      order: 10,
      isRequired: true,
    });
  });

  it('B2 (CP-3): the title is capped at 200 characters (ManualSubTaskHandlers.cs:19,29)', () => {
    const c = make({ mode: 'create', projectId: 'p1', projectTaskId: 't1', nextOrder: 10 });
    c.form.patchValue({ title: 'x'.repeat(201) });
    c.submit();
    expect(created).toBeNull();
    c.form.patchValue({ title: 'x'.repeat(200) });
    c.submit();
    expect(created?.title.length).toBe(200);
  });

  it('blocks submit when the title is empty', () => {
    const c = make({ mode: 'create', projectId: 'p1', projectTaskId: 't1', nextOrder: 10 });
    c.form.patchValue({ title: '' });
    c.submit();
    expect(created).toBeNull();
    expect(closedWith).toBeUndefined();
  });
});
