import { Routes } from '@angular/router';

/**
 * The four library routes, children of the office shell. Each object is the old `app.routes.ts`
 * entry at SOURCE_SHA, byte-for-byte except the `loadComponent` path (spec 005; metadata verbatim
 * from the 004 stubs). All four are ungated, as in the old app. Old order.
 */
export const libraryRoutes: Routes = [
  {
    path: 'library/stage-templates',
    data: { breadcrumb: 'Stage templates' },
    loadComponent: () =>
      import('./ui/stage-templates/stage-templates-list.component').then(
        (m) => m.StageTemplatesListComponent,
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
