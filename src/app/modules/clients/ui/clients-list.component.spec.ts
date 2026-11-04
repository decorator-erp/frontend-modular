import { TestBed } from '@angular/core/testing';
import { HttpErrorResponse } from '@angular/common/http';
import { provideRouter } from '@angular/router';
import { Subject, of, throwError } from 'rxjs';
import { describe, expect, it, vi } from 'vitest';
import { ToastService } from '@platform/feedback/toast.service';
import { ConfirmService, ModalService } from '@ds';
import { ClientService } from '../data/client.service';
import { ClientSearchService } from '../data/client-search.service';
import type { ClientResponse } from '../model/client.model';
import { ClientsListComponent } from './clients-list.component';
import { EditClientDialogComponent } from './edit-client-dialog.component';

const row: ClientResponse = {
  id: 'c1',
  firstName: 'Hana Saleh',
  lastName: '',
  email: 'hana@example.com',
  userName: '',
  isActive: true,
  phoneNumber: null,
  address: 'New Cairo',
  notes: null,
  jobTitle: 'Architect',
  maritalStatus: null,
  representativeName: 'Omar Saleh',
};

function make(getById: ReturnType<typeof vi.fn>) {
  const modal = { open: vi.fn().mockReturnValue({ afterClosed: () => Promise.resolve(false) }) };
  TestBed.configureTestingModule({
    imports: [ClientsListComponent],
    providers: [
      provideRouter([]),
      { provide: ClientService, useValue: { getById } },
      {
        provide: ClientSearchService,
        useValue: {
          search: vi
            .fn()
            .mockReturnValue(of({ items: [row], totalCount: 1, pageIndex: 1, totalPages: 1 })),
        },
      },
      { provide: ModalService, useValue: modal },
      { provide: ConfirmService, useValue: { open: vi.fn() } },
      { provide: ToastService, useValue: { show: vi.fn() } },
    ],
  });
  const c = TestBed.createComponent(ClientsListComponent).componentInstance;
  const edit = c.rowActions.find((a) => a.label === 'Edit')!;
  return { modal, edit };
}

// crm-prod FINDING-P2-5: Edit opened on an empty form, so a save could only ever "keep" values.
describe('ClientsListComponent — Edit pre-fills the stored profile (FINDING-P2-5)', () => {
  it('reads GET /clients/{id} and opens the dialog on job title, marital status and representative', async () => {
    const getById = vi
      .fn()
      .mockReturnValue(
        of({ ...row, maritalStatus: 'Married', jobTitle: 'Engineer', representativeName: 'Omar' }),
      );
    const { modal, edit } = make(getById);
    edit.action(row);
    await vi.waitFor(() => expect(modal.open).toHaveBeenCalled());
    expect(getById).toHaveBeenCalledWith('c1');
    expect(modal.open).toHaveBeenCalledWith(EditClientDialogComponent, {
      size: 'md',
      data: {
        id: 'c1',
        name: 'Hana Saleh',
        initial: { jobTitle: 'Engineer', maritalStatus: 'Married', representativeName: 'Omar' },
      },
    });
  });

  it('falls back to the list row when the single read fails (marital status blank)', async () => {
    const getById = vi
      .fn()
      .mockReturnValue(throwError(() => new HttpErrorResponse({ status: 500 })));
    const { modal, edit } = make(getById);
    edit.action(row);
    await vi.waitFor(() => expect(modal.open).toHaveBeenCalled());
    expect(modal.open.mock.calls[0][1].data.initial).toEqual({
      jobTitle: 'Architect',
      maritalStatus: null,
      representativeName: 'Omar Saleh',
    });
  });
});

// crm-prod FINDING-P2-17: Edit waited for GET /clients/{id} with no in-flight guard.
describe('ClientsListComponent — Edit double click (FINDING-P2-17)', () => {
  it('a second Edit while the read is in flight is ignored: one GET, one dialog', async () => {
    const read = new Subject<ClientResponse>();
    const getById = vi.fn().mockReturnValue(read);
    const { modal, edit } = make(getById);
    edit.action(row);
    edit.action(row);
    expect(getById).toHaveBeenCalledTimes(1);
    read.next(row);
    read.complete();
    await vi.waitFor(() => expect(modal.open).toHaveBeenCalled());
    await Promise.resolve();
    expect(modal.open).toHaveBeenCalledTimes(1);
  });

  it('once the dialog has opened, Edit works again', async () => {
    const getById = vi.fn().mockReturnValue(of(row));
    const { modal, edit } = make(getById);
    edit.action(row);
    await vi.waitFor(() => expect(modal.open).toHaveBeenCalledTimes(1));
    edit.action(row);
    await vi.waitFor(() => expect(modal.open).toHaveBeenCalledTimes(2));
    expect(getById).toHaveBeenCalledTimes(2);
  });
});
