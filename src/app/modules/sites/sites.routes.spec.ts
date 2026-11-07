import { describe, expect, it } from 'vitest';
import { PermissionGuard } from '@platform/auth/permission.guard';
import { sitesRoutes } from './sites.routes';

describe('sitesRoutes (NEW-FEATURE-1)', () => {
  it('lists the survey routes, each guarded by its permission and lazy', async () => {
    expect(sitesRoutes.map((r) => r.path)).toEqual([
      'sites',
      'sites/:siteId',
      'admin/site-definitions',
      'admin/site-definitions/modules/:moduleId',
    ]);
    for (const r of sitesRoutes.slice(0, 2)) {
      expect(r.canActivate).toEqual([PermissionGuard]);
      expect(r.data?.['permission']).toBe('sites.read');
      expect(r.loadComponent).toBeTypeOf('function');
    }
    const cmp = (await sitesRoutes[0].loadComponent!()) as { name: string };
    expect(cmp.name).toContain('SiteListComponent');
    const detail = (await sitesRoutes[1].loadComponent!()) as { name: string };
    expect(detail.name).toContain('SiteDetailComponent');
  });

  it('S-10: the definitions routes take sites.definitions.manage and are lazy', async () => {
    const [defs, mod] = sitesRoutes.slice(2);
    for (const r of [defs, mod]) {
      expect(r.canActivate).toEqual([PermissionGuard]);
      expect(r.data?.['permission']).toBe('sites.definitions.manage');
    }
    expect(((await defs.loadComponent!()) as { name: string }).name).toContain(
      'SiteDefinitionsComponent',
    );
    expect(((await mod.loadComponent!()) as { name: string }).name).toContain(
      'SiteModuleDetailComponent',
    );
  });
});
