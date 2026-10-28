import { Provider } from '@angular/core';
import { TASK_WORKSPACE, WorkspacePanel } from '@platform/composition/task-workspace.token';

/**
 * The CRM side of the `TASK_WORKSPACE` registry (T095) — registered once in the app's
 * root providers (`app.config.ts`). `features/projects` never sees this file.
 *
 * `claims()` reads `host.crm` and NOTHING else (FR-005) — never a name, a template id,
 * a status, or a route param. `load()` is a dynamic import — the CRM bundle must never
 * load on a non-CRM stage or task (US5 scenario 2).
 */
export const CRM_WORKSPACE_PANELS: Provider[] = [
  {
    provide: TASK_WORKSPACE,
    multi: true,
    useValue: {
      slot: 'stage-main',
      order: 10,
      claims: (host) => !!host.crm,
      load: () => import('./crm-stage-panel.component').then((m) => m.CrmStagePanelComponent),
    } satisfies WorkspacePanel,
  },
  {
    provide: TASK_WORKSPACE,
    multi: true,
    useValue: {
      slot: 'stage-rail',
      order: 10,
      claims: (host) => !!host.crm,
      load: () => import('./crm-meetings-rail.component').then((m) => m.CrmMeetingsRailComponent),
    } satisfies WorkspacePanel,
  },
  {
    provide: TASK_WORKSPACE,
    multi: true,
    useValue: {
      slot: 'task-main',
      order: 10,
      claims: (host) => !!host.crm,
      load: () => import('./crm-task-panel.component').then((m) => m.CrmTaskPanelComponent),
    } satisfies WorkspacePanel,
  },
  {
    provide: TASK_WORKSPACE,
    multi: true,
    useValue: {
      slot: 'task-rail',
      order: 10,
      claims: (host) => !!host.crm,
      load: () => import('./crm-meetings-rail.component').then((m) => m.CrmMeetingsRailComponent),
    } satisfies WorkspacePanel,
  },
];
