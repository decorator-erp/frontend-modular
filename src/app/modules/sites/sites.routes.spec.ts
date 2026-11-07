import { describe, expect, it } from 'vitest';
import { PermissionGuard } from '@platform/auth/permission.guard';
import { sitesRoutes } from './sites.routes';

describe('sitesRoutes (NEW-FEATURE-1)', () => {
  it('lists the survey routes, each guarded by its permission and lazy', async () => {
    expect(sitesRoutes.map((r) => r.path)).toEqual(['sites']);
    for (const r of sitesRoutes) {
      expect(r.canActivate).toEqual([PermissionGuard]);
      expect(r.data?.['permission']).toBe('sites.read');
      expect(r.loadComponent).toBeTypeOf('function');
    }
    const cmp = (await sitesRoutes[0].loadComponent!()) as { name: string };
    expect(cmp.name).toContain('SiteListComponent');
  });
});
