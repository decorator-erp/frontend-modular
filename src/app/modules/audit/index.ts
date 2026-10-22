// The audit barrel: only what a foreign consumer needs (charter §3; spec 005). Each export names
// its consumer. Future consumers, from the old app at SOURCE_SHA, are listed in reports/005-report.md.

// app.routes.ts: `audit` is a single-page module, routed through its barrel (spec 005 recipe 3).
export { AuditLogComponent } from './ui/audit-log.component';

// Future: projects (activity/activity-feed.component).
export { ActivityService } from './data/activity.service';
export type { ActivityResponse } from './model/audit.model';
