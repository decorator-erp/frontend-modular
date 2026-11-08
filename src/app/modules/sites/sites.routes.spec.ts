import { Component } from '@angular/core';
import { TestBed } from '@angular/core/testing';
import { Location } from '@angular/common';
import { provideLocationMocks } from '@angular/common/testing';
import { Router, provideRouter } from '@angular/router';
import { RouterTestingHarness } from '@angular/router/testing';
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
    // A3: leaving a survey with unsaved grid edits asks first
    const leave = sitesRoutes[1].canDeactivate![0] as (c: unknown) => unknown;
    expect(leave({ canLeave: () => false })).toBe(false);
    expect(leave({})).toBe(true);
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

/** Stands in for the survey page: only `canLeave()` matters to the route's guard. */
@Component({ selector: 'app-leave-stub', template: '' })
class LeaveStubComponent {
  allow = true;
  asked = 0;
  canLeave(): boolean {
    this.asked++;
    return this.allow;
  }
}

describe('sitesRoutes — BL-1: the unsaved-grid guard runs on query-param-only navigation', () => {
  async function setup() {
    const detail = sitesRoutes[1];
    TestBed.configureTestingModule({
      providers: [
        provideLocationMocks(),
        provideRouter([
          {
            ...detail,
            canActivate: [],
            loadComponent: undefined,
            component: LeaveStubComponent,
          },
        ]),
      ],
    });
    const harness = await RouterTestingHarness.create();
    const page = (await harness.navigateByUrl('/sites/S1?tab=overview', LeaveStubComponent))!;
    await harness.navigateByUrl('/sites/S1?tab=capture&moduleId=M1');
    const router = TestBed.inject(Router);
    router.setUpLocationChangeListener(); // what the app's bootstrap does: follow popstate
    const location = TestBed.inject(Location);
    return { harness, page, router, location };
  }

  it('a tab switch by query params asks the page and stays when it refuses', async () => {
    const { page, router } = await setup();
    page.asked = 0;
    page.allow = false;
    expect(await router.navigateByUrl('/sites/S1?tab=boq')).toBe(false);
    expect(page.asked).toBe(1);
    expect(router.url).toBe('/sites/S1?tab=capture&moduleId=M1');
    page.allow = true;
    expect(await router.navigateByUrl('/sites/S1?tab=boq')).toBe(true);
    expect(router.url).toBe('/sites/S1?tab=boq');
  });

  it('browser Back to another tab asks the page and keeps the grid when it refuses', async () => {
    const { page, router, location, harness } = await setup();
    page.asked = 0;
    page.allow = false;
    location.back();
    await new Promise((r) => setTimeout(r)); // the router handles popstate in a macrotask
    await harness.fixture.whenStable();
    expect(page.asked).toBe(1);
    expect(router.url).toBe('/sites/S1?tab=capture&moduleId=M1');
  });
});
