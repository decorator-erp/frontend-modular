/**
 * Project financial dashboard — a faithful 1:1 mirror of
 * `Application/DTOs/Finance/ProjectFinancialDashboardResponse.cs`, served BARE (no
 * `{ value }` envelope) by `GET /api/projects/{projectId:guid}/financial-dashboard`
 * (`API/Endpoints/FinanceEndpoints.cs`). Default camelCase serialization.
 *
 * WIRE TYPES vs THESE TYPES. Every money field on the wire is a C# `decimal`, so it
 * arrives as a JSON NUMBER. `MoneyService`'s arithmetic surface (`add`/`subtract`/
 * `parse`/`compare`/`percentOf`/`isNegative`/`signed`) accepts `string` ONLY. So
 * `ProjectFinancialDashboardService.normalize()` converts every decimal to a
 * canonical decimal string before it reaches this shape. Counts stay `number`.
 *
 * This interface set is DERIVATION-FREE by design: it mirrors the wire and nothing
 * else. Friendly rollups (open/paid/cancelled invoice counts, pending/applied
 * variation counts) are NOT sent by the server — they are computed in the consuming
 * component from `invoices.byStatus[]` / `variations.byKindAndStatus[]`. See
 * `ProjectFinancialDashboardComponent.invoiceRollup` / `.variationRollup`.
 *
 * Known-dead lookalike: `core/models/api.types.ts` declares a SECOND, also-fictional
 * `ProjectFinancialDashboardResponse` (and siblings) that nothing imports — do not
 * confuse it with this one, and do not "reconcile" the two.
 */
export interface ProjectFinancialDashboardResponse {
  projectId: string;
  /** Hardcoded `"EGP"` server-side today. */
  currency: string;
  budget: ProjectFinanceBudgetSummary;
  collection: ProjectFinanceCollectionSummary;
  earnings: ProjectFinanceEarningsSummary;
  budgetLines: ProjectFinanceBudgetLine[];
  invoices: ProjectFinanceInvoiceSummary;
  variations: ProjectFinanceVariationSummary;
  overBudgetTasks: ProjectFinanceOverBudgetTask[];
  /** `null` when the project has no BOQ snapshot yet (`BoqSummary?`). */
  boq: ProjectFinanceBoqSummary | null;
  /** Server-sized window; `?recentActivityCount=N`, N defaulting to 20. */
  recentActivity: ProjectFinanceLedgerRow[];
}

export interface ProjectFinanceBudgetSummary {
  /** decimal → string. */
  estimatedBudget: string;
  /** decimal → string. Σ approved variation uplift. */
  approvedAdjustments: string;
  /** decimal → string. estimatedBudget + approvedAdjustments. */
  effectiveCap: string;
  /** ALWAYS `null` on the wire today — the handler passes a literal `null`. Unrendered. */
  actualBudget: string | null;
  /** decimal → string. */
  totalAllocated: string;
  /** decimal → string. */
  totalCommitted: string;
  /** decimal → string. */
  totalActual: string;
  /** decimal → string. effectiveCap − committed − actual. */
  totalAvailable: string;
}

export interface ProjectFinanceStageFunding {
  stageId: string;
  name: string;
  /**
   * decimal → string. NOT a cost estimate: it is Σ CLIENT INVOICES issued for the
   * stage. The stage carries no `estimatedCost`/`actualCost` on this endpoint.
   */
  requiredBudget: string;
  /** decimal → string. Signed Σ of ClientPayment ledger entries for the stage. */
  clientPaidAmount: string;
  /** `invoiced > 0 && paid >= invoiced`. */
  isFunded: boolean;
}

export interface ProjectFinanceCollectionSummary {
  /** decimal → string. Σ ledger In/ClientPayment across the project. */
  totalClientPayments: string;
  /**
   * decimal → string. 0..100. Despite the name, this divides by `effectiveCap`,
   * not by `estimatedBudget`.
   */
  collectionPercentOfEstimatedBudget: string;
  stages: ProjectFinanceStageFunding[];
}

