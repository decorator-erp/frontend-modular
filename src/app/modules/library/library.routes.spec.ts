import { libraryRoutes } from './library.routes';
import { StageTemplatesListComponent } from './ui/stage-templates/stage-templates-list.component';
import { StageTemplateDetailComponent } from './ui/stage-templates/stage-template-detail.component';
import { BoqCatalogComponent } from './ui/boq/boq-catalog.component';
import { MaterialsLibraryComponent } from './ui/materials/materials-library.component';
import { MaterialDetailComponent } from './ui/materials/material-detail.component';

describe('libraryRoutes — the 005 library routes', () => {
  it('declares the four old library routes, in old order, plus the sync F1 template editor', () => {
    expect(libraryRoutes.map((r) => r.path)).toEqual([
      'library/stage-templates',
      'library/stage-templates/:id',
      'library/boq-catalog',
      'library/materials',
      'library/materials/:id',
    ]);
  });

  it.each([
    ['library/stage-templates', 'Stage templates', StageTemplatesListComponent],
    ['library/stage-templates/:id', 'Stage template', StageTemplateDetailComponent],
    ['library/boq-catalog', 'BOQ catalog', BoqCatalogComponent],
    ['library/materials', 'Materials', MaterialsLibraryComponent],
    ['library/materials/:id', 'Material', MaterialDetailComponent],
  ])('%s: no guard, breadcrumb %s', async (path, breadcrumb, cmp) => {
    const r = libraryRoutes.find((x) => x.path === path);
    expect(r).toBeTruthy();
    expect(r!.canActivate).toBeUndefined();
    expect(r!.data).toEqual({ breadcrumb });
    expect(await r!.loadComponent!()).toBe(cmp);
  });
});
