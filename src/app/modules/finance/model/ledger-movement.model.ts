/**
 * Ledger movement — a read projection of the append-only ledger for the
 * financial-query drilldowns. Distinct from `LedgerEntryResponse` (the write
 * model): it denormalises `budgetLineName` and omits write-only fields.
 *
 * `amount` is a decimal STRING (always positive; `direction` carries the sign).
 * `type` / `direction` mirror the canonical `LedgerEntryType` / `LedgerDirection`
 * enums (`@shared/enums/finance`); inlined because `core` may not import
 * `shared` under the architecture boundary rule.
 */
export interface LedgerMovementResponse {
  id: string;
  /** ISO date (yyyy-MM-dd). */
  occurredOn: string;
  type: 'Commitment' | 'ActualCost' | 'ClientPayment';
  direction: 'In' | 'Out';
  /** decimal(19,4) — string. Always positive. */
  amount: string;
  projectId: string;
  projectStageId: string | null;
  projectTaskId: string | null;
  budgetLineId: string | null;
  budgetLineName: string | null;
  variationId: string | null;
  reversalOfId: string | null;
  vendorName: string | null;
  clientId: string | null;
  reference: string | null;
  note: string | null;
}

/** Skip/take paged envelope used by the financial-query API (cf. `PagedResult`). */
export interface PagedResponse<T> {
  items: T[];
  total: number;
  skip: number;
  take: number;
}
