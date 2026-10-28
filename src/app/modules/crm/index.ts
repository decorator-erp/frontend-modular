// The CRM barrel: only what a foreign consumer needs (charter §3; spec 009). Each export names
// its consumer. The consumers come from the old app at SOURCE_SHA, listed in reports/009-report.md.

// app.routes.ts (the office shell's `crm` child).
export { crmRoutes } from './crm.routes';

// app.config.ts (the composition root's TASK_WORKSPACE registrations).
export { CRM_WORKSPACE_PANELS } from './composition/crm-workspace.providers';

// app.routes.ts (`admin/catalog` route providers).
export { CatalogAdminStore } from './stores/catalog-admin.store';

// app.routes.ts — lazy loaders for the routed pages the old app loaded from outside
// features/crm/crm.routes.ts. Loaders, not classes: see crm-pages.ts.
export { crmPages } from './crm-pages';

// notifications (notification-deep-link: the Meeting case; its spec also mocks the brief service).
export { CrmMeetingService } from './data/crm-meeting.service';
export { CrmBriefService } from './data/crm-brief.service';

// Future: dashboard (010) — crm-needs-attention-card and crm-gathering-tasks-card.
export { CrmApprovalsService } from './data/crm-approvals.service';
export { CrmMyGatheringWorkService } from './data/crm-my-gathering-work.service';
export type { MyGatheringWorkItem } from './data/crm-my-gathering-work.service';
export type { PendingApproval } from './model';
