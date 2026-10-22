// The approvals barrel: only what a foreign consumer needs (charter §3; spec 005). Spec 005 ports
// the service and model only: the office approvals PAGE injects CrmApprovalsService (CRM data), so
// it moves to 009 with CRM and its route stays TODO(009) in app.routes.ts.

// modules/notifications (ui/notification-deep-link.ts); future: dashboard.
export { ApprovalService } from './data/approval.service';

// Future: dashboard (dashboard.component).
export type { ApprovalRequest } from './model/approval.model';
