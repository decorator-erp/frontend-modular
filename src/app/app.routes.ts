import { Routes } from '@angular/router';
import { AuthGuard } from '@platform/auth/auth.guard';
import { ClientOnlyGuard, NotClientGuard } from '@platform/auth/client-shell.guard';
import { peopleRoutes } from '@modules/people';
import { libraryRoutes } from '@modules/library';
import { projectsRoutes } from '@modules/projects';
import { PermissionGuard } from '@platform/auth/permission.guard';
import { PERM } from '@platform/permissions';
import { CatalogAdminStore, crmPages } from '@modules/crm';

export const routes: Routes = [
  {
    path: 'login',
    loadComponent: () => import('@modules/auth').then((m) => m.LoginComponent),
  },
  // TODO(backend-gap): no password-reset route in dms-modular. `/api/auth` maps exactly four
  // routes — login, refresh, revoke, change-password — and change-password requires the CURRENT
  // password, so it cannot serve a forgotten one. A reset flow needs a new endpoint.
  {
    path: 'forgot-password',
    loadComponent: () => import('@modules/auth').then((m) => m.LoginComponent),
  },
  // Anonymous public lead intake (`POST /api/crm/public/leads`) — a top-level sibling
  // OUTSIDE both shells with NO guard, so a logged-out prospect can submit. `:lang`
  // seeds the initial locale. Two routes: Angular has no single-segment optional param.
  {
    path: 'intake',
    loadComponent: crmPages.intake,
  },
  {
    path: 'intake/:lang',
    loadComponent: crmPages.intake,
  },
  // The client shell (FR-038) — a SIBLING top-level route, declared BEFORE the office
  // shell below: the office shell's own children carry a `**` catch-all, and a
  // sibling declared after it would never be reached (T105).
  {
    path: 'portal',
    canActivate: [AuthGuard, ClientOnlyGuard],
    loadComponent: () =>
      import('./layouts/client-shell/client-shell.component').then((m) => m.ClientShellComponent),
    children: [
      {
        path: '',
        canActivate: [PermissionGuard],
        data: { permission: PERM.portal.profileViewOwn },
        loadComponent: crmPages.clientProfile,
      },
      {
        path: 'schedule',
        canActivate: [PermissionGuard],
        data: { permission: PERM.crm.meetings.viewOwn },
        loadComponent: crmPages.clientSchedule,
      },
      {
        path: 'add-requirement',
        canActivate: [PermissionGuard],
        data: { permission: PERM.requirements.submitOwn },
        loadComponent: crmPages.clientAddRequirement,
      },
      {
        path: 'approvals',
        canActivate: [PermissionGuard],
        data: { permission: PERM.crm.approvals.viewOwn },
        loadComponent: crmPages.clientApprovals,
      },
    ],
  },
  {
    path: '',
    canActivate: [AuthGuard, NotClientGuard],
    loadComponent: () =>
      import('./layouts/app-shell/app-shell.component').then((m) => m.AppShellComponent),
    children: [
      { path: '', redirectTo: 'dashboard', pathMatch: 'full' },
      // TODO(010): 'dashboard' -> loadComponent: features/dashboard/dashboard.component
      //   -> DashboardComponent, data.breadcrumb = 'Dashboard'
      //
      // People (spec 006): profile, employees, employees/:id, roles, permissions, departments.
      // Spread here, at the first of the six old positions; every path is a distinct literal, so
      // their order among the shell's children changes no match ('**' stays last).
      ...peopleRoutes,
      //
      {
        path: 'notifications',
        loadComponent: () =>
          import('@modules/notifications').then((m) => m.NotificationsPageComponent),
        data: { breadcrumb: 'Notifications' },
      },
      //
      {
        path: 'clients',
        canActivate: [PermissionGuard],
        data: { permission: 'clients.read', breadcrumb: 'Clients' },
        loadComponent: () => import('@modules/clients').then((m) => m.ClientsListComponent),
      },
      //
      {
        path: 'admin/catalog',
        canActivate: [PermissionGuard],
        // Gated on `manage`, not `read` — this page is a full CRUD editor (create, move,
        // clone, delete categories and items), and `crm.catalog.read` is also granted to
        // the Client role so the portal can render item names on a brief. Gating an editor
        // on the read permission would offer this screen to a role that 403s on every
        // button rather than simply not seeing it.
        data: { permission: PERM.crm.catalog.manage, breadcrumb: 'Catalog' },
        providers: [CatalogAdminStore],
        loadComponent: crmPages.catalogAdmin,
      },
      //
      // Library (spec 005): stage-templates, boq-catalog, materials, materials/:id. Spread here,
      // at the first of the old positions; the two materials routes sat further down the old list,
      // but every path is a distinct literal, so the move changes no match ('**' stays last).
      ...libraryRoutes,
      //
      {
        path: 'finance',
        canActivate: [PermissionGuard],
        data: { permission: 'finance.read', breadcrumb: 'Finance' },
        loadChildren: () => import('@modules/finance').then((m) => m.financeRoutes),
      },
      // CRM — client requirement gathering. Lazy, per the finance precedent. The
      // old single broad CRM read parent gate is gone (that permission was retired in
      // the granularity refactor); each child in crm.routes.ts now carries its own
      // granular read guard (`crm.periods.read`, `crm.meetings.read`, …), so a caller
      // holding only one sub-permission is no longer 403'd at the parent.
      {
        path: 'crm',
        data: { breadcrumb: 'CRM' },
        loadChildren: () => import('@modules/crm').then((m) => m.crmRoutes),
      },
      // Office "my approvals" inbox — the dashboard "Needs attention" widget's "View all" target.
      {
        path: 'approvals',
        canActivate: [PermissionGuard],
        data: { permission: PERM.approvals.read, breadcrumb: 'Approvals' },
        loadComponent: crmPages.officeApprovals,
      },
      // The designer profile — a SIBLING of the `crm` entry above, not nested inside
      // `crm.routes.ts`: `crm.design_profile.read` is its own permission and a
      // "designer" grant may hold only that one.
      {
        path: 'crm/designer/projects/:projectId',
        canActivate: [PermissionGuard],
        data: { permission: PERM.crm.designProfile.read, breadcrumb: 'Client design profile' },
        loadComponent: crmPages.designProfile,
      },
      {
        path: 'audit',
        canActivate: [PermissionGuard],
        data: { permission: 'audit.read', breadcrumb: 'Audit log' },
        loadComponent: () => import('@modules/audit').then((m) => m.AuditLogComponent),
      },
      // Projects (spec 008): the eight old entries, metadata verbatim, spread at their old position.
      ...projectsRoutes,
      {
        path: '403',
        loadComponent: () =>
          import('./layouts/errors/forbidden.component').then((m) => m.ForbiddenComponent),
        data: { breadcrumb: 'Access denied' },
      },
      {
        path: '500',
        loadComponent: () =>
          import('./layouts/errors/server-error.component').then((m) => m.ServerErrorComponent),
        data: { breadcrumb: 'Server error' },
      },
      {
        path: '**',
        loadComponent: () =>
          import('./layouts/errors/not-found.component').then((m) => m.NotFoundComponent),
        data: { breadcrumb: 'Not found' },
      },
    ],
  },
];
