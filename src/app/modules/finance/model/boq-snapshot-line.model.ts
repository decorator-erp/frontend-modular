import type { BoqSnapshotLineKind } from './enums';

/**
 * BOQ snapshot line — per `api-docs/11-finance.md` Section 6.
 *
 * `kind` is INFERRED server-side:
 *   - `variationId` set     ⇒ `Difference`
 *   - else `invoiceLineId` set ⇒ `Purchase`
 *   - else                    ⇒ `BudgetItem`
 */
export interface BoqSnapshotLineResponse {
  id: string;
  description: string;
  /** decimal(19,4) — string, nullable. */
  quantity: string | null;
  unit: string | null;
  /** decimal(19,4) — string. */
  budgetedAmount: string;
  /** decimal(19,4) — string. */
  actualAmount: string;
  /** decimal(19,4) — string. */
  differenceAmount: string;
  projectTaskId: string | null;
  invoiceLineId: string | null;
  variationId: string | null;
  /** Doc says the API returns a string; the inferred kind set is closed. */
  kind: BoqSnapshotLineKind;
}
