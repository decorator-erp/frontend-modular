import { PermissionGuard } from '@platform/auth/permission.guard';
import { projectsRoutes } from './projects.routes';
import { ProjectGrantGuard } from './project-grant.guard';
import { DmsStageDetailComponent } from './ui/pages/dms-stage-detail.component';
import { ProjectCreateComponent } from './ui/pages/project-create.component';
import { ProjectDetailComponent } from './ui/pages/project-detail.component';
import { ProjectsListComponent } from './ui/pages/projects-list.component';
import { TaskDetailComponent } from './ui/pages/task-detail.component';
import { WorkflowBuilderComponent } from './ui/pages/workflow-builder.component';
import { ScopeOfWorkPageComponent } from './ui/scope-of-work/scope-of-work-page.component';
import { PERM } from '@platform/permissions';
import { EN } from '@platform/i18n/catalog/en';
import { AR } from '@platform/i18n/catalog/ar';
import { isCatalogKey } from '@platform/i18n/catalog.service';

/**
 * Pins the eight projects routes to the old app.routes.ts metadata at SOURCE_SHA (spec 008), plus
 * the scope-of-work route NEW-FEATURE-1 appends (specs/sow-scope-of-work.md §3, sow #2).
 */
describe('projectsRoutes', () => {
  const route = (path: string) => projectsRoutes.find((r) => r.path === path);

  it('holds exactly the eight old entries, in the old order, then the scope-of-work route, then the crmp routes', () => {
    expect(projectsRoutes.map((r) => r.path)).toEqual([
      'projects',
      'projects/new',
      'projects/shared-with-me',
      'projects/:id',
      'projects/:projectId/stages/:stageId',
      'projects/:id/tasks/:taskId',
      'dms/projects/:projectId/tasks/:taskId',
      'dms/projects/:projectId/stages/:stageId',
      'projects/:projectId/workflow/builder',
      'projects/:id/scope-of-work',
      'projects/:id/members',
      'projects/:id/tasks',
      'projects/:id/teams',
      'projects/:id/access',
    ]);
  });

  // UI-1: projects/:id stays guardless — access grants decide it, the page itself handles a denial.
  it.each([['projects/:id', { breadcrumb: 'route.project' }, ProjectDetailComponent]])(
    '%s: no guard, %o',
    async (path, data, cmp) => {
      const r = route(path)!;
      expect(r.canActivate).toBeUndefined();
      expect(r.data).toEqual(data);
      expect(await r.loadComponent!()).toBe(cmp);
    },
  );

  it.each([
    // UI-1: the list needs project.read, the create page project.create.
    ['projects', 'project.read', 'route.projects', ProjectsListComponent],
    ['projects/new', 'project.create', 'route.newProject', ProjectCreateComponent],
    [
      'dms/projects/:projectId/tasks/:taskId',
      'dms.task_detail.view',
      'route.task',
      TaskDetailComponent,
    ],
    [
      'projects/:projectId/workflow/builder',
      'stages.manage',
      'route.workflowBuilder',
      WorkflowBuilderComponent,
    ],
  ])('%s: PermissionGuard, %s, breadcrumb %s', async (path, permission, breadcrumb, cmp) => {
    const r = route(path)!;
    expect(r.canActivate).toEqual([PermissionGuard]);
    expect(r.data).toEqual({ permission, breadcrumb });
    expect(await r.loadComponent!()).toBe(cmp);
  });

  it.each([
    // UI-1: the stage page reads GET …/stages/{s} (stages.read); the task page stage_tasks.read.
    [
      'projects/:projectId/stages/:stageId',
      'stages.read',
      'StagesAndTasks',
      'route.stage',
      DmsStageDetailComponent,
    ],
    [
      'projects/:id/tasks/:taskId',
      'stage_tasks.read',
      'StagesAndTasks',
      'route.task',
      TaskDetailComponent,
    ],
    [
      'projects/:id/scope-of-work',
      'scope.read',
      'Overview',
      'route.scopeOfWork',
      ScopeOfWorkPageComponent,
    ],
  ])(
    'crmp P1-B: %s takes ProjectGrantGuard (%s, or a grant on %s)',
    async (path, permission, grantArea, breadcrumb, cmp) => {
      const r = route(path)!;
      expect(r.canActivate).toEqual([ProjectGrantGuard]);
      expect(r.data).toEqual({ permission, grantArea, breadcrumb });
      expect(await r.loadComponent!()).toBe(cmp);
    },
  );

  it('crmp P1-B: the tasks list admits a grant on Stages & tasks (any stage: the list is filtered)', () => {
    const r = route('projects/:id/tasks')!;
    expect(r.canActivate).toEqual([ProjectGrantGuard]);
    expect(r.data).toEqual({
      permission: 'stage_tasks.read',
      grantArea: 'StagesAndTasks',
      grantList: true,
      breadcrumb: 'route.projectTasks',
    });
  });

  it('crm-prod L-fe-3: every breadcrumb is a catalog key with English and Arabic text', () => {
    const crumbs = projectsRoutes
      .map((r) => r.data?.['breadcrumb'] as string | undefined)
      .filter((c): c is string => !!c);
    expect(crumbs.length).toBe(13); // 8 + crmp P-1 members, P-3 tasks, P-7 teams, P1-B access, shared
    for (const crumb of crumbs) {
      expect(isCatalogKey(crumb)).toBe(true);
      if (!isCatalogKey(crumb)) continue;
      expect(EN[crumb]).toBeTruthy();
      expect(AR[crumb]).toBeTruthy();
      expect(AR[crumb]).not.toBe(EN[crumb]);
    }
    expect(EN['route.projects']).toBe('Projects');
    expect(EN['route.workflowBuilder']).toBe('Workflow Builder');
  });

  it('keeps the old /dms stage path as a full-match redirect to the canonical stage page', () => {
    const r = route('dms/projects/:projectId/stages/:stageId')!;
    expect(r.redirectTo).toBe('projects/:projectId/stages/:stageId');
    expect(r.pathMatch).toBe('full');
  });

  it('sow #2: projects/:id/scope-of-work is gated on scope.read and lazy-loads the page', async () => {
    const r = route('projects/:id/scope-of-work')!;
    expect(r.data?.['permission']).toBe(PERM.scope.read);
    expect(PERM.scope.read).toBe('scope.read');
    expect(await r.loadComponent!()).toBe(ScopeOfWorkPageComponent);
  });

  it('crmp P1-B: shared-with-me is guardless, lazy and before projects/:id', async () => {
    const paths = projectsRoutes.map((r) => r.path);
    expect(paths.indexOf('projects/shared-with-me')).toBeLessThan(paths.indexOf('projects/:id'));
    const r = route('projects/shared-with-me')!;
    expect(r.canActivate).toBeUndefined();
    expect(r.data).toEqual({ breadcrumb: 'route.sharedWithMe' });
    const cmp = (await r.loadComponent!()) as { name: string };
    expect(cmp.name).toContain('SharedWithMePageComponent');
  });

  it('crmp P1-B: the access page is lazy, guarded on project.read and loads ProjectAccessPageComponent', async () => {
    const r = route('projects/:id/access')!;
    expect(r.canActivate).toEqual([PermissionGuard]);
    expect(r.data).toEqual({ permission: 'project.read', breadcrumb: 'route.projectAccess' });
    const cmp = (await r.loadComponent!()) as { name: string };
    expect(cmp.name).toContain('ProjectAccessPageComponent');
  });

  it('crmp P-1: the members page is lazy and guarded on project.read', () => {
    const r = route('projects/:id/members');
    // crmp P1-B: or a grant on Team (read only).
    expect(r?.canActivate).toEqual([ProjectGrantGuard]);
    expect(r?.data).toEqual({
      permission: 'project.read',
      grantArea: 'Team',
      breadcrumb: 'route.projectMembers',
    });
    expect(r?.loadComponent).toBeTypeOf('function');
  });
});
