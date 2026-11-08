import type { VariationKind, VariationStatus } from './enums';

/**
 * Variation — per `api-docs/11-finance.md` Section 5.
 *
 * Variations may be AUTO-RAISED by the system as `Draft` when budget is
 * exceeded; in that case the user only sets the `description` then submits.
 */
export interface VariationResponse {
  id: string;
  kind: VariationKind;
  projectId: string;
  projectTaskId: string | null;
  budgetLineId: string | null;
  reason: string;
  description: string | null;
  /** decimal(19,4) — string. The delta. > 0. */
  amount: string;
  /** decimal(19,4) — string. Set on `ClientDifference`. */
  budgetedAmount: string | null;
  /** decimal(19,4) — string. Set on `ClientDifference`. amount = chosen − budgeted. */
  chosenAmount: string | null;
  status: VariationStatus;
  requestedById: string;
  approvedById: string | null;
  /** ISO datetime. */
  approvedAt: string | null;
  /** ISO datetime. */
  sentToClientAt: string | null;
  signedByClientId: string | null;
  /** ISO datetime. */
  signedAt: string | null;
  signedDocumentPath: string | null;
  resolutionNote: string | null;
  /** Render-only `@for` key — synthetic when the server omitted `id`. Never send it. */
  trackKey: string;
}

export interface RaiseVariationRequest {
  projectId: string;
  kind: VariationKind;
  reason: string;
  description?: string | null;
  /** decimal(19,4) — string. > 0. */
  amount: string;
  /** Required when `kind === 'ClientDifference'`. */
  budgetedAmount?: string | null;
  /** Required when `kind === 'ClientDifference'`. */
  chosenAmount?: string | null;
  /** Required when `kind === 'ClientDifference'`. */
  projectTaskId?: string | null;
  /** Required when `kind === 'InternalChange'`. */
  budgetLineId?: string | null;
}

/**
 * `PUT /variations/{id}/description` — `UpdateVariationDescriptionRequest(string? Description)`
 * (VariationMessages.cs:35-36). Draft only (409 otherwise); empty or whitespace clears it.
 */
export interface SetVariationDescriptionRequest {
  description: string;
}

/**
 * `ApproveVariationRequest(Guid? SignedByClientId, string? SignedDocumentPath)` (VariationMessages.cs:27).
 * An InternalChange approves with neither (sending either is `SignatureFieldsNotAllowed`); a
 * ClientDifference's approval IS the client signing — see {@link SignVariationRequest}.
 */
export interface ApproveVariationRequest {
  signedByClientId?: string | null;
  signedDocumentPath?: string | null;
}

export interface RejectVariationRequest {
  note?: string | null;
}

/**
 * `SignVariationRequest(Guid SignedByClientId, string SignedDocumentPath)` (VariationMessages.cs:29) —
 * both required. Valid while a ClientDifference is `Submitted` (Variation.cs Approve).
 */
export interface SignVariationRequest {
  signedByClientId: string;
  signedDocumentPath: string;
}
