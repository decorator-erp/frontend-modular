import { TestBed } from '@angular/core/testing';
import { HttpErrorResponse } from '@angular/common/http';
import { provideRouter } from '@angular/router';
import { of, throwError } from 'rxjs';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { ConfirmService, ModalService } from '@ds';
import { ToastService } from '@platform/feedback/toast.service';
import { PermissionsService } from '@platform/permissions';
import { PermissionService } from '../../data/permission.service';
import { RoleService } from '../../data/role.service';
import { EmployeeService } from '../../data/employee.service';
import { PermissionsComponent } from './permissions.component';

const ADMIN = { id: 'r-admin', name: 'admin', description: null, isActive: true };
const DESIGNER = { id: 'r-designer', name: 'Designer', description: null, isActive: true };
const PERM_ROW = { value: 'projects.read', displayName: 'Projects read', group: 'Projects' };

/** 006b-1 #6: full-access roles are read-only; CannotDelegate on a claim write shows inline. */
describe('PermissionsComponent — the role matrix (006b-1 #6)', () => {
  const toast = { show: vi.fn() };
  const permissionsApi = {
    getAll: vi.fn(() => of([{ module: 'Projects', permissions: ['projects.read'] }])),
    getRolePermissions: vi.fn(() => of([])),
    assignToRole: vi.fn(),
    removeFromRole: vi.fn(),
  };

  beforeEach(() => {
    vi.clearAllMocks();
    TestBed.configureTestingModule({
      providers: [
        provideRouter([]),
        { provide: PermissionService, useValue: permissionsApi },
        { provide: RoleService, useValue: { getAll: () => of([ADMIN, DESIGNER]) } },
        {
          provide: EmployeeService,
          useValue: { listPaged: () => of({ items: [], totalCount: 0, page: 1, pageSize: 500 }) },
        },
        { provide: PermissionsService, useValue: { can: () => true } },
        { provide: ModalService, useValue: { open: vi.fn() } },
        { provide: ConfirmService, useValue: { open: vi.fn() } },
        { provide: ToastService, useValue: toast },
      ],
    });
  });

  function render() {
    const fixture = TestBed.createComponent(PermissionsComponent);
    fixture.detectChanges();
    return fixture;
  }

  it('renders the admin column read-only with its reason, and never writes a full-access claim', () => {
    const fixture = render();
    const el = fixture.nativeElement as HTMLElement;
    const cell = (roleName: string) =>
      el.querySelector<HTMLButtonElement>(`button[aria-label="Projects read for ${roleName}"]`)!;

    expect(cell('admin').disabled).toBe(true);
    expect(cell('Designer').disabled).toBe(false);
    expect(el.textContent).toContain('Always holds every permission — read-only');

    fixture.componentInstance.toggle(ADMIN, PERM_ROW as never);
    expect(permissionsApi.assignToRole).not.toHaveBeenCalled();
    expect(permissionsApi.removeFromRole).not.toHaveBeenCalled();
  });

  it('CannotDelegate on assign → the server description inline, the cell rolled back, no toast', () => {
    permissionsApi.assignToRole.mockReturnValue(
      throwError(
        () =>
          new HttpErrorResponse({
            status: 403,
            error: {
              title: 'permissions.CannotDelegate',
              errors: {
                'permissions.CannotDelegate': [
                  'You cannot confer permissions you do not hold: projects.read.',
                ],
              },
            },
          }),
      ),
    );
    const fixture = render();
    const c = fixture.componentInstance;
    c.toggle(DESIGNER, PERM_ROW as never);
    fixture.detectChanges();

    const alert = (fixture.nativeElement as HTMLElement).querySelector('[role="alert"]');
    expect(alert?.textContent?.trim()).toBe(
      'You cannot confer permissions you do not hold: projects.read.',
    );
    expect(c.has(DESIGNER.id, 'projects.read')).toBe(false);
    expect(toast.show).not.toHaveBeenCalled();
  });

  it('any other failure keeps the ported toast and rollback', () => {
    permissionsApi.assignToRole.mockReturnValue(
      throwError(() => new HttpErrorResponse({ status: 500 })),
    );
    const c = render().componentInstance;
    c.toggle(DESIGNER, PERM_ROW as never);
    expect(c.has(DESIGNER.id, 'projects.read')).toBe(false);
    expect(toast.show).toHaveBeenCalledWith({
      tone: 'danger',
      message: "Couldn't grant Projects read for Designer",
    });
  });
});
