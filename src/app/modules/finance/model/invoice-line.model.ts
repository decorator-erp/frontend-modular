/**
 * Invoice line — per `api-docs/11-finance.md` Section 4.
 *
 * `quantity`, `unitPrice`, and `lineTotal` are decimal STRINGS.
 */
export interface InvoiceLineResponse {
  id: string;
  description: string;
  unit: string | null;
  /** decimal(19,4) — string. */
  quantity: string;
  /** decimal(19,4) — string. */
  unitPrice: string;
  /** decimal(19,4) — string. = quantity × unitPrice. */
  lineTotal: string;
  projectTaskId: string | null;
  budgetLineId: string | null;
}

export interface InvoiceLineRequest {
  description: string;
  unit?: string | null;
  /** decimal(19,4) — string. > 0. */
  quantity: string;
  /** decimal(19,4) — string. >= 0. */
  unitPrice: string;
  projectTaskId?: string | null;
  budgetLineId?: string | null;
}
