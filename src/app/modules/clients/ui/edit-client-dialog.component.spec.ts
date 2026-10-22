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
    initial: {
      firstName: 'Hana',
      lastName: 'Saleh',
      phone: '0512345678',
      address: 'Riyadh, KSA',
      notes: null,
    },
  };

  it('submits only the editable fields (no email/username/password) to ClientService.update', () => {
    const c = make(data);
    c.form.patchValue({ firstName: 'Hanaa' });
    c.submit();
    expect(updated?.id).toBe('c1');
    expect(updated?.req).toEqual({
      firstName: 'Hanaa',
      lastName: 'Saleh',
      phone: '0512345678',
      address: 'Riyadh, KSA',
      notes: undefined,
    });
    expect(Object.keys(updated!.req)).not.toContain('email');
    expect(Object.keys(updated!.req)).not.toContain('userName');
    expect(closedWith).toBe(true);
  });

  it('blocks submit when a required field is cleared', () => {
    const c = make(data);
    c.form.patchValue({ address: '' });
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
