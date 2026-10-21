import { Route } from '@angular/router';
import { PERM } from '@platform/permissions';
import { NAV_ITEMS, NavItem } from './layouts/app-shell/nav-config';
import { routes } from './app.routes';
import { ForbiddenComponent } from './layouts/errors/forbidden.component';
import { ServerErrorComponent } from './layouts/errors/server-error.component';
import { NotFoundComponent } from './layouts/errors/not-found.component';

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
  // what is wired. Last updated: spec 004. Every spec that un-stubs a route into
  // this array should bump the constant (and rename it to _AT_0XX) alongside its
  // own app.routes.spec.ts additions — see spec 005's recipe step 4.
  const EXPECTED_SHELL_CHILDREN_AT_004 = 4; // '' -> dashboard redirect, 403, 500, **

  it('has exactly the expected number of real (non-stub) shell children', () => {
    expect(shellChildren()).toHaveLength(EXPECTED_SHELL_CHILDREN_AT_004);
  });
});
