// The CRM barrel: only what a foreign consumer needs (charter §3; spec 009). Each export names
// its consumer. The consumers come from the old app at SOURCE_SHA, listed in reports/009-report.md.

// app.config.ts (the composition root's TASK_WORKSPACE registrations).
export { CRM_WORKSPACE_PANELS } from './composition/crm-workspace.providers';

// app.routes.ts (`admin/catalog` route providers).
export { CatalogAdminStore } from './stores/catalog-admin.store';

// app.routes.ts — lazy loaders for crmRoutes (the office shell's `crm` child) and for the routed
// pages the old app loaded from outside features/crm/crm.routes.ts. Loaders, not classes or the
// routes array: see crm-pages.ts.
export { crmPages } from './crm-pages';

// notifications (notification-deep-link: the Meeting case). CrmBriefService's only consumer is
// notification-deep-link.spec.ts, whose verbatim beforeEach provides a mock for it.
export { CrmMeetingService } from './data/crm-meeting.service';
export { CrmBriefService } from './data/crm-brief.service';
