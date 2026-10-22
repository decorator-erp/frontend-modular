import { Route } from '@angular/router';
import { PERM } from '@platform/permissions';
import { NAV_ITEMS, NavItem } from './layouts/app-shell/nav-config';
import { routes } from './app.routes';
import { ForbiddenComponent } from './layouts/errors/forbidden.component';
import { ServerErrorComponent } from './layouts/errors/server-error.component';
import { NotFoundComponent } from './layouts/errors/not-found.component';
import { PermissionGuard } from '@platform/auth/permission.guard';
import { ClientsListComponent } from '@modules/clients';
import { AuditLogComponent } from '@modules/audit';
import { libraryRoutes } from '@modules/library';
import { NotificationsPageComponent } from '@modules/notifications';

/** Flatten the shell's children — the stub routes live under the app-shell route. */
function shellChildren(): Route[] {
  const shell = routes.find((r) => r.path === '' && r.children);
  return shell?.children ?? [];
}

// TODO(008): restore the DMS Stage Detail GA-cutover describe block from the old
// app.routes.spec.ts (canonical stage path + old /dms redirect) once
// DmsStageDetailComponent lands with modules/projects.

/**
 * Regression coverage for the catalog admin gate, carried forward from the old
 * app.routes.spec.ts. The route half is a TODO(009) stub at 004 (admin/catalog has
 * no route object yet, only a comment), so only the nav-config half runs here; 009
 * restores the route assertion when it un-stubs `admin/catalog`.
 */
describe('nav-config — the catalog admin gate', () => {
  it('gates the Catalog nav entry on crm.catalog.manage, not .read', () => {
    const item = NAV_ITEMS.find((i: NavItem) => i.route === '/admin/catalog');
    expect(item).toBeTruthy();
    expect(item!.capability).toBe(PERM.crm.catalog.manage);
  });
});

describe('app.routes — the 004 shell skeleton', () => {
  it('declares portal before the office shell, so the shell catch-all never swallows it', () => {
    const portalIndex = routes.findIndex((r) => r.path === 'portal');
    const officeShellIndex = routes.findIndex((r) => r.path === '' && r.children);
    expect(portalIndex).toBeGreaterThanOrEqual(0);
    expect(officeShellIndex).toBeGreaterThanOrEqual(0);
    expect(portalIndex).toBeLessThan(officeShellIndex);
  });

  it('keeps intake and intake/:lang top-level and guardless (anonymous lead intake)', () => {
    const intake = routes.find((r) => r.path === 'intake');
    const intakeLang = routes.find((r) => r.path === 'intake/:lang');
    expect(intake).toBeTruthy();
    expect(intakeLang).toBeTruthy();
    expect(intake!.canActivate).toBeUndefined();
    expect(intakeLang!.canActivate).toBeUndefined();
  });

  it('gates the office shell on AuthGuard + NotClientGuard', () => {
    const officeShell = routes.find((r) => r.path === '' && r.children);
    expect(officeShell).toBeTruthy();
    expect(officeShell!.canActivate).toHaveLength(2);
  });

  it('gates the portal shell on AuthGuard + ClientOnlyGuard', () => {
    const portal = routes.find((r) => r.path === 'portal');
    expect(portal).toBeTruthy();
    expect(portal!.canActivate).toHaveLength(2);
  });

  it('resolves 403, 500 and ** to their layouts/errors components', async () => {
    const children = shellChildren();
    const forbidden = children.find((r) => r.path === '403');
    const serverError = children.find((r) => r.path === '500');
    const notFound = children.find((r) => r.path === '**');
    expect(forbidden).toBeTruthy();
    expect(serverError).toBeTruthy();
    expect(notFound).toBeTruthy();

    const forbiddenCmp = await (forbidden!.loadComponent as () => Promise<unknown>)();
    const serverErrorCmp = await (serverError!.loadComponent as () => Promise<unknown>)();
    const notFoundCmp = await (notFound!.loadComponent as () => Promise<unknown>)();
    expect(forbiddenCmp).toBe(ForbiddenComponent);
    expect(serverErrorCmp).toBe(ServerErrorComponent);
    expect(notFoundCmp).toBe(NotFoundComponent);
  });

  it('redirects the office shell index to dashboard', () => {
    const children = shellChildren();
    const index = children.find((r) => r.path === '');
    expect(index).toBeTruthy();
    expect(index!.redirectTo).toBe('dashboard');
    expect(index!.pathMatch).toBe('full');
  });

  // Real (non-stub) office-shell children. Stubs are comments, so this counts only
  // what is wired. Last updated: spec 005, which ran AFTER 006 (charter ORDER-EXCEPTION-1):
  // 006 set _AT_006 = 10 first, and 005 renamed it and added its own routes on top. Every spec
  // that un-stubs a route into this array should bump the constant (and rename it to _AT_0XX)
  // alongside its own app.routes.spec.ts additions — see spec 005's recipe step 4.
  // 004: '' -> dashboard redirect, 403, 500, ** (4). 006: +6 people routes. 005: +1 clients,
  // +1 audit, +4 library, +1 notifications.
  const EXPECTED_SHELL_CHILDREN_AT_005 = 17;

  it('has exactly the expected number of real (non-stub) shell children', () => {
    expect(shellChildren()).toHaveLength(EXPECTED_SHELL_CHILDREN_AT_005);
  });

  it("keeps '**' as the shell's last child", () => {
    const children = shellChildren();
    expect(children[children.length - 1].path).toBe('**');
  });
});

