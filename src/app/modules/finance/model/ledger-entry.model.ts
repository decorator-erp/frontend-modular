import type { LedgerDirection, LedgerEntryType, PaymentMethod } from './enums';

/**
 * Ledger entry — per `api-docs/11-finance.md` Section 3.
 *
 * The ledger is append-only. There is no update/delete; corrections go
 * through a reversal entry (`POST /ledger-entries/{id}/reverse`).
 *
 * `amount` is a decimal STRING. Use `MoneyService.signed` to render with a
 * direction-aware sign.
 */
export interface LedgerEntryResponse {
  id: string;
  projectId: string;
  projectStageId: string | null;
  projectTaskId: string | null;
  budgetLineId: string | null;
  direction: LedgerDirection;
  type: LedgerEntryType;
  /** decimal(19,4) — string. Always positive; `direction` carries the sign. */
  amount: string;
  method: PaymentMethod | null;
  clientId: string | null;
  vendorName: string | null;
  variationId: string | null;
  reversalOfId: string | null;
  /** True when some other entry reverses this one. */
  isReversed: boolean;
  /** ISO date (yyyy-MM-dd). */
  occurredOn: string;
  reference: string | null;
  note: string | null;
  recordedById: string;
}

export interface PostLedgerEntryRequest {
  projectId: string;
  /** decimal(19,4) — string. > 0. */
  amount: string;
  direction: LedgerDirection;
  type: LedgerEntryType;
  /** ISO date. */
  occurredOn: string;
  /** Required when `type === 'ClientPayment'`. */
  projectStageId?: string | null;
  projectTaskId?: string | null;
  /** Required when `type === 'Commitment' | 'ActualCost'`. */
  budgetLineId?: string | null;
  method?: PaymentMethod | null;
  /** Required when `type === 'ClientPayment'`. */
  clientId?: string | null;
  vendorName?: string | null;
  variationId?: string | null;
  /** External reference for idempotency. The client SHOULD set a UUID v4. */
  reference?: string | null;
  note?: string | null;
}

export interface ReverseLedgerEntryRequest {
  note?: string | null;
}

export interface AllocateLedgerEntryRequest {
  invoiceId: string;
  /** decimal(19,4) — string. > 0 and <= unallocated remainder. */
  amount: string;
}
