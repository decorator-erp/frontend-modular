import { Routes } from '@angular/router';
import { PermissionGuard } from '@platform/auth/permission.guard';
import { PERM } from '@platform/permissions';

/**
 * The projects module's office-shell routes (spec 008). NEW file: its entries are the old
 * app.routes.ts projects block at SOURCE_SHA (`projects` … `projects/:projectId/workflow/builder`),
 * metadata verbatim (crm-prod L-fe-3: breadcrumbs are catalog keys), spread into the shell's children by app.routes.ts at the same position.
 */
export const projectsRoutes: Routes = [
  {
    path: 'projects',
    loadComponent: () =>
      import('./ui/pages/projects-list.component').then((m) => m.ProjectsListComponent),
    data: { breadcrumb: 'route.projects' },
  },
  {
    path: 'projects/new',
    loadComponent: () =>
      import('./ui/pages/project-create.component').then((m) => m.ProjectCreateComponent),
    data: { breadcrumb: 'route.newProject' },
  },
  {
    path: 'projects/:id',
    loadComponent: () =>
      import('./ui/pages/project-detail.component').then((m) => m.ProjectDetailComponent),
    data: { breadcrumb: 'route.project' },
  },
  // Canonical stage page — the DMS redesign (DMS Stage Detail.dc.html) is now
  // GA. Gated on the real backend read permission; per-panel write affordances
  // gate on real claims inside the component. The staged-rollout umbrella flag
  // has done its job and is dropped from the route.
  {
    path: 'projects/:projectId/stages/:stageId',
    canActivate: [PermissionGuard],
    data: { permission: 'project.read', breadcrumb: 'route.stage' },
    loadComponent: () =>
      import('./ui/pages/dms-stage-detail.component').then((m) => m.DmsStageDetailComponent),
  },
  {
    path: 'projects/:id/tasks/:taskId',
    loadComponent: () =>
      import('./ui/pages/task-detail.component').then((m) => m.TaskDetailComponent),
    data: { breadcrumb: 'route.task' },
  },
  // Redesigned DMS task view. Same component/data as the route above, but
  // permission-gated for staged rollout. `dms.task_detail.view` is a UI-side
  // gate only — backend ops grant it (docs/PERMISSIONS.md). Both coexist
  // until the DMS view is GA.
  {
    path: 'dms/projects/:projectId/tasks/:taskId',
    canActivate: [PermissionGuard],
    data: { permission: 'dms.task_detail.view', breadcrumb: 'route.task' },
    loadComponent: () =>
      import('./ui/pages/task-detail.component').then((m) => m.TaskDetailComponent),
  },
  // Old DMS stage path → permanent redirect to the canonical page (GA
  // cutover), preserving :projectId/:stageId so existing /dms/... links work.
  {
    path: 'dms/projects/:projectId/stages/:stageId',
    redirectTo: 'projects/:projectId/stages/:stageId',
    pathMatch: 'full',
  },
  {
    path: 'projects/:projectId/workflow/builder',
    canActivate: [PermissionGuard],
    data: { permission: 'stages.manage', breadcrumb: 'route.workflowBuilder' },
    loadComponent: () =>
      import('./ui/pages/workflow-builder.component').then((m) => m.WorkflowBuilderComponent),
  },
  // NEW-FEATURE-1: the project's scope of work (specs/sow-scope-of-work.md §3).
  {
    path: 'projects/:id/scope-of-work',
    canActivate: [PermissionGuard],
    data: { permission: PERM.scope.read, breadcrumb: 'route.scopeOfWork' },
    loadComponent: () =>
      import('./ui/scope-of-work/scope-of-work-page.component').then(
        (m) => m.ScopeOfWorkPageComponent,
      ),
  },
  // crmp P-1 (DEVIATION-4: the project page has no tabs): the members and their levels.
  {
    path: 'projects/:id/members',
    canActivate: [PermissionGuard],
    data: { permission: PERM.projects.read, breadcrumb: 'route.projectMembers' },
    loadComponent: () =>
      import('./ui/members/project-members-page.component').then(
        (m) => m.ProjectMembersPageComponent,
      ),
  },
  // crmp P-3: the project's tasks with stage, assignee and status filters.
  {
    path: 'projects/:id/tasks',
    canActivate: [PermissionGuard],
    data: { permission: PERM.stageTasks.read, breadcrumb: 'route.projectTasks' },
    loadComponent: () =>
      import('./ui/tasks/project-tasks-page.component').then((m) => m.ProjectTasksPageComponent),
  },
  // crmp P-7: the project's stage teams (the project page's "Manage team" already links here).
  {
    path: 'projects/:id/teams',
    canActivate: [PermissionGuard],
    data: { permission: PERM.stages.read, breadcrumb: 'route.projectTeams' },
    loadComponent: () =>
      import('./ui/teams/project-teams-page.component').then((m) => m.ProjectTeamsPageComponent),
  },
  // crmp P1-B: the project's temporary access grants (its Access tab). The page itself admits only a
  // project.manage_access holder or a Manager by membership.
  {
    path: 'projects/:id/access',
    canActivate: [PermissionGuard],
    data: { permission: PERM.projects.read, breadcrumb: 'route.projectAccess' },
    loadComponent: () =>
      import('./ui/access/project-access-page.component').then((m) => m.ProjectAccessPageComponent),
  },
];
