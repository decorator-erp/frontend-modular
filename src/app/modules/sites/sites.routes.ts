import { Routes } from '@angular/router';
import { PermissionGuard } from '@platform/auth/permission.guard';
import { SITE_PERM } from './model/site-permissions';

/**
 * sites (NEW-FEATURE-1): the office-shell routes, each behind `PermissionGuard` (spec §6). Spread into
 * the shell through `{ path: '', loadChildren }` in app.routes.ts; every page is a lazy
 * `loadComponent`, so none reaches the initial bundle. The two `admin/site-definitions` routes land
 * with their pages at S-10.
 */
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
    data: { permission: SITE_PERM.read, breadcrumb: 'sv.survey' },
    loadComponent: () =>
      import('./ui/pages/site-detail.component').then((m) => m.SiteDetailComponent),
  },
];
