import { TestBed } from '@angular/core/testing';
import { HttpErrorResponse } from '@angular/common/http';
import { of, throwError } from 'rxjs';
import { describe, expect, it, vi } from 'vitest';
import { EmployeeService } from '@modules/people';
import { ToastService } from '@platform/feedback/toast.service';
import { PERA_MODAL_DATA, PeraModalRef } from '@ds';
import { CrmLeadService, type CrmLead } from '../../../data/crm-lead.service';
import { LeadSource, LeadStatus } from '../../../model/crm-enums';
import { CrmLeadFormComponent } from './lead-form.component';

function problem(code: string): HttpErrorResponse {
  return new HttpErrorResponse({
    status: 400,
    error: { status: 400, title: code, detail: 'x', errors: { [code]: ['x'] } },
  });
}

function make(code: string) {
  TestBed.configureTestingModule({
    imports: [CrmLeadFormComponent],
    providers: [
      { provide: CrmLeadService, useValue: { create: () => throwError(() => problem(code)) } },
      { provide: EmployeeService, useValue: { listPaged: () => of({ items: [] }) } },
      { provide: ToastService, useValue: { show: () => undefined } },
      { provide: PeraModalRef, useValue: { close: () => undefined } },
    ],
  });
  const c = TestBed.createComponent(CrmLeadFormComponent).componentInstance;
  c.form.patchValue({ firstName: 'Mona', lastName: 'Adel', ownerId: 'E1' });
  c.submit();
  return c;
}

describe('CrmLeadFormComponent — create errors land on their control (009b #3)', () => {
  it('maps crm.leads.OwnerNotFound onto the owner control', () => {
    const c = make('crm.leads.OwnerNotFound');
    expect(c.errorOf('ownerId')).toBe('The owner must be an active employee.');
  });

  it('maps crm.leads.NameRequired onto the first-name control', () => {
    const c = make('crm.leads.NameRequired');
    expect(c.errorOf('firstName')).toBe('First and last name are required.');
  });
});

describe('CrmLeadFormComponent — edit mode (crm-prod H3)', () => {
  const lead: CrmLead = {
    id: 'L',
    firstName: 'Mona',
    lastName: 'Adel',
    email: 'mona@example.com',
    phone: null,
    source: LeadSource.Referral,
    status: LeadStatus.Contacted,
    ownerId: 'E1',
    notes: 'call back',
    convertedClientId: null,
    convertedAtUtc: null,
  };

  it('prefills the lead and saves through update (PUT /{id}), never create', () => {
    const api = { create: vi.fn(), update: vi.fn().mockReturnValue(of(undefined)) };
    const close = vi.fn();
    TestBed.configureTestingModule({
      imports: [CrmLeadFormComponent],
      providers: [
        { provide: CrmLeadService, useValue: api },
        { provide: EmployeeService, useValue: { listPaged: () => of({ items: [] }) } },
        { provide: ToastService, useValue: { show: () => undefined } },
        { provide: PeraModalRef, useValue: { close } },
        { provide: PERA_MODAL_DATA, useValue: { lead } },
      ],
    });
    const c = TestBed.createComponent(CrmLeadFormComponent).componentInstance;
    expect(c.form.getRawValue()).toMatchObject({ firstName: 'Mona', ownerId: 'E1' });

    c.form.patchValue({ lastName: 'Adel Hassan' });
    c.submit();

    expect(api.create).not.toHaveBeenCalled();
    expect(api.update).toHaveBeenCalledWith('L', {
      firstName: 'Mona',
      lastName: 'Adel Hassan',
      source: LeadSource.Referral,
      email: 'mona@example.com',
      phone: null,
      notes: 'call back',
      ownerId: 'E1',
    });
    expect(close).toHaveBeenCalledWith(true);
  });
});
