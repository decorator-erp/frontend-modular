import { TestBed } from '@angular/core/testing';
import { HttpErrorResponse } from '@angular/common/http';
import { of, throwError } from 'rxjs';
import { describe, expect, it, vi } from 'vitest';
import { ToastService } from '@platform/feedback/toast.service';
import { PERA_MODAL_DATA, PeraModalRef } from '@ds';
import { CrmLeadService } from '../../data/crm-lead.service';
import { CrmConvertLeadComponent } from './convert-lead.component';

const clientPage = {
  items: [
    { id: 'C1', displayName: 'Mona Adel', email: 'm@x.io' },
    { id: 'C2', displayName: null, email: 'b@x.io' },
    { id: 'C3', displayName: null, email: null },
  ],
  totalCount: 3,
  page: 1,
  pageSize: 200,
  totalPages: 1,
};

function make(convert: ReturnType<typeof vi.fn>, searchClients = vi.fn(() => of(clientPage))) {
  TestBed.configureTestingModule({
    imports: [CrmConvertLeadComponent],
    providers: [
      { provide: CrmLeadService, useValue: { convert, searchClients } },
      { provide: ToastService, useValue: { show: () => undefined } },
      { provide: PeraModalRef, useValue: { close: () => undefined } },
      { provide: PERA_MODAL_DATA, useValue: { leadId: 'L1' } },
    ],
  });
  const c = TestBed.createComponent(CrmConvertLeadComponent).componentInstance;
  c.form.patchValue({ existingClientId: 'C' });
  return c;
}

describe('CrmConvertLeadComponent — convert (009b #7)', () => {
  it('converts into the picked client with { existingClientId } only', () => {
    const convert = vi.fn().mockReturnValue(of({ clientId: 'C' }));
    make(convert).submit();
    expect(convert).toHaveBeenCalledWith('L1', { existingClientId: 'C' });
  });

  it('shows a 404 crm.clients.NotFound as "client not found"', () => {
    const notFound = new HttpErrorResponse({
      status: 404,
      error: {
        status: 404,
        title: 'crm.clients.NotFound',
        detail: 'Client was not found.',
        errors: { 'crm.clients.NotFound': ['Client was not found.'] },
      },
    });
    const c = make(vi.fn().mockReturnValue(throwError(() => notFound)));
    c.submit();
    expect(c.serverError()?.generalMessage).toBe('Client not found.');
  });

  it('offers the visible active clients labelled displayName ?? email ?? id (009b #31)', () => {
    const searchClients = vi.fn(() => of(clientPage));
    const c = make(vi.fn(), searchClients);

    expect(searchClients).toHaveBeenCalledWith({ pageSize: 200 });
    expect(c.clients().map((o) => o.label)).toEqual(['Mona Adel', 'b@x.io', 'C3']);
  });
});
