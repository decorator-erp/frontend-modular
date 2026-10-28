/**
 * Budget line — per `api-docs/11-finance.md` Section 2.
 *
 * Money fields (`allocatedAmount`, `committedAmount`, `actualAmount`,
 * `availableAmount`) are decimal STRINGS preserved end-to-end; format only at
 * the `MoneyService.format` boundary.
 */
export interface BudgetLineResponse {
  id: string;
  projectId: string;
  costCategoryId: string;
  costCategoryName: string;
  projectStageId: string | null;
  name: string;
  code: string | null;
  /** decimal(19,4) — string. */
  allocatedAmount: string;
  /** decimal(19,4) — string. Server-cached. */
  committedAmount: string;
  /** decimal(19,4) — string. Server-cached. */
  actualAmount: string;
  /** decimal(19,4) — string. = allocated − committed − actual. */
  availableAmount: string;
}

export interface CreateBudgetLineRequest {
  projectId: string;
  costCategoryId: string;
  name: string;
  code?: string;
  /** decimal(19,4) — string. >= 0. */
  allocatedAmount: string;
  projectStageId?: string | null;
}

export interface UpdateBudgetLineAllocationRequest {
  /** decimal(19,4) — string. >= 0. */
  allocatedAmount: string;
}
