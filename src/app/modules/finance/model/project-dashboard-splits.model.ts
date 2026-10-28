import type { ProjectFinancialBlock } from './financial-block.model';

/**
 * Project financial dashboard splits — the three drill endpoints under
 * `/projects/{id}/financial/{summary,by-category,cashflow}`. Money fields are
 * decimal STRINGS.
 */
export interface ProjectFinancialSummaryResponse {
  totals: ProjectFinancialBlock;
  stages: StageBudgetRow[];
}

export interface StageBudgetRow {
  projectStageId: string;
  name: string;
  order: number;
  estimatedBudget: string;
  approvedAdjustments: string;
  effectiveCap: string;
  allocatedAmount: string;
  committedAmount: string;
  actualAmount: string;
  availableAmount: string;
  requiredBudget: string;
  clientPaidAmount: string;
}

export interface CostCategoryRow {
  costCategoryId: string;
  categoryName: string;
  allocatedAmount: string;
  committedAmount: string;
  actualAmount: string;
}

export interface MonthlyCashRow {
  year: number;
  /** 1..12 */
  month: number;
  inflow: string;
  outflow: string;
}