export interface ProjectFinanceEarningsSummary {
  /** decimal → string. Σ ledger Direction=In. Currently unrendered. */
  totalIn: string;
  /** decimal → string. Σ ledger Direction=Out. Currently unrendered. */
  totalOut: string;
  /** decimal → string. totalIn − totalOut. Currently unrendered. */
  net: string;
  /** decimal → string. net ÷ effectiveCap × 100. Currently unrendered. */
  marginPercent: string;
}

export interface ProjectFinanceBudgetLine {
  budgetLineId: string;
  /** Nullable — a budget line may have no cost category. */
  costCategoryId: string | null;
  /** Nullable. Group under an "Uncategorized" bucket when absent. */
  costCategoryName: string | null;
  budgetLineName: string;
  /** decimal → string. */
  allocated: string;
  /** decimal → string. Approved variation uplift on this line. */
  adjustment: string;
  /** decimal → string. */
  committed: string;
  /** decimal → string. */
  actual: string;
  /** decimal → string. allocated + adjustment − committed − actual. */
  available: string;
}

export interface ProjectFinanceInvoiceStatusBucket {
  /** `InvoiceStatus.ToString()` — `'Open' | 'Paid' | 'Cancelled'`. Kept wide. */
  status: string;
  count: number;
  /** decimal → string. Σ invoice total in the bucket. */
  total: string;
}

export interface ProjectFinanceInvoiceSummary {
  /** Σ of all bucket counts — includes Cancelled AND vendor invoices (not type-filtered). */
  totalCount: number;
  /** decimal → string. Σ (total − paid) over OPEN invoices only. */
  totalOutstanding: string;
  byStatus: ProjectFinanceInvoiceStatusBucket[];
}

export interface ProjectFinanceVariationBucket {
  /** `VariationKind.ToString()` — `'ClientDifference' | 'InternalChange'`. */
  kind: string;
  /** `VariationStatus.ToString()` — Draft|Submitted|Approved|Rejected|Cancelled|Applied. */
  status: string;
  count: number;
  /** decimal → string. Σ variation amount in the bucket. */
  total: string;
}

export interface ProjectFinanceVariationSummary {
  totalCount: number;
  /** decimal → string. Σ amount over ClientDifference variations, Approved OR Applied. */
  signedClientDifferenceTotal: string;
  byKindAndStatus: ProjectFinanceVariationBucket[];
}

export interface ProjectFinanceOverBudgetTask {
  taskId: string;
  name: string;
  /** decimal → string. The task's effective cap, not a raw allocation. */
  allocated: string;
  /** decimal → string. */
  actual: string;
  /** decimal → string. actual − allocated; always > 0. */
  overrun: string;
}

export interface ProjectFinanceBoqSummary {
  snapshotId: string;
  version: number;
  /** `DateTime` → ISO 8601 datetime string, no timezone offset (parses as local). */
  generatedAt: string;
  /** decimal → string. */
  budgetedTotal: string;
  /** decimal → string. */
  purchaseTotal: string;
  /** decimal → string. */
  differenceTotal: string;
  /** decimal → string. */
  actualTotal: string;
}

export interface ProjectFinanceLedgerRow {
  ledgerEntryId: string;
  /** `DateOnly` → `"yyyy-MM-dd"`. */
  occurredOn: string;
  /**
   * Mirrors `LedgerDirection` from `@shared/enums/finance`, inlined rather than
   * imported — `core` may not depend on `shared` (boundaries). Structurally
   * identical, so no cast is needed where the shared type is expected.
   */
  direction: 'In' | 'Out';
  /** Mirrors `LedgerEntryType` from `@shared/enums/finance` — see `direction`. */
  type: 'Commitment' | 'ActualCost' | 'ClientPayment';
  /** decimal → string. Always positive; `direction` carries the sign. */
  amount: string;
  clientId: string | null;
  vendorName: string | null;
  reference: string | null;
}
