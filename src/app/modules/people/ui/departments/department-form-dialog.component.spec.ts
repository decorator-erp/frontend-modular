import { TestBed } from '@angular/core/testing';
import { of } from 'rxjs';
import {
  DepartmentFormDialogComponent,
  DepartmentFormDialogData,
} from './department-form-dialog.component';
import { DepartmentService } from '../../data/department.service';
import { ErrorHandlerService } from '@platform/http/error-handler.service';
import { ToastService } from '@platform/feedback/toast.service';
import { PERA_MODAL_DATA, PeraModalRef } from '@ds';
import type { CreateDepartmentRequest, UpdateDepartmentRequest } from '../../model/people.model';

describe('DepartmentFormDialogComponent', () => {
  let created: CreateDepartmentRequest | null;
  let updated: { id: string; req: UpdateDepartmentRequest } | null;
  let closedWith: unknown;
  const modalRef = {
    close: (r: unknown) => {
      closedWith = r;
    },
  };

  function make(data: DepartmentFormDialogData | null): DepartmentFormDialogComponent {
    created = null;
    updated = null;
    closedWith = undefined;
    TestBed.resetTestingModule();
    TestBed.configureTestingModule({
      imports: [DepartmentFormDialogComponent],
      providers: [
        {
          provide: DepartmentService,
          useValue: {
            create: (req: CreateDepartmentRequest) => {
              created = req;
              return of(undefined);
            },
            update: (id: string, req: UpdateDepartmentRequest) => {
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
              code: 'departments.DuplicatedName',
              raw: null,
            }),
          },
        },
        { provide: ToastService, useValue: { show: () => undefined } },
        { provide: PeraModalRef, useValue: modalRef },
        { provide: PERA_MODAL_DATA, useValue: data },
      ],
    });
    return TestBed.createComponent(DepartmentFormDialogComponent).componentInstance;
  }

  it('create mode POSTs name + description via DepartmentService.create', () => {
    const c = make(null);
    expect(c.isEdit).toBe(false);
    c.form.setValue({ name: 'Architecture', description: 'Design team' });
    c.submit();
    expect(created).toEqual({ name: 'Architecture', description: 'Design team' });
    expect(updated).toBeNull();
    expect(closedWith).toBe(true);
  });

  it('edit mode PUTs to update with the id and seeds from current values', () => {
    const c = make({ id: 'd1', currentName: 'Ops', currentDescription: 'Operations' });
    expect(c.isEdit).toBe(true);
    expect(c.form.getRawValue()).toEqual({ name: 'Ops', description: 'Operations' });
    c.form.patchValue({ name: 'Operations' });
    c.submit();
    expect(updated?.id).toBe('d1');
    expect(updated?.req.name).toBe('Operations');
    expect(created).toBeNull();
  });

  it('blocks submit when name is empty', () => {
    const c = make(null);
    c.form.setValue({ name: '', description: '' });
    c.submit();
    expect(created).toBeNull();
    expect(closedWith).toBeUndefined();
  });
});

/**
 * 006b-2 #15. Department edit is a full replacement in backend v3: the description allows up to
 * 2000 characters (`UpdateDepartmentCommandValidator`), a blank one clears it (the handler stores
 * `null` for whitespace), and a casing-only rename succeeds (no client block exists).
 */
describe('DepartmentFormDialogComponent — backend v3 limits (006b-2 #15)', () => {
  let updated: { id: string; req: UpdateDepartmentRequest } | null = null;

  function make(): DepartmentFormDialogComponent {
    updated = null;
    TestBed.resetTestingModule();
    TestBed.configureTestingModule({
      imports: [DepartmentFormDialogComponent],
      providers: [
        {
          provide: DepartmentService,
          useValue: {
            update: (id: string, req: UpdateDepartmentRequest) => {
              updated = { id, req };
              return of(undefined);
            },
          },
        },
        { provide: ToastService, useValue: { show: () => undefined } },
        { provide: PeraModalRef, useValue: { close: () => undefined } },
        {
          provide: PERA_MODAL_DATA,
          useValue: { id: 'd-1', currentName: 'Design', currentDescription: 'Old' },
        },
      ],
    });
    return TestBed.createComponent(DepartmentFormDialogComponent).componentInstance;
  }

  it('accepts a 2000-character description and sends it', () => {
    const c = make();
    const long = 'x'.repeat(2000);
    c.form.patchValue({ description: long });
    expect(c.form.valid).toBe(true);
    c.submit();
    expect(updated?.req.description).toBe(long);
  });

  it('rejects 2001 characters client-side', () => {
    const c = make();
    c.form.patchValue({ description: 'x'.repeat(2001) });
    expect(c.form.controls.description.invalid).toBe(true);
  });

  it('a blank description is sent blank (the server clears it), and a casing-only rename goes through', () => {
    const c = make();
    c.form.patchValue({ name: 'DESIGN', description: '' });
    c.submit();
    expect(updated).toEqual({ id: 'd-1', req: { name: 'DESIGN', description: '' } });
  });
});
