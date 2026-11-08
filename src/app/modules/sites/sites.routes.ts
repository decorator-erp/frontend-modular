import { CanDeactivateFn, Routes } from '@angular/router';
import { PermissionGuard } from '@platform/auth/permission.guard';
import { SITE_PERM } from './model/site-permissions';

/**
 * sites (NEW-FEATURE-1): the office-shell routes, each behind `PermissionGuard` (spec §6). Spread into
 * the shell through `{ path: '', loadChildren }` in app.routes.ts; every page is a lazy
 * `loadComponent`, so none reaches the initial bundle. The two `admin/site-definitions` routes (S-10)
 * take `sites.definitions.manage`.
 */
/** A3: a page that may hold unsaved edits answers `canLeave()` (the survey page's capture grid). */
const leaveGuard: CanDeactivateFn<{ canLeave?: () => boolean | Promise<boolean> }> = (c) =>
  c.canLeave?.() ?? true;

export const sitesRoutes: Routes = [
  {
    path: 'sites',
    canActivate: [PermissionGuard],
    data: { permission: SITE_PERM.read, breadcrumb: 'sv.navSurveys' },
    loadComponent: () => import('./ui/pages/site-list.component').then((m) => m.SiteListComponent),
  },
  {
    path: 'sites/:siteId',
    canActivate: [PermissionGuard],
    canDeactivate: [leaveGuard],
    // BL-1: tab and module switches (and browser Back/Forward between them) change only the query
    // params; the default 'paramsChange' would skip canDeactivate and drop the grid unasked.
    runGuardsAndResolvers: 'paramsOrQueryParamsChange',
    data: { permission: SITE_PERM.read, breadcrumb: 'sv.survey' },
    loadComponent: () =>
      import('./ui/pages/site-detail.component').then((m) => m.SiteDetailComponent),
  },
  {
    path: 'admin/site-definitions',
    canActivate: [PermissionGuard],
    data: { permission: SITE_PERM.definitionsManage, breadcrumb: 'sv.navDefs' },
    loadComponent: () =>
      import('./ui/pages/site-definitions.component').then((m) => m.SiteDefinitionsComponent),
  },
  {
    path: 'admin/site-definitions/modules/:moduleId',
    canActivate: [PermissionGuard],
    data: { permission: SITE_PERM.definitionsManage, breadcrumb: 'sv.module' },
    loadComponent: () =>
      import('./ui/pages/site-module-detail.component').then((m) => m.SiteModuleDetailComponent),
  },
];
