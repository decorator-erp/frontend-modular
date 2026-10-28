import { TestBed } from '@angular/core/testing';
import { HttpErrorResponse } from '@angular/common/http';
import { of, throwError } from 'rxjs';
import { ProjectEditDialogComponent, ProjectEditDialogData } from './project-edit-dialog.component';
import { ProjectService } from '../../data/project.service';
import { ErrorHandlerService } from '@platform/http/error-handler.service';
import { ToastService } from '@platform/feedback/toast.service';
import { PERA_MODAL_DATA, PeraModalRef } from '@ds';
import type { UpdateProjectRequest } from '../../model/project.model';

describe('ProjectEditDialogComponent', () => {
  let updated: { id: string; req: UpdateProjectRequest } | null;
  let closedWith: unknown;
  const modalRef = {
    close: (r: unknown) => {
      closedWith = r;
    },
  };

  function make(
    data: ProjectEditDialogData,
    opts: { fail?: boolean } = {},
  ): ProjectEditDialogComponent {
    updated = null;
    closedWith = undefined;
    TestBed.resetTestingModule();
    TestBed.configureTestingModule({
      imports: [ProjectEditDialogComponent],
      providers: [
        {
          provide: ProjectService,
          useValue: {
            update: (id: string, req: UpdateProjectRequest) => {
              updated = { id, req };
              return opts.fail
                ? throwError(() => new HttpErrorResponse({ status: 409 }))
                : of(undefined);
            },
          },
        },
        {
          provide: ErrorHandlerService,
          useValue: {
            parse: () => ({
              status: 409,
              generalMessage: 'Update failed',
              fieldErrors: {},
              code: 'projects.UpdateFailed',
              raw: null,
            }),
          },
        },
        { provide: ToastService, useValue: { show: () => undefined } },
        { provide: PeraModalRef, useValue: modalRef },
        { provide: PERA_MODAL_DATA, useValue: data },
      ],
    });
    return TestBed.createComponent(ProjectEditDialogComponent).componentInstance;
  }

  const data: ProjectEditDialogData = {
    id: 'p1',
    initial: { name: 'Marina', description: 'old', notes: null },
  };

  it('submits name/description/notes to ProjectService.update with the id', () => {
    const c = make(data);
    c.form.setValue({ name: 'Marina Tower', description: 'New desc', notes: 'hi' });
    c.submit();
    expect(updated?.id).toBe('p1');
    expect(updated?.req).toEqual({ name: 'Marina Tower', description: 'New desc', notes: 'hi' });
    expect(closedWith).toBe(true);
  });

  it('coerces blank description/notes to null', () => {
    const c = make(data);
    c.form.setValue({ name: 'X', description: '   ', notes: '' });
    c.submit();
    expect(updated?.req).toEqual({ name: 'X', description: null, notes: null });
  });

  it('blocks submit and does not call update when name is empty', () => {
    const c = make(data);
    c.form.setValue({ name: '', description: '', notes: '' });
    c.submit();
    expect(updated).toBeNull();
    expect(closedWith).toBeUndefined();
  });

  it('on server error sets the banner and keeps the modal open', () => {
    const c = make(data, { fail: true });
    c.form.setValue({ name: 'Marina Tower', description: '', notes: '' });
    c.submit();
    expect(c.serverError()).not.toBeNull();
    expect(c.submitting()).toBe(false);
    expect(closedWith).toBeUndefined();
  });
});
