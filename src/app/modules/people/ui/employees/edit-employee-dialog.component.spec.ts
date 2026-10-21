import { TestBed } from '@angular/core/testing';
import { provideHttpClient } from '@angular/common/http';
import { HttpTestingController, provideHttpClientTesting } from '@angular/common/http/testing';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { PERA_MODAL_DATA, PeraModalRef } from '@ds';
import { environment } from '../../../../../environments/environment';
import { AuthStore } from '@platform/auth/auth.store';
import { EditEmployeeDialogComponent } from './edit-employee-dialog.component';

const PUT = `${environment.apiUrl}/employees/e-1`;

/**
 * 006b-2 #14. `PUT /api/employees/{id}` is a full replacement in backend v3; a cleared field must be
 * `null`, never `""` — `"endDate": ""` cannot bind to `DateOnly?` and answers 400 (006 report V1).
 */
describe('EditEmployeeDialogComponent — full replacement (006b-2 #14)', () => {
  let backend: HttpTestingController;
  const modalRef = { close: vi.fn() };

  function create() {
    TestBed.configureTestingModule({
      imports: [EditEmployeeDialogComponent],
      providers: [
        provideHttpClient(),
        provideHttpClientTesting(),
        {
          provide: PERA_MODAL_DATA,
          useValue: {
            employeeId: 'e-1',
            fullName: 'Mona Adel',
            jobTitle: 'Designer',
            contractType: 'FullTime',
            phoneNumber: '0100',
            emergencyContactPhone: null,
            notes: 'old note',
            endDate: null,
          },
        },
        { provide: PeraModalRef, useValue: modalRef },
        { provide: AuthStore, useValue: { user: () => null, refreshPermissions: vi.fn() } },
      ],
    });
    backend = TestBed.inject(HttpTestingController);
    const fixture = TestBed.createComponent(EditEmployeeDialogComponent);
    fixture.detectChanges();
    return fixture;
  }

  beforeEach(() => modalRef.close.mockClear());
  afterEach(() => backend.verify());

  it('sends all six keys, with every cleared field as null (never "")', () => {
    const c = create().componentInstance;
    c.form.patchValue({ phoneNumber: '   ', notes: '', endDate: '' });
    c.submit();

    const req = backend.expectOne(PUT);
    expect(Object.keys(req.request.body).sort()).toEqual(
      [
        'contractType',
        'emergencyContactPhone',
        'endDate',
        'jobTitle',
        'notes',
        'phoneNumber',
      ].sort(),
    );
    expect(req.request.body).toEqual({
      jobTitle: 'Designer',
      contractType: 'FullTime',
      phoneNumber: null,
      emergencyContactPhone: null,
      endDate: null,
      notes: null,
    });
    // The serialized wire body: a blank end date is `null`, not an empty string.
    expect(JSON.stringify(req.request.body)).toContain('"endDate":null');
    expect(JSON.stringify(req.request.body)).not.toContain('""');
    req.flush(null);
    expect(modalRef.close).toHaveBeenCalledWith(req.request.body);
  });

  it('keeps filled fields as trimmed strings', () => {
    const c = create().componentInstance;
    c.form.patchValue({ phoneNumber: ' 0101 ', endDate: '2027-01-31' });
    c.submit();
    const req = backend.expectOne(PUT);
    expect(req.request.body).toMatchObject({ phoneNumber: '0101', endDate: '2027-01-31' });
    req.flush(null);
  });

  it('EndDateBeforeHireDate lands on the end-date field, not as a banner', () => {
    const fixture = create();
    const c = fixture.componentInstance;
    c.form.patchValue({ endDate: '2001-01-01' });
    c.submit();
    backend.expectOne(PUT).flush(
      {
        title: 'employees.EndDateBeforeHireDate',
        errors: {
          'employees.EndDateBeforeHireDate': ["The end date can't be before the hire date."],
        },
      },
      { status: 400, statusText: 'Bad Request' },
    );
    fixture.detectChanges();
    expect(c.serverError()?.generalMessage).toBe('');
    expect(c.serverError()?.fieldErrors['endDate']?.[0]).toBeTruthy();
    expect(c.form.controls.endDate.errors?.['serverError']).toBeTruthy();
  });

  it('409 employees.Inactive is shown, and the dialog stays open', () => {
    const c = create().componentInstance;
    c.submit();
    backend.expectOne(PUT).flush(
      {
        title: 'employees.Inactive',
        errors: { 'employees.Inactive': ['Employee is inactive.'] },
      },
      { status: 409, statusText: 'Conflict' },
    );
    expect(c.serverError()?.code).toBe('employees.Inactive');
    expect(c.serverError()?.generalMessage).toBeTruthy();
    expect(modalRef.close).not.toHaveBeenCalled();
  });
});
