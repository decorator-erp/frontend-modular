import { TestBed } from '@angular/core/testing';
import { HttpErrorResponse } from '@angular/common/http';
import { of, throwError } from 'rxjs';
import { EditClientDialogComponent, EditClientDialogData } from './edit-client-dialog.component';
import { ClientService } from '../data/client.service';
import { ErrorHandlerService } from '@platform/http/error-handler.service';
import { ToastService } from '@platform/feedback/toast.service';
import { PERA_MODAL_DATA, PeraModalRef } from '@ds';
import type { UpdateClientRequest } from '../model/client.model';

describe('EditClientDialogComponent', () => {
  let updated: { id: string; req: UpdateClientRequest } | null;
  let closedWith: unknown;
  const modalRef = {
    close: (r: unknown) => {
      closedWith = r;
    },
  };

  function make(
    data: EditClientDialogData,
    opts: { fail?: boolean } = {},
  ): EditClientDialogComponent {
    updated = null;
    closedWith = undefined;
    TestBed.resetTestingModule();
    TestBed.configureTestingModule({
      imports: [EditClientDialogComponent],
      providers: [
        {
          provide: ClientService,
          useValue: {
            update: (id: string, req: UpdateClientRequest) => {
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
              generalMessage: 'Email already used',
              fieldErrors: {},
              code: 'authentications.DuplicatedEmail',
              raw: null,
            }),
          },
        },
        { provide: ToastService, useValue: { show: () => undefined } },
        { provide: PeraModalRef, useValue: modalRef },
        { provide: PERA_MODAL_DATA, useValue: data },
      ],
    });
    return TestBed.createComponent(EditClientDialogComponent).componentInstance;
  }

  const data: EditClientDialogData = {
    id: 'c1',
    name: 'Hana Saleh',
    initial: { jobTitle: 'Engineer', maritalStatus: null, representativeName: null },
  };

  it('crm-prod M8: submits exactly the profile fields PUT /clients/{id}/profile accepts (empty → null keeps)', () => {
    const c = make(data);
    c.form.patchValue({ representativeName: '  Omar  ' });
    c.submit();
    expect(updated?.id).toBe('c1');
    expect(updated?.req).toEqual({
      jobTitle: 'Engineer',
      maritalStatus: null,
      representativeName: 'Omar',
    });
    expect(closedWith).toBe(true);
  });

  it('crm-prod M8: offers no name, phone, address or notes field (no backend route updates them)', () => {
    const c = make(data);
    expect(Object.keys(c.form.controls).sort()).toEqual([
      'jobTitle',
      'maritalStatus',
      'representativeName',
    ]);
  });

  it('blocks submit when a field exceeds the backend column length', () => {
    const c = make(data);
    c.form.patchValue({ maritalStatus: 'x'.repeat(65) });
    c.submit();
    expect(updated).toBeNull();
    expect(closedWith).toBeUndefined();
  });

  it('on server error sets the banner and keeps the modal open', () => {
    const c = make(data, { fail: true });
    c.submit();
    expect(c.serverError()).not.toBeNull();
    expect(c.submitting()).toBe(false);
    expect(closedWith).toBeUndefined();
  });
});
