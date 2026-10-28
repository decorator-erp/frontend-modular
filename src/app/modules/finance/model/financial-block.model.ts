/**
 * Financial blocks — per the financial-queries spec. Every money field is a
 * decimal STRING preserved end-to-end; format only at the `MoneyService`
 * boundary.
 *
 * `budgetStatus` mirrors the canonical `TaskBudgetStatus` enum
 * (`@shared/enums/finance`, extended with `AtRisk`). The union is inlined here
 * because `core` may not import `shared` under the architecture boundary rule.
 */
export interface ProjectTaskFinancialBlock {
  /** decimal(19,4) — immutable original cap, used for analytics. */
  estimatedBudget: string;
  /** decimal(19,4) — Σ Applied Variation amounts at task scope. */
  approvedAdjustments: string;
  /** decimal(19,4) — estimatedBudget plus approvedAdjustments. */
  effectiveCap: string;
  allocatedAmount: string;
  committedAmount: string;
  actualAmount: string;
  availableAmount: string;
  budgetStatus: 'WithinBudget' | 'AtRisk' | 'OverBudget';
}

export interface ProjectStageFinancialBlock {
  estimatedBudget: string;
  approvedAdjustments: string;
  effectiveCap: string;
  /** decimal(19,4) — client milestone payment target (funding side). */
  requiredBudget: string;
  clientPaidAmount: string;
  /** decimal(19,4) — max(0, requiredBudget − clientPaidAmount). */
  fundingGap: string;
  allocatedAmount: string;
  committedAmount: string;
  actualAmount: string;
  availableAmount: string;
  tasksCount: number;
  overBudgetTasksCount: number;
}

export interface ProjectFinancialBlock {
  currency: string;
  estimatedBudget: string;
  approvedAdjustments: string;
  effectiveCap: string;
  allocatedAmount: string;
  committedAmount: string;
  actualAmount: string;
  availableAmount: string;
  clientPaidAmount: string;
  vendorPaidAmount: string;
  /** decimal — 0..100. */
  collectionPercent: string;
  /** decimal — 0..100. */
  costPercent: string;
  /** decimal — clientPaidAmount − vendorPaidAmount. */
  earnings: string;
}

/**
 * One budget row in the project budget-summary rollup — mirrors backend
 * `ProjectBudgetScopeRow` (Application/DTOs/Projects/ProjectResponse.cs). Money
 * fields are decimal STRINGS end-to-end (format only at `MoneyService`).
 */
export interface ProjectBudgetScopeRow {
  scopeType: string;
  scopeId: string;
  projectStageId: string | null;
  projectTaskId: string | null;
  estimatedBudget: string;
  approvedAdjustments: string;
  effectiveCap: string;
  allocatedSum: string;
  committedSum: string;
  actualSum: string;
  available: string;
}

/**
 * Project budget summary — header KPI source. Mirrors backend
 * `ProjectBudgetSummaryResponse`: a project-scope row plus per-stage and
 * per-task rows. Served by GET /api/projects/{id}/budget-summary.
 */
export interface ProjectBudgetSummaryResponse {
  project: ProjectBudgetScopeRow;
  stages: ProjectBudgetScopeRow[];
  tasks: ProjectBudgetScopeRow[];
}
