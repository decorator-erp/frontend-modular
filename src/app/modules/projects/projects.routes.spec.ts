import { PermissionGuard } from '@platform/auth/permission.guard';
import { projectsRoutes } from './projects.routes';
import { DmsStageDetailComponent } from './ui/pages/dms-stage-detail.component';
import { ProjectCreateComponent } from './ui/pages/project-create.component';
import { ProjectDetailComponent } from './ui/pages/project-detail.component';
import { ProjectsListComponent } from './ui/pages/projects-list.component';
import { TaskDetailComponent } from './ui/pages/task-detail.component';
import { WorkflowBuilderComponent } from './ui/pages/workflow-builder.component';

/** Pins the eight projects routes to the old app.routes.ts metadata at SOURCE_SHA (spec 008). */
describe('projectsRoutes', () => {
  const route = (path: string) => projectsRoutes.find((r) => r.path === path);

  it('holds exactly the eight old entries, in the old order', () => {
    expect(projectsRoutes.map((r) => r.path)).toEqual([
      'projects',
      'projects/new',
      'projects/:id',
      'projects/:projectId/stages/:stageId',
      'projects/:id/tasks/:taskId',
      'dms/projects/:projectId/tasks/:taskId',
      'dms/projects/:projectId/stages/:stageId',
      'projects/:projectId/workflow/builder',
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
});
