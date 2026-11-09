import { TestBed } from '@angular/core/testing';
import { HttpErrorResponse } from '@angular/common/http';
import { of, throwError } from 'rxjs';
import { describe, expect, it, vi } from 'vitest';
import { EmployeeService } from '@modules/people';
import { ToastService } from '@platform/feedback/toast.service';
import { PERA_MODAL_DATA, PeraModalRef } from '@ds';
import { CrmLeadService, type CrmLead } from '../../../data/crm-lead.service';
import { LeadSource, LeadStatus } from '../../../model/crm-enums';
import { EN } from '@platform/i18n/catalog/en';
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

describe('CrmLeadFormComponent — unassigned leads (LI-1)', () => {
  function makeWith(api: Record<string, unknown>, data?: unknown) {
    TestBed.configureTestingModule({
      imports: [CrmLeadFormComponent],
      providers: [
        { provide: CrmLeadService, useValue: api },
        {
          provide: EmployeeService,
          useValue: { listPaged: () => of({ items: [{ id: 'E1', fullName: 'Sara Nabil' }] }) },
        },
        { provide: ToastService, useValue: { show: () => undefined } },
        { provide: PeraModalRef, useValue: { close: () => undefined } },
        ...(data ? [{ provide: PERA_MODAL_DATA, useValue: data }] : []),
      ],
    });
    return TestBed.createComponent(CrmLeadFormComponent).componentInstance;
  }

  it('creates a lead with no owner as ownerId null', () => {
    const api = { create: vi.fn().mockReturnValue(of('L')) };
    const c = makeWith(api);
    c.form.patchValue({ firstName: 'Mona', lastName: 'Adel' });
    c.submit();

    expect(api.create).toHaveBeenCalledWith(expect.objectContaining({ ownerId: null }));
  });

  it('offers Unassigned first among the owners', () => {
    const c = makeWith({});
    const options = (
      c as unknown as { ownerOptions(): { value: unknown; label: string }[] }
    ).ownerOptions();

    expect(options[0]).toEqual({ value: null, label: EN['leads.unassigned'] });
    expect(options[1]).toEqual({ value: 'E1', label: 'Sara Nabil' });
  });

  it('edits an unassigned website lead and assigns it', () => {
    const api = { update: vi.fn().mockReturnValue(of(undefined)) };
    const c = makeWith(api, {
      lead: {
        id: 'L',
        firstName: 'Mona',
        lastName: 'Adel',
        email: null,
        phone: null,
        source: LeadSource.Website,
        status: LeadStatus.New,
        ownerId: null,
        notes: null,
        convertedClientId: null,
        convertedAtUtc: null,
      },
    });
    expect(c.form.controls.ownerId.value).toBeNull();
    expect(c.form.valid).toBe(true);

    c.form.patchValue({ ownerId: 'E1' });
    c.submit();

    expect(api.update).toHaveBeenCalledWith('L', expect.objectContaining({ ownerId: 'E1' }));
  });
});
