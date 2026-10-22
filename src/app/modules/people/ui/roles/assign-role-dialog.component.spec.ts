import { TestBed } from '@angular/core/testing';
import { HttpErrorResponse } from '@angular/common/http';
import { of, throwError } from 'rxjs';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { PERA_MODAL_DATA, PeraModalRef } from '@ds';
import { ToastService } from '@platform/feedback/toast.service';
import { RoleService } from '../../data/role.service';
import { EmployeeService } from '../../data/employee.service';
import { AssignRoleDialogComponent } from './assign-role-dialog.component';

const MONA = {
  id: 'e-1',
  userId: 'u-1',
  fullName: 'Mona Adel',
  email: 'mona@pera.test',
  trackKey: 'e-1',
  isActive: true,
} as never;

/** 006b-1 #8: assigning a role can answer 403 `permissions.CannotDelegate`. */
describe('AssignRoleDialogComponent — delegation (006b-1 #8)', () => {
  const toast = { show: vi.fn() };
  const roles = { assignToUser: vi.fn() };
  const directory = {
    listPaged: vi.fn(() => of({ items: [MONA], totalCount: 1, page: 1, pageSize: 500 })),
  };

  beforeEach(() => {
    vi.clearAllMocks();
    TestBed.configureTestingModule({
      imports: [AssignRoleDialogComponent],
      providers: [
        { provide: PERA_MODAL_DATA, useValue: { roleId: 'r-mgr', roleName: 'manager' } },
        { provide: PeraModalRef, useValue: { close: vi.fn() } },
        { provide: RoleService, useValue: roles },
        { provide: EmployeeService, useValue: directory },
        { provide: ToastService, useValue: toast },
      ],
    });
  });

  it('CannotDelegate → the server reason inline in the dialog, no toast', () => {
    roles.assignToUser.mockReturnValue(
      throwError(
        () =>
          new HttpErrorResponse({
            status: 403,
            error: {
              title: 'permissions.CannotDelegate',
              errors: {
                'permissions.CannotDelegate': [
                  "Only a member of a full-access role can assign, remove or edit the 'manager' role.",
                ],
              },
            },
          }),
      ),
    );
    const fixture = TestBed.createComponent(AssignRoleDialogComponent);
    fixture.detectChanges();
    fixture.componentInstance.assign(MONA);
    fixture.detectChanges();

    const alert = (fixture.nativeElement as HTMLElement).querySelector('[role="alert"]');
    expect(alert?.textContent?.trim()).toBe(
      "Only a member of a full-access role can assign, remove or edit the 'manager' role.",
    );
    expect(toast.show).not.toHaveBeenCalled();
  });

  it('roles are not pre-filtered: every directory row is offered', () => {
    const fixture = TestBed.createComponent(AssignRoleDialogComponent);
    fixture.detectChanges();
    expect(fixture.componentInstance.filtered()).toHaveLength(1);
  });

  it('any other failure keeps the ported toast', () => {
    roles.assignToUser.mockReturnValue(
      throwError(() => new HttpErrorResponse({ status: 500, error: { title: 'boom' } })),
    );
    const fixture = TestBed.createComponent(AssignRoleDialogComponent);
    fixture.detectChanges();
    fixture.componentInstance.assign(MONA);
    expect(toast.show).toHaveBeenCalledTimes(1);
    expect(fixture.componentInstance.inlineError()).toBeNull();
  });
});
