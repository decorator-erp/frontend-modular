import { PermissionGuard } from '@platform/auth/permission.guard';
import { FileTemplatesListComponent } from './ui/file-templates/file-templates-list.component';
import { libraryRoutes } from './library.routes';
import { StageTemplatesListComponent } from './ui/stage-templates/stage-templates-list.component';
import { StageTemplateDetailComponent } from './ui/stage-templates/stage-template-detail.component';
import { BoqCatalogComponent } from './ui/boq/boq-catalog.component';
import { MaterialsLibraryComponent } from './ui/materials/materials-library.component';
import { MaterialDetailComponent } from './ui/materials/material-detail.component';

describe('libraryRoutes — the 005 library routes', () => {
  it('declares the four old library routes, in old order, plus the sync F1 template editor and the F3 file templates', () => {
    expect(libraryRoutes.map((r) => r.path)).toEqual([
      'library/stage-templates',
      'library/stage-templates/:id',
      'library/file-templates',
      'library/boq-catalog',
      'library/materials',
      'library/materials/:id',
    ]);
  });

  // UI-1: the stage-template pages read GET /api/stage-templates (stages.read).
  it.each([
    ['library/stage-templates', 'Stage templates', StageTemplatesListComponent],
    ['library/stage-templates/:id', 'Stage template', StageTemplateDetailComponent],
  ])('%s: PermissionGuard stages.read, breadcrumb %s', async (path, breadcrumb, cmp) => {
    const r = libraryRoutes.find((x) => x.path === path);
    expect(r).toBeTruthy();
    expect(r!.canActivate).toEqual([PermissionGuard]);
    expect(r!.data).toEqual({ permission: 'stages.read', breadcrumb });
    expect(await r!.loadComponent!()).toBe(cmp);
  });

  it.each([
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

describe('libraryRoutes — sync F3 file templates', () => {
  it('library/file-templates is lazy and gated on file_templates.read', async () => {
    const r = libraryRoutes.find((x) => x.path === 'library/file-templates')!;
    expect(r.canActivate).toEqual([PermissionGuard]);
    expect(r.data).toEqual({ permission: 'file_templates.read', breadcrumb: 'File templates' });
    expect(await r.loadComponent!()).toBe(FileTemplatesListComponent);
  });
});
