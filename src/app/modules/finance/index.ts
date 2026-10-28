// The finance barrel: only what a foreign consumer needs (charter §3; spec 007). Each export names
// its consumer. The consumers come from the old app at SOURCE_SHA, listed in reports/007-report.md.

// app.routes.ts (the office shell's `finance` child).
export { financeRoutes } from './finance.routes';

// notifications (notification-deep-link: the Invoice and Variation cases); dashboard (010).
export { InvoiceService } from './data/invoice.service';
export { VariationService } from './data/variation.service';

// Future: dashboard (010).
export { ProjectFinancialDashboardService } from './data/project-financial-dashboard.service';

// Future: projects (008) — task-detail dms-linked-items.
export { DependencyTreeService } from './data/dependency-tree.service';
export type { TaskTreeNode } from './model/dependency-tree.model';

// Future: projects (008) — project, project-stage and project-task services and project.model.
export type { BoqSnapshotResponse } from './model/boq-snapshot.model';
export type { InvoiceResponse } from './model/invoice.model';
export type { LedgerMovementResponse, PagedResponse } from './model/ledger-movement.model';
export type {
  ProjectBudgetSummaryResponse,
  ProjectFinancialBlock,
  ProjectStageFinancialBlock,
  ProjectTaskFinancialBlock,
} from './model/financial-block.model';
export type { TaskBoqLineResponse } from './model/task-boq-line.model';
export type { TaskInvoiceLineResponse } from './model/task-invoice-line.model';
export type { VariationResponse } from './model/variation.model';

// Future: crm (009) — lead-detail.
export { applyFinanceServerError } from './model/validation/finance-error-mapping';
