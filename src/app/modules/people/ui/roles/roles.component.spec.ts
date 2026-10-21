import { TestBed } from '@angular/core/testing';
import { HttpErrorResponse } from '@angular/common/http';
import { provideRouter } from '@angular/router';
import { of, throwError } from 'rxjs';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { ConfirmService, ModalService } from '@ds';
import { ToastService } from '@platform/feedback/toast.service';
import { PermissionsService } from '@platform/permissions';
import { RoleResponse } from '../../model/people.model';
import { RoleService } from '../../data/role.service';
import { PermissionService } from '../../data/permission.service';
import { EmployeeService } from '../../data/employee.service';
import { RolesComponent } from './roles.component';

const role = (name: string): RoleResponse => ({
  id: `r-${name}`,
  name,
  description: null,
  isActive: true,
});

/** 006b-1 #6: the roles screen against backend v3 (seeded roles, RoleInUse). */
describe('RolesComponent — seeded roles (006b-1 #6)', () => {
  const toast = { show: vi.fn() };
  const modal = { open: vi.fn(() => ({ afterClosed: () => Promise.resolve(false) })) };
  const confirm = { open: vi.fn(() => Promise.resolve(true)) };
  const rolesApi = {
    getAll: vi.fn(() => of([] as RoleResponse[])),
    deleteRole: vi.fn(),
  };

  beforeEach(() => {
    vi.clearAllMocks();
    TestBed.configureTestingModule({
      providers: [
        provideRouter([]),
        { provide: RoleService, useValue: rolesApi },
        { provide: PermissionService, useValue: { getRolePermissions: () => of([]) } },
        { provide: EmployeeService, useValue: { byRole: () => of({ items: [], totalCount: 0 }) } },
        { provide: ModalService, useValue: modal },
        { provide: ConfirmService, useValue: confirm },
        { provide: ToastService, useValue: toast },
        { provide: PermissionsService, useValue: { can: () => true } },
      ],
    });
  });

  const component = () => TestBed.createComponent(RolesComponent).componentInstance;

  it('never offers Delete for a seeded role, and keeps it for a custom one', () => {
    const del = component().rowActions.find((a) => a.label === 'Delete')!;
    for (const name of ['admin', 'Manager', 'employee', 'Client']) {
      expect(del.visible?.(role(name))).toBe(false);
    }
    expect(del.visible?.(role('Project lead'))).toBe(true);
  });

  it('keeps Edit role for seeded roles, and opens the dialog with the name locked', async () => {
    const c = component();
    const edit = c.rowActions.find((a) => a.label === 'Edit role')!;
    expect(edit.visible).toBeUndefined();

    await c.openRename(role('admin'));
    const data = (modal.open.mock.calls[0] as unknown[])[1] as { data: Record<string, unknown> };
    expect(data.data).toMatchObject({ currentName: 'admin', systemRole: true });

    await c.openRename(role('Project lead'));
    const data2 = (modal.open.mock.calls[1] as unknown[])[1] as { data: Record<string, unknown> };
    expect(data2.data).toMatchObject({ systemRole: false });
  });

  it('a delete refused with RoleInUse says to remove its members first', async () => {
    rolesApi.deleteRole.mockReturnValue(
      throwError(
        () =>
          new HttpErrorResponse({
            status: 409,
            error: {
              title: 'roles.RoleInUse',
              errors: { 'roles.RoleInUse': ["Role 'x' is still assigned to 3 user(s)."] },
            },
          }),
      ),
    );
    await component().remove(role('Project lead'));
    expect(toast.show).toHaveBeenCalledWith({
      tone: 'danger',
      message: 'This role is still assigned. Remove its members first.',
    });
  });
});
