import { Routes } from '@angular/router';
import { PermissionGuard } from '@platform/auth/permission.guard';

/**
 * The four library routes, children of the office shell. Each object is the old `app.routes.ts`
 * entry at SOURCE_SHA, byte-for-byte except the `loadComponent` path (spec 005; metadata verbatim
 * from the 004 stubs). All four are ungated, as in the old app. Old order.
 */
export const libraryRoutes: Routes = [
  {
    path: 'library/stage-templates',
    // UI-1: GET /api/stage-templates needs `stages.read`.
    canActivate: [PermissionGuard],
    data: { permission: 'stages.read', breadcrumb: 'Stage templates' },
    loadComponent: () =>
      import('./ui/stage-templates/stage-templates-list.component').then(
        (m) => m.StageTemplatesListComponent,
      ),
  },
  // Sync F1: the template structure editor (stages, tasks, sub-tasks, departments). Lazy, ungated
  // like the list: reads need `stages.read`, every write control is behind `*peraCan` stages.manage.
  {
    path: 'library/stage-templates/:id',
    canActivate: [PermissionGuard],
    data: { permission: 'stages.read', breadcrumb: 'Stage template' },
    loadComponent: () =>
      import('./ui/stage-templates/stage-template-detail.component').then(
        (m) => m.StageTemplateDetailComponent,
      ),
  },
  // Sync F3: the file template library. Lazy; reads need `file_templates.read`.
  {
    path: 'library/file-templates',
    canActivate: [PermissionGuard],
    data: { permission: 'file_templates.read', breadcrumb: 'File templates' },
    loadComponent: () =>
      import('./ui/file-templates/file-templates-list.component').then(
        (m) => m.FileTemplatesListComponent,
      ),
  },
  {
    path: 'library/boq-catalog',
    data: { breadcrumb: 'BOQ catalog' },
    loadComponent: () =>
      import('./ui/boq/boq-catalog.component').then((m) => m.BoqCatalogComponent),
  },
  {
    path: 'library/materials',
    data: { breadcrumb: 'Materials' },
    loadComponent: () =>
      import('./ui/materials/materials-library.component').then((m) => m.MaterialsLibraryComponent),
  },
  {
    path: 'library/materials/:id',
    data: { breadcrumb: 'Material' },
    loadComponent: () =>
      import('./ui/materials/material-detail.component').then((m) => m.MaterialDetailComponent),
  },
];