describe('app.routes — the 006 people routes', () => {
  const route = (path: string) => shellChildren().find((r) => r.path === path);

  it.each([
    ['employees', 'employees.read', 'Employees', 'EmployeesListComponent'],
    ['employees/:id', 'employees.read', 'Employee', 'EmployeeDetailComponent'],
    ['roles', 'roles.read', 'Roles', 'RolesComponent'],
    ['permissions', 'permissions.manage', 'Permissions', 'PermissionsComponent'],
    ['departments', 'departments.read', 'Departments', 'DepartmentsListComponent'],
  ])('%s: PermissionGuard, %s, breadcrumb %s', async (path, permission, breadcrumb, cmpName) => {
    const r = route(path);
    expect(r).toBeTruthy();
    expect(r!.canActivate).toEqual([PermissionGuard]);
    expect(r!.data).toEqual({ permission, breadcrumb });
    const cmp = (await r!.loadComponent!()) as { name: string };
    expect(cmp.name).toContain(cmpName);
  });

  it('profile: no guard, breadcrumb Profile', async () => {
    const r = route('profile');
    expect(r).toBeTruthy();
    expect(r!.canActivate).toBeUndefined();
    expect(r!.data).toEqual({ breadcrumb: 'Profile' });
    const cmp = (await r!.loadComponent!()) as { name: string };
    expect(cmp.name).toContain('ProfileComponent');
  });
});

describe('app.routes — the 005 leaf-module routes', () => {
  const route = (path: string) => shellChildren().find((r) => r.path === path);

  it('clients: PermissionGuard, clients.read, breadcrumb Clients → ClientsListComponent', async () => {
    const r = route('clients');
    expect(r).toBeTruthy();
    expect(r!.canActivate).toEqual([PermissionGuard]);
    expect(r!.data).toEqual({ permission: 'clients.read', breadcrumb: 'Clients' });
    expect(await r!.loadComponent!()).toBe(ClientsListComponent);
  });

  it('audit: PermissionGuard, audit.read, breadcrumb Audit log → AuditLogComponent', async () => {
    const r = route('audit');
    expect(r).toBeTruthy();
    expect(r!.canActivate).toEqual([PermissionGuard]);
    expect(r!.data).toEqual({ permission: 'audit.read', breadcrumb: 'Audit log' });
    expect(await r!.loadComponent!()).toBe(AuditLogComponent);
  });

  it('notifications: no guard, breadcrumb Notifications → NotificationsPageComponent', async () => {
    const r = route('notifications');
    expect(r).toBeTruthy();
    expect(r!.canActivate).toBeUndefined();
    expect(r!.data).toEqual({ breadcrumb: 'Notifications' });
    expect(await r!.loadComponent!()).toBe(NotificationsPageComponent);
  });

  it('spreads all four libraryRoutes into the shell, by identity (module spec covers metadata)', () => {
    const children = shellChildren();
    for (const r of libraryRoutes) {
      expect(children).toContain(r);
    }
  });
});
