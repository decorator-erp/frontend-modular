import { TestBed } from '@angular/core/testing';
import { provideHttpClient, withInterceptors } from '@angular/common/http';
import { HttpTestingController, provideHttpClientTesting } from '@angular/common/http/testing';
import { provideRouter } from '@angular/router';
import { of } from 'rxjs';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { ConfirmService, ModalService, PERA_MODAL_DATA, PeraModalRef } from '@ds';
import { environment } from '../../../environments/environment';
import { authInterceptor } from '@platform/auth/auth.interceptor';
import { AuthStore } from '@platform/auth/auth.store';
import { TokenService } from '@platform/auth/token.service';
import { TokenRefreshService } from '@platform/auth/token-refresh.service';
import { ToastService } from '@platform/feedback/toast.service';
import { errorInterceptor } from '@platform/http/error.interceptor';
import { PermissionsService } from '@platform/permissions';
import { LookupCache } from './data/lookup.cache';
import { PermissionsComponent } from './ui/permissions/permissions.component';
import { NewOverrideDialogComponent } from './ui/permissions/new-override-dialog.component';
import { AssignRoleDialogComponent } from './ui/roles/assign-role-dialog.component';
import { RolesComponent } from './ui/roles/roles.component';
import { ProfileComponent } from './ui/profile/profile.component';

const API = environment.apiUrl;

/** A backend v3 ProblemDetails 403 carrying `code` (the parser reads the `errors` key). */
function forbidden(code: string, detail: string) {
  return {
    body: { title: code, status: 403, detail, errors: { [code]: [detail] } },
    opts: { status: 403, statusText: 'Forbidden' },
  };
}
const NO_PERMISSION = forbidden('Forbidden', 'Forbidden');
const CANNOT_DELEGATE = forbidden('permissions.CannotDelegate', 'You lack: projects.read');

/**
 * Spec 002c R2. Each people call site that explains a 403 itself marks it `handled(403)`, so the
 * user sees exactly ONE message: the page's own, or none for a silent fallback. Runs the real data
 * services through the real interceptor chain of `app.config.ts` (`authInterceptor`, then
 * `errorInterceptor`); `toast.show` counts every toast, global and page alike.
 */
