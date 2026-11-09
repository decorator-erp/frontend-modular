import { crmPages } from './crm-pages';
import { crmRoutes, portalReadGuard } from './crm.routes';
import { CrmPortalPageComponent } from './ui/portal/portal-page.component';
import { IntakePageComponent } from './ui/public/intake-page.component';
import { CrmClientProfileComponent } from './ui/client/client-profile.component';
import { CrmClientSchedulePageComponent } from './ui/client/client-schedule-page.component';
import { CrmClientAddRequirementPageComponent } from './ui/client/client-add-requirement-page.component';
import { CrmClientApprovalsPageComponent } from './ui/client/client-approvals-page.component';
import { CrmCatalogAdminPageComponent } from './ui/admin/catalog/catalog-admin-page.component';
import { ApprovalsListComponent } from './ui/office-approvals/approvals-list.component';
import { CrmDesignProfileComponent } from './ui/designer/design-profile.component';

describe('crmPages — the lazy loaders app.routes.ts routes through', () => {
  // crmp P2-B: +1 projects/:projectId/portal (the Client portal tab).
  it('resolves the routes loader to crmRoutes and its 12 children (LC-1 added the convert wizard)', async () => {
    const routes = await crmPages.routes();
    expect(routes).toBe(crmRoutes);
    expect(routes).toHaveLength(12);
  });

  it('crmp P2-B: the Client portal tab reads with crm.portal.manage OR clients.read', async () => {
    const route = crmRoutes.find((r) => r.path === 'projects/:projectId/portal');
    expect(route?.canActivate).toEqual([portalReadGuard]);
    expect(route?.data?.['permissions']).toEqual(['crm.portal.manage', 'clients.read']);
    const page = await (route?.loadComponent as () => Promise<unknown>)();
    expect(page).toBe(CrmPortalPageComponent);
  });

  // 009b #N-5: no space-item routes exist on the backend, so the storefront route is gone.
  it('has no space storefront (record) route (009b #N-5)', () => {
    expect(crmRoutes.map((r) => r.path)).not.toContain(
      'projects/:projectId/spaces/:spaceId/record',
    );
  });

  it('resolves each page loader to its page class', async () => {
    const expected: [Exclude<keyof typeof crmPages, 'routes'>, unknown][] = [
      ['intake', IntakePageComponent],
      ['clientProfile', CrmClientProfileComponent],
      ['clientSchedule', CrmClientSchedulePageComponent],
      ['clientAddRequirement', CrmClientAddRequirementPageComponent],
      ['clientApprovals', CrmClientApprovalsPageComponent],
      ['catalogAdmin', CrmCatalogAdminPageComponent],
      ['officeApprovals', ApprovalsListComponent],
      ['designProfile', CrmDesignProfileComponent],
    ];
    expect(Object.keys(crmPages)).toHaveLength(expected.length + 1);
    for (const [key, cmp] of expected) {
      expect(await crmPages[key]()).toBe(cmp);
    }
  });
});
