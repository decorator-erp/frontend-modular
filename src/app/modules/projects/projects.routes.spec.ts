import { PermissionGuard } from '@platform/auth/permission.guard';
import { projectsRoutes } from './projects.routes';
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
    ]);
  });

  it.each([
    ['projects', { breadcrumb: 'route.projects' }, ProjectsListComponent],
    ['projects/new', { breadcrumb: 'route.newProject' }, ProjectCreateComponent],
    ['projects/:id', { breadcrumb: 'route.project' }, ProjectDetailComponent],
    ['projects/:id/tasks/:taskId', { breadcrumb: 'route.task' }, TaskDetailComponent],
  ])('%s: no guard, %o', async (path, data, cmp) => {
    const r = route(path)!;
    expect(r.canActivate).toBeUndefined();
    expect(r.data).toEqual(data);
    expect(await r.loadComponent!()).toBe(cmp);
  });

  it.each([
    ['projects/:projectId/stages/:stageId', 'project.read', 'route.stage', DmsStageDetailComponent],
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

  it('crm-prod L-fe-3: every breadcrumb is a catalog key with English and Arabic text', () => {
    const crumbs = projectsRoutes
      .map((r) => r.data?.['breadcrumb'] as string | undefined)
      .filter((c): c is string => !!c);
    expect(crumbs.length).toBe(11); // 8 + crmp P-1 members, P-3 tasks, P-7 teams
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

  it('sow #2: projects/:id/scope-of-work is PermissionGuard-gated on scope.read and lazy-loads the page', async () => {
    const r = route('projects/:id/scope-of-work')!;
    expect(r.canActivate).toEqual([PermissionGuard]);
    expect(r.data).toEqual({ permission: PERM.scope.read, breadcrumb: 'route.scopeOfWork' });
    expect(PERM.scope.read).toBe('scope.read');
    expect(await r.loadComponent!()).toBe(ScopeOfWorkPageComponent);
  });

  it('crmp P-1: the members page is lazy and guarded on project.read', () => {
    const r = route('projects/:id/members');
    expect(r?.canActivate).toEqual([PermissionGuard]);
    expect(r?.data).toEqual({ permission: 'project.read', breadcrumb: 'route.projectMembers' });
    expect(r?.loadComponent).toBeTypeOf('function');
  });
});
