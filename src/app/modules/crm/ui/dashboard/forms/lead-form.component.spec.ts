import { TestBed } from '@angular/core/testing';
import { HttpErrorResponse } from '@angular/common/http';
import { of, throwError } from 'rxjs';
import { describe, expect, it } from 'vitest';
import { EmployeeService } from '@modules/people';
import { ToastService } from '@platform/feedback/toast.service';
import { PeraModalRef } from '@ds';
import { CrmLeadService } from '../../../data/crm-lead.service';
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
