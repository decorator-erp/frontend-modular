import { TestBed } from '@angular/core/testing';
import { HttpErrorResponse } from '@angular/common/http';
import { of, throwError } from 'rxjs';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { PeraModalRef } from '@ds';
import { ToastService } from '@platform/feedback/toast.service';
import { EmployeeService } from '../../data/employee.service';
import { LookupCache } from '../../data/lookup.cache';
import { CreateEmployeeRequest } from '../../model/people.model';
import { AddEmployeeDialogComponent } from './add-employee-dialog.component';
import { meetsPasswordPolicy } from './password-policy';

/** 006b-2 #23: creating an employee against backend v3's password policy and duplicate email. */
describe('AddEmployeeDialogComponent — create (006b-2 #23)', () => {
  const employees = { create: vi.fn() };

  beforeEach(() => {
    vi.clearAllMocks();
    TestBed.configureTestingModule({
      imports: [AddEmployeeDialogComponent],
      providers: [
        { provide: EmployeeService, useValue: employees },
        {
          provide: LookupCache,
          useValue: { departments: () => of([{ id: 'd-1', name: 'Design' }]) },
        },
        { provide: ToastService, useValue: { show: vi.fn() } },
        { provide: PeraModalRef, useValue: { close: vi.fn() } },
      ],
    });
  });

  function fillAndSubmit() {
    const fixture = TestBed.createComponent(AddEmployeeDialogComponent);
    fixture.detectChanges();
    const c = fixture.componentInstance;
    c.form.patchValue({
      firstName: 'Mona',
      lastName: 'Adel',
      email: 'mona@pera.test',
      jobTitle: 'Designer',
      hireDate: '2026-01-05',
      contractType: 'FullTime',
      departmentId: 'd-1',
    });
    c.submit();
    fixture.detectChanges();
    return { fixture, c };
  }

  it('sends a generated password that meets the server policy, every time', () => {
    employees.create.mockReturnValue(of('e-1'));
    for (let i = 0; i < 50; i++) {
      TestBed.resetTestingModule();
      TestBed.configureTestingModule({
        imports: [AddEmployeeDialogComponent],
        providers: [
          { provide: EmployeeService, useValue: employees },
          { provide: LookupCache, useValue: { departments: () => of([]) } },
          { provide: ToastService, useValue: { show: vi.fn() } },
          { provide: PeraModalRef, useValue: { close: vi.fn() } },
        ],
      });
      fillAndSubmit();
    }
    for (const call of employees.create.mock.calls) {
      const payload = (call as unknown[])[0] as CreateEmployeeRequest;
      expect(meetsPasswordPolicy(payload.password)).toBe(true);
    }
    expect(employees.create).toHaveBeenCalledTimes(50);
  });

  it('users.DuplicatedEmail lands on the email field', () => {
    employees.create.mockReturnValue(
      throwError(
        () =>
          new HttpErrorResponse({
            status: 400,
            error: {
              title: 'users.DuplicatedEmail',
              errors: {
                'users.DuplicatedEmail': ["Email 'mona@pera.test' is already registered."],
              },
            },
          }),
      ),
    );
    const { c } = fillAndSubmit();
    expect(c.serverError()?.generalMessage).toBe('');
    expect(c.serverError()?.fieldErrors['email']?.[0]).toBeTruthy();
    expect(c.form.controls.email.errors?.['serverError']).toBeTruthy();
  });

  it('employees.WeakPassword is shown as the form message', () => {
    employees.create.mockReturnValue(
      throwError(
        () =>
          new HttpErrorResponse({
            status: 400,
            error: {
              title: 'employees.WeakPassword',
              errors: { 'employees.WeakPassword': ['The password does not meet the policy.'] },
            },
          }),
      ),
    );
    const { c } = fillAndSubmit();
    expect(c.serverError()?.code).toBe('employees.WeakPassword');
    expect(c.serverError()?.generalMessage).toBeTruthy();
  });
});
