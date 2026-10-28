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
  const modalRef = {
    close: (r: unknown) => {
      closedWith = r;
    },
  };

  function make(data: SubtaskFormDialogData): SubtaskFormDialogComponent {
    created = null;
    updated = null;
    closedWith = undefined;
    TestBed.resetTestingModule();
    TestBed.configureTestingModule({
      imports: [SubtaskFormDialogComponent],
      providers: [
        {
          provide: ProjectSubTaskService,
          useValue: {
            create: (req: CreateProjectSubTaskRequest) => {
              created = req;
              return of('sub-1');
            },
            update: (id: string, req: UpdateProjectSubTaskRequest) => {
              updated = { id, req };
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

  it('create posts projectTaskId + title/order/isRequired', () => {
    const c = make({ mode: 'create', projectTaskId: 't1', nextOrder: 30 });
    c.form.patchValue({ title: 'Confirm ceiling heights', isRequired: true });
    c.submit();
    expect(created).toEqual({
      projectTaskId: 't1',
      title: 'Confirm ceiling heights',
      order: 30,
      isRequired: true,
    });
    expect(closedWith).toBe(true);
  });

  it('edit PUTs title/order/isRequired with the id', () => {
    const c = make({
      mode: 'edit',
      projectTaskId: 't1',
      subtaskId: 'sub9',
      initial: { title: 'Old', order: 10, isRequired: false },
    });
    c.form.patchValue({ title: 'New' });
    c.submit();
    expect(updated?.id).toBe('sub9');
    expect(updated?.req).toEqual({ title: 'New', order: 10, isRequired: false });
    expect(created).toBeNull();
  });

  it('blocks submit when the title is empty', () => {
    const c = make({ mode: 'create', projectTaskId: 't1', nextOrder: 10 });
    c.form.patchValue({ title: '' });
    c.submit();
    expect(created).toBeNull();
    expect(closedWith).toBeUndefined();
  });
});
