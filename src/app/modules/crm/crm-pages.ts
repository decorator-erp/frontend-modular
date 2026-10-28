// Lazy loaders for crmRoutes and for the CRM pages app.routes.ts routes outside it (intake, the four portal
// children, admin/catalog, the office approvals inbox, the designer profile). The barrel exports
// these instead of the page classes: app.config.ts and app.routes.ts import the barrel statically,
// so a class exported from it lands in the initial bundle, while each loader keeps its page in its
// own lazy chunk exactly as the old app's `import('./features/crm/…')` did.
export const crmPages = {
  // The office shell's `crm` child: its 11 children and their route-level stores stay lazy.
  routes: () => import('./crm.routes').then((m) => m.crmRoutes),
  intake: () => import('./ui/public/intake-page.component').then((m) => m.IntakePageComponent),
  clientProfile: () =>
    import('./ui/client/client-profile.component').then((m) => m.CrmClientProfileComponent),
  clientSchedule: () =>
    import('./ui/client/client-schedule-page.component').then(
      (m) => m.CrmClientSchedulePageComponent,
    ),
  clientAddRequirement: () =>
    import('./ui/client/client-add-requirement-page.component').then(
      (m) => m.CrmClientAddRequirementPageComponent,
    ),
  clientApprovals: () =>
    import('./ui/client/client-approvals-page.component').then(
      (m) => m.CrmClientApprovalsPageComponent,
    ),
  catalogAdmin: () =>
    import('./ui/admin/catalog/catalog-admin-page.component').then(
      (m) => m.CrmCatalogAdminPageComponent,
    ),
  officeApprovals: () =>
    import('./ui/office-approvals/approvals-list.component').then((m) => m.ApprovalsListComponent),
  designProfile: () =>
    import('./ui/designer/design-profile.component').then((m) => m.CrmDesignProfileComponent),
};
