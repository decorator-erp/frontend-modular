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

/**
 * Pins the eight projects routes to the old app.routes.ts metadata at SOURCE_SHA (spec 008), plus
 * the scope-of-work route NEW-FEATURE-1 appends (specs/sow-scope-of-work.md §3, sow #2).
 */
describe('projectsRoutes', () => {
  const route = (path: string) => projectsRoutes.find((r) => r.path === path);

  it('holds exactly the eight old entries, in the old order, then the scope-of-work route', () => {
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
    ]);
  });

  it.each([
    ['projects', { breadcrumb: 'Projects' }, ProjectsListComponent],
    ['projects/new', { breadcrumb: 'New project' }, ProjectCreateComponent],
    ['projects/:id', { breadcrumb: 'Project' }, ProjectDetailComponent],
    ['projects/:id/tasks/:taskId', { breadcrumb: 'Task' }, TaskDetailComponent],
  ])('%s: no guard, %o', async (path, data, cmp) => {
    const r = route(path)!;
    expect(r.canActivate).toBeUndefined();
    expect(r.data).toEqual(data);
    expect(await r.loadComponent!()).toBe(cmp);
  });

  it.each([
    ['projects/:projectId/stages/:stageId', 'project.read', 'Stage', DmsStageDetailComponent],
    ['dms/projects/:projectId/tasks/:taskId', 'dms.task_detail.view', 'Task', TaskDetailComponent],
    [
      'projects/:projectId/workflow/builder',
      'stages.manage',
      'Workflow Builder',
      WorkflowBuilderComponent,
    ],
  ])('%s: PermissionGuard, %s, breadcrumb %s', async (path, permission, breadcrumb, cmp) => {
    const r = route(path)!;
    expect(r.canActivate).toEqual([PermissionGuard]);
    expect(r.data).toEqual({ permission, breadcrumb });
    expect(await r.loadComponent!()).toBe(cmp);
  });

  it('keeps the old /dms stage path as a full-match redirect to the canonical stage page', () => {
    const r = route('dms/projects/:projectId/stages/:stageId')!;
    expect(r.redirectTo).toBe('projects/:projectId/stages/:stageId');
    expect(r.pathMatch).toBe('full');
  });

  it('sow #2: projects/:id/scope-of-work is PermissionGuard-gated on scope.read and lazy-loads the page', async () => {
    const r = route('projects/:id/scope-of-work')!;
    expect(r.canActivate).toEqual([PermissionGuard]);
    expect(r.data).toEqual({ permission: PERM.scope.read, breadcrumb: 'Scope of work' });
    expect(PERM.scope.read).toBe('scope.read');
    expect(await r.loadComponent!()).toBe(ScopeOfWorkPageComponent);
  });
});
