import { crmPages } from './crm-pages';
import { crmRoutes } from './crm.routes';
import { IntakePageComponent } from './ui/public/intake-page.component';
import { CrmClientProfileComponent } from './ui/client/client-profile.component';
import { CrmClientSchedulePageComponent } from './ui/client/client-schedule-page.component';
import { CrmClientAddRequirementPageComponent } from './ui/client/client-add-requirement-page.component';
import { CrmClientApprovalsPageComponent } from './ui/client/client-approvals-page.component';
import { CrmCatalogAdminPageComponent } from './ui/admin/catalog/catalog-admin-page.component';
import { ApprovalsListComponent } from './ui/office-approvals/approvals-list.component';
import { CrmDesignProfileComponent } from './ui/designer/design-profile.component';

describe('crmPages — the lazy loaders app.routes.ts routes through', () => {
  it('resolves the routes loader to crmRoutes and its 11 children', async () => {
    const routes = await crmPages.routes();
    expect(routes).toBe(crmRoutes);
    expect(routes).toHaveLength(11);
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
