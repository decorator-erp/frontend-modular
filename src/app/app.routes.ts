import { Routes } from '@angular/router';
import { AuthGuard } from '@platform/auth/auth.guard';
import { ClientOnlyGuard, NotClientGuard } from '@platform/auth/client-shell.guard';
// TODO(005): PermissionGuard is unused until a real (non-stub) route below needs it —
// unused imports trip @typescript-eslint/no-unused-vars (warn), and charter §6 makes
// an uninherited new warning a stop-and-report. Restore alongside the first real
// PermissionGuard-gated route (005's `clients`/`audit`/`library` etc.).
// import { PermissionGuard } from '@platform/auth/permission.guard';
// TODO(005): PERM is unused for the same reason — every route citing a permission
// string below is still a comment. Restore with the first stub it un-comments.
// import { PERM } from '@platform/permissions';
// TODO(009): CatalogAdminStore lands with modules/crm at spec 009 — the
// `admin/catalog` stub below cites it but cannot import it yet.
// import { CatalogAdminStore } from '@modules/crm';

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
  // TODO(009): replace PlaceholderPageComponent with the real
  // features/crm/public/intake-page.component -> IntakePageComponent.
  {
    path: 'intake',
    loadComponent: () =>
      import('./layouts/placeholder/placeholder-page.component').then(
        (m) => m.PlaceholderPageComponent,
      ),
  },
  {
    path: 'intake/:lang',
    loadComponent: () =>
      import('./layouts/placeholder/placeholder-page.component').then(
        (m) => m.PlaceholderPageComponent,
      ),
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
      // TODO(009): '' -> PermissionGuard, data.permission = PERM.portal.profileViewOwn,
      // loadComponent -> features/crm/client/client-profile.component -> CrmClientProfileComponent
      //
      // TODO(009): 'schedule' -> PermissionGuard, data.permission = PERM.crm.meetings.viewOwn,
      // loadComponent -> features/crm/client/client-schedule-page.component
      //   -> CrmClientSchedulePageComponent
      //
      // TODO(009): 'add-requirement' -> PermissionGuard, data.permission = PERM.requirements.submitOwn,
      // loadComponent -> features/crm/client/client-add-requirement-page.component
      //   -> CrmClientAddRequirementPageComponent
      //
      // TODO(009): 'approvals' -> PermissionGuard, data.permission = PERM.crm.approvals.viewOwn,
      // loadComponent -> features/crm/client/client-approvals-page.component
      //   -> CrmClientApprovalsPageComponent
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
      // TODO(006): 'profile' -> loadComponent: features/profile/profile.component
      //   -> ProfileComponent, data.breadcrumb = 'Profile'
      //
      // TODO(005): 'notifications' -> loadComponent: features/notifications/notifications-page.component
      //   -> NotificationsPageComponent, data.breadcrumb = 'Notifications'
      //
      // TODO(006): 'employees' -> PermissionGuard, data = { permission: 'employees.read',
      //   breadcrumb: 'Employees' }, loadComponent: features/employees/employees-list.component
      //   -> EmployeesListComponent
      //
      // TODO(006): 'employees/:id' -> PermissionGuard, data = { permission: 'employees.read',
      //   breadcrumb: 'Employee' }, loadComponent: features/employees/employee-detail.component
      //   -> EmployeeDetailComponent
      //
      // TODO(005): 'clients' -> PermissionGuard, data = { permission: 'clients.read',
      //   breadcrumb: 'Clients' }, loadComponent: features/clients/clients-list.component
      //   -> ClientsListComponent
      //
      // TODO(006): 'roles' -> PermissionGuard, data = { permission: 'roles.read',
      //   breadcrumb: 'Roles' }, loadComponent: features/roles/roles.component -> RolesComponent
      //
      // TODO(006): 'permissions' -> PermissionGuard, data = { permission: 'permissions.manage',
      //   breadcrumb: 'Permissions' }, loadComponent: features/permissions/permissions.component
      //   -> PermissionsComponent
      //
      // TODO(009): 'admin/catalog' -> PermissionGuard. Gated on manage, not read — this page
      //   is a full CRUD editor (create, move, clone, delete categories and items), and
      //   crm.catalog.read is also granted to the Client role so the portal can render item
      //   names on a brief. Gating an editor on the read permission would offer this screen to a
      //   role that 403s on every button rather than simply not seeing it.
      //   data = { permission: PERM.crm.catalog.manage, breadcrumb: 'Catalog' },
      //   providers: [CatalogAdminStore],
      //   loadComponent: features/crm/admin/catalog/catalog-admin-page.component
      //   -> CrmCatalogAdminPageComponent
      //
      // TODO(005): 'library/stage-templates' -> data = { breadcrumb: 'Stage templates' },
      //   loadComponent: features/library/stage-templates-list.component
      //   -> StageTemplatesListComponent
      //
      // TODO(005): 'library/boq-catalog' -> data = { breadcrumb: 'BOQ catalog' },
      //   loadComponent: features/boq/boq-catalog.component -> BoqCatalogComponent
      //
      // TODO(007): 'finance' -> PermissionGuard, data = { permission: 'finance.read',
      //   breadcrumb: 'Finance' }, loadChildren: features/finance/finance.routes -> financeRoutes
      //
      // CRM — client requirement gathering. Lazy, per the finance precedent. The
      // old single broad CRM read parent gate is gone (that permission was retired in
      // the granularity refactor); each child in crm.routes.ts now carries its own
      // granular read guard (crm.periods.read, crm.meetings.read, etc.), so a caller
      // holding only one sub-permission is no longer 403'd at the parent.
      // TODO(009): 'crm' -> data = { breadcrumb: 'CRM' },
      //   loadChildren: features/crm/crm.routes -> crmRoutes
      //
      // Office "my approvals" inbox — the dashboard "Needs attention" widget's "View all" target.
      // TODO(009): 'approvals' -> PermissionGuard, data = { permission: PERM.approvals.read,
      //   breadcrumb: 'Approvals' }, loadComponent: features/approvals/approvals-list.component
      //   -> ApprovalsListComponent
      //
      // The designer profile — a SIBLING of the crm entry above, not nested inside
      // crm.routes.ts: crm.design_profile.read is its own permission and a
      // "designer" grant may hold only that one.
      // TODO(009): 'crm/designer/projects/:projectId' -> PermissionGuard,
      //   data = { permission: PERM.crm.designProfile.read, breadcrumb: 'Client design profile' },
      //   loadComponent: features/crm/designer/design-profile.component
      //   -> CrmDesignProfileComponent
      //
      // TODO(005): 'library/materials' -> data = { breadcrumb: 'Materials' },
      //   loadComponent: features/materials/materials-library.component
      //   -> MaterialsLibraryComponent
      //
      // TODO(005): 'library/materials/:id' -> data = { breadcrumb: 'Material' },
      //   loadComponent: features/materials/material-detail.component -> MaterialDetailComponent
      //
      // TODO(006): 'departments' -> PermissionGuard, data = { permission: 'departments.read',
      //   breadcrumb: 'Departments' }, loadComponent: features/departments/departments-list.component
      //   -> DepartmentsListComponent
      //
      // TODO(005): 'audit' -> PermissionGuard, data = { permission: 'audit.read',
      //   breadcrumb: 'Audit log' }, loadComponent: features/audit/audit-log.component
      //   -> AuditLogComponent
      //
      // TODO(008): 'projects' -> loadComponent: features/projects/projects-list.component
      //   -> ProjectsListComponent, data = { breadcrumb: 'Projects' }
      //
      // TODO(008): 'projects/new' -> loadComponent: features/projects/project-create.component
      //   -> ProjectCreateComponent, data = { breadcrumb: 'New project' }
      //
      // TODO(008): 'projects/:id' -> loadComponent: features/projects/project-detail.component
      //   -> ProjectDetailComponent, data = { breadcrumb: 'Project' }
      //
      // Canonical stage page — the DMS redesign (DMS Stage Detail.dc.html) is now
      // GA. Gated on the real backend read permission; per-panel write affordances
      // gate on real claims inside the component. The staged-rollout umbrella flag
      // has done its job and is dropped from the route.
      // TODO(008): 'projects/:projectId/stages/:stageId' -> PermissionGuard,
      //   data = { permission: 'project.read', breadcrumb: 'Stage' },
      //   loadComponent: features/projects/stage-detail/dms/dms-stage-detail.component
      //   -> DmsStageDetailComponent
      //
      // TODO(008): 'projects/:id/tasks/:taskId' -> loadComponent:
      //   features/projects/task-detail.component -> TaskDetailComponent,
      //   data = { breadcrumb: 'Task' }
      //
      // Redesigned DMS task view. Same component/data as the route above, but
      // permission-gated for staged rollout. dms.task_detail.view is a UI-side
      // gate only — backend ops grant it (docs/PERMISSIONS.md). Both coexist
      // until the DMS view is GA.
      // TODO(008): 'dms/projects/:projectId/tasks/:taskId' -> PermissionGuard,
      //   data = { permission: 'dms.task_detail.view', breadcrumb: 'Task' },
      //   loadComponent: features/projects/task-detail.component -> TaskDetailComponent
      //
      // Old DMS stage path -> permanent redirect to the canonical page (GA
      // cutover), preserving :projectId/:stageId so existing /dms/... links work.
      // TODO(008): 'dms/projects/:projectId/stages/:stageId' -> redirectTo:
      //   'projects/:projectId/stages/:stageId', pathMatch: 'full'
      //
      // TODO(008): 'projects/:projectId/workflow/builder' -> PermissionGuard,
      //   data = { permission: 'stages.manage', breadcrumb: 'Workflow Builder' },
      //   loadComponent: features/projects/workflow-builder/workflow-builder.component
      //   -> WorkflowBuilderComponent
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
