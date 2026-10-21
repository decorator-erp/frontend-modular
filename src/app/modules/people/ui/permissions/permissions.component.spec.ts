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
import { AuthStore } from '@platform/auth/auth.store';
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
    getUserEffective: vi.fn((userId: string) =>
      of({
        userId,
        permissions: [],
        overrides: [
          {
            id: 'o-1',
            permission: 'projects.read',
            isGranted: true,
            grantedById: 'x',
            reason: null,
            expiresAt: null,
          },
        ],
      }),
    ),
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
        { provide: AuthStore, useValue: { user: () => ({ userId: 'me-1' }), can: () => true } },
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

/** 006b-1 #7: grant, deny and revoke are SelfModification on your own account. */
describe('PermissionsComponent — overrides on your own account (006b-1 #7)', () => {
  const modal = { open: vi.fn(() => ({ afterClosed: () => Promise.resolve(false) })) };
  const confirm = { open: vi.fn(() => Promise.resolve(true)) };
  const permissionsApi = {
    getAll: () => of([{ module: 'Projects', permissions: ['projects.read'] }]),
    getRolePermissions: () => of([]),
    getUserEffective: (userId: string) =>
      of({
        userId,
        permissions: ['projects.read'],
        overrides: [
          {
            id: 'o-1',
            permission: 'projects.read',
            isGranted: true,
            grantedById: 'x',
            reason: null,
            expiresAt: null,
          },
        ],
      }),
    revoke: vi.fn(() => of(undefined)),
  };
  const employee = (userId: string, fullName: string) =>
    ({ id: `e-${userId}`, userId, fullName, email: `${userId}@pera.test` }) as never;

  beforeEach(() => {
    vi.clearAllMocks();
    TestBed.configureTestingModule({
      providers: [
        provideRouter([]),
        { provide: PermissionService, useValue: permissionsApi },
        { provide: RoleService, useValue: { getAll: () => of([]) } },
        {
          provide: EmployeeService,
          useValue: { listPaged: () => of({ items: [], totalCount: 0, page: 1, pageSize: 500 }) },
        },
        { provide: PermissionsService, useValue: { can: () => true } },
        { provide: ModalService, useValue: modal },
        { provide: ConfirmService, useValue: confirm },
        { provide: ToastService, useValue: { show: vi.fn() } },
        { provide: AuthStore, useValue: { user: () => ({ userId: 'me-1' }), can: () => true } },
      ],
    });
  });

  function renderWith(user: never) {
    const fixture = TestBed.createComponent(PermissionsComponent);
    fixture.detectChanges();
    fixture.componentInstance.pickUser(user);
    fixture.detectChanges();
    return fixture;
  }

  const button = (el: HTMLElement, text: string) =>
    [...el.querySelectorAll('button')].find((b) => b.textContent?.includes(text))!;

  it('self: New override and Revoke are disabled, with the reason; nothing is sent', async () => {
    const fixture = renderWith(employee('me-1', 'Me Myself'));
    const el = fixture.nativeElement as HTMLElement;

    expect(button(el, 'New override').disabled).toBe(true);
    expect(button(el, 'Revoke').disabled).toBe(true);
    expect(el.textContent).toContain('This is your own account. Ask another administrator.');

    await fixture.componentInstance.openNewOverride();
    await fixture.componentInstance.revokeOverride('projects.read');
    expect(modal.open).not.toHaveBeenCalled();
    expect(confirm.open).not.toHaveBeenCalled();
    expect(permissionsApi.revoke).not.toHaveBeenCalled();
  });

  it('someone else: both stay enabled, and the dialog receives the live overrides', async () => {
    const fixture = renderWith(employee('u-7', 'Mona'));
    const el = fixture.nativeElement as HTMLElement;
    expect(button(el, 'New override').disabled).toBe(false);
    expect(button(el, 'Revoke').disabled).toBe(false);

    await fixture.componentInstance.openNewOverride();
    const data = (modal.open.mock.calls[0] as unknown[])[1] as { data: { existing: unknown[] } };
    expect(data.data.existing).toHaveLength(1);
  });
});