describe('people — a handled 403 shows exactly one message (spec 002c)', () => {
  let backend: HttpTestingController;
  const toast = { show: vi.fn() };
  const confirm = { open: vi.fn() };
  /** Read by the PERA_MODAL_DATA factory at inject time, so each dialog test sets its own. */
  let modalData: unknown = null;

  beforeEach(() => {
    vi.clearAllMocks();
    // jsdom has no matchMedia; ThemeService (profile) reads it for the system colour scheme.
    vi.stubGlobal(
      'matchMedia',
      vi.fn(() => ({
        matches: false,
        addEventListener: vi.fn(),
        removeEventListener: vi.fn(),
        addListener: vi.fn(),
        removeListener: vi.fn(),
      })),
    );
    TestBed.configureTestingModule({
      providers: [
        provideRouter([]),
        provideHttpClient(withInterceptors([authInterceptor, errorInterceptor])),
        provideHttpClientTesting(),
        { provide: ToastService, useValue: toast },
        { provide: TokenService, useValue: { getToken: () => 'token' } },
        { provide: TokenRefreshService, useValue: {} },
        {
          provide: AuthStore,
          useValue: {
            user: () => ({ userId: 'me-1' }),
            can: () => true,
            refreshPermissions: vi.fn(),
            logout: vi.fn(),
          },
        },
        { provide: PermissionsService, useValue: { can: () => true } },
        { provide: ModalService, useValue: { open: vi.fn() } },
        { provide: ConfirmService, useValue: confirm },
        {
          provide: LookupCache,
          useValue: { departments: () => of([]), roles: () => of([]) },
        },
        { provide: PeraModalRef, useValue: { close: vi.fn() } },
        { provide: PERA_MODAL_DATA, useFactory: () => modalData },
      ],
    });
    backend = TestBed.inject(HttpTestingController);
  });

  afterEach(() => vi.unstubAllGlobals());

  /** Flush the permissions page's three boot reads; `overrides` replaces any of them. */
  function bootPermissions(overrides: { catalog?: boolean; roles?: boolean; users?: boolean }) {
    const fixture = TestBed.createComponent(PermissionsComponent);
    fixture.detectChanges();
    const catalog = backend.expectOne(`${API}/permissions`);
    if (overrides.catalog === false) catalog.flush(NO_PERMISSION.body, NO_PERMISSION.opts);
    else catalog.flush([{ module: 'Projects', permissions: ['projects.read'] }]);
    const roles = backend.expectOne(`${API}/roles`);
    // A failed catalog read errors the forkJoin, which cancels its sibling roles request.
    if (roles.cancelled) {
      // nothing to flush
    } else if (overrides.roles === false) roles.flush(NO_PERMISSION.body, NO_PERMISSION.opts);
    else roles.flush([{ id: 'r-designer', name: 'Designer', description: null, isActive: true }]);
    const users = backend.expectOne((r) => r.url === `${API}/users`);
    if (overrides.users === false) users.flush(NO_PERMISSION.body, NO_PERMISSION.opts);
    else users.flush({ items: [], totalCount: 0, pageNumber: 1, pageSize: 200, totalPages: 1 });
    backend.match(`${API}/permissions/roles/r-designer`).forEach((r) => r.flush([]));
    fixture.detectChanges();
    return fixture;
  }

  it('permissions page: /api/users 403 → the directory fallback, and no toast', () => {
    bootPermissions({ users: false });
    // The fallback request proves the page handled it; the toast count proves it stayed silent.
    const directory = backend.match((r) => r.url === `${API}/employees`);
    expect(directory.length).toBe(1);
    directory[0].flush({ items: [], totalCount: 0, pageNumber: 1, pageSize: 200, totalPages: 1 });
    expect(toast.show).not.toHaveBeenCalled();
  });

  it('permissions page: the catalog 403 → the catalogFailed state, and no toast', () => {
    const fixture = bootPermissions({ catalog: false });
    expect(fixture.componentInstance.catalogFailed()).toBe(true);
    expect(toast.show).not.toHaveBeenCalled();
  });

  it('permissions page: a roles 403 in the catalog forkJoin → catalogFailed, and no toast', () => {
    const fixture = bootPermissions({ roles: false });
    expect(fixture.componentInstance.catalogFailed()).toBe(true);
    expect(toast.show).not.toHaveBeenCalled();
  });

  it('roles screen: the same /api/roles 403, unmarked there, still shows the global toast', () => {
    const fixture = TestBed.createComponent(RolesComponent);
    fixture.detectChanges();
    backend.expectOne(`${API}/roles`).flush(NO_PERMISSION.body, NO_PERMISSION.opts);
    expect(toast.show).toHaveBeenCalledTimes(1);
    expect(toast.show.mock.calls[0][0]).toMatchObject({ tone: 'warning' });
  });

  it('permissions matrix: a claim write 403 CannotDelegate → matrixError inline, and no toast', () => {
    const fixture = bootPermissions({});
    const c = fixture.componentInstance;
    const role = c.roles()[0];
    const row = c.groups()[0].permissions[0];
    c.toggle(role, row);
    backend
      .expectOne(`${API}/permissions/roles/r-designer/projects.read`)
      .flush(CANNOT_DELEGATE.body, CANNOT_DELEGATE.opts);
    expect(c.matrixError()).toBe('You lack: projects.read');
    expect(toast.show).not.toHaveBeenCalled();
  });

  it("permissions page: an override revoke 403 → exactly one toast, the page's own", async () => {
    const fixture = bootPermissions({});
    const c = fixture.componentInstance;
    c.selectedUser.set({ userId: 'u-7', fullName: 'Mona', email: 'mona@x.io' } as never);
    confirm.open.mockResolvedValue(true);
    await c.revokeOverride('projects.read');
    backend
      .expectOne(`${API}/permissions/users/u-7/overrides/projects.read`)
      .flush(CANNOT_DELEGATE.body, CANNOT_DELEGATE.opts);
    expect(toast.show).toHaveBeenCalledTimes(1);
    expect(toast.show.mock.calls[0][0]).toMatchObject({ tone: 'danger' });
  });

  it('override dialog: a grant 403 → the form banner, and no toast', () => {
    modalData = {
      targetUserId: 'u-7',
      targetName: 'Mona',
      permissions: [{ value: 'projects.read', group: 'Projects', displayName: 'Projects read' }],
      existing: [],
    };
    const fixture = TestBed.createComponent(NewOverrideDialogComponent);
    fixture.detectChanges();
    const c = fixture.componentInstance;
    c.form.patchValue({ permission: 'projects.read', type: 'grant' });
    c.submit();
    backend
      .expectOne(`${API}/permissions/users/u-7/overrides/grant`)
      .flush(CANNOT_DELEGATE.body, CANNOT_DELEGATE.opts);
    expect(c.serverError()?.generalMessage).toBeTruthy();
    expect(toast.show).not.toHaveBeenCalled();
  });

  it('assign-role dialog: 403 CannotDelegate → the inline alert, and no toast', () => {
    modalData = { roleId: 'r-mgr', roleName: 'manager' };
    const fixture = TestBed.createComponent(AssignRoleDialogComponent);
    fixture.detectChanges();
    backend
      .match((r) => r.url === `${API}/employees`)
      .forEach((r) =>
        r.flush({ items: [], totalCount: 0, pageNumber: 1, pageSize: 200, totalPages: 1 }),
      );
    const c = fixture.componentInstance;
    c.assign({ userId: 'u-7', fullName: 'Mona' } as never);
    backend
      .expectOne(`${API}/roles/r-mgr/users/u-7`)
      .flush(CANNOT_DELEGATE.body, CANNOT_DELEGATE.opts);
    fixture.detectChanges();
    expect(c.inlineError()).toBe('You lack: projects.read');
    const alert = (fixture.nativeElement as HTMLElement).querySelector('[role="alert"]');
    expect(alert?.textContent).toContain('You lack: projects.read');
    expect(toast.show).not.toHaveBeenCalled();
  });

  it('profile: /api/employees/me 403 → the unavailable state, and no toast', () => {
    const fixture = TestBed.createComponent(ProfileComponent);
    fixture.detectChanges();
    backend.expectOne(`${API}/employees/me`).flush(NO_PERMISSION.body, NO_PERMISSION.opts);
    expect(fixture.componentInstance.profileUnavailable()).toBe(true);
    expect(toast.show).not.toHaveBeenCalled();
  });
});
