/**
 * The project's scope of work (نطاق العمل) — NEW-FEATURE-1, specs/sow-scope-of-work.md.
 * Mirrors `Projects.Contracts/Scope/ScopeOfWorkContracts.cs` and the request records of
 * `Projects.Infrastructure/Endpoints/ScopeOfWorkEndpoints.cs` (CRM-API-CONTRACT §2.16).
 */

/** `Projects.Contracts/Enums.cs:130`; serialized as an integer (C §1.7). */
export enum ScopeOfWorkStatus {
  Draft = 1,
  Confirmed = 2,
}

/** `ScopeOfWorkItemResponse`. `sourceTemplateName` is null once the template stage is deleted. */
export interface ScopeOfWorkItem {
  id: string;
  sourceStageId: string;
  sourceTemplateName: string | null;
  name: string;
  description: string | null;
  order: number;
  fee: number;
  /** Set by confirm. */
  createdStageId: string | null;
  /** The template stage this item was picked from is gone; confirm fails until it is removed. */
  sourceMissing: boolean;
}

/** `ScopeOfWorkResponse`. `id` is null while nothing is saved (an empty Draft). */
export interface ScopeOfWork {
  id: string | null;
  projectId: string;
  status: ScopeOfWorkStatus;
  durationDays: number | null;
  /** `DateOnly`, `YYYY-MM-DD`. */
  plannedStartDate: string | null;
  /** `DateOnly`, `YYYY-MM-DD`: start + duration, computed by the server. */
  estimatedEndDate: string | null;
  subtotal: number;
  adjustmentAmount: number;
  adjustmentNote: string | null;
  total: number;
  notes: string | null;
  confirmedAtUtc: string | null;
  /** HR employee id. */
  confirmedById: string | null;
  items: ScopeOfWorkItem[];
  canConfirm: boolean;
  /** The code of the first rule confirm would fail on (C §2.16), or null. */
  blockingReason: string | null;
}

/** #96 `PUT …/scope-of-work`: a full replace of the header, all five fields every time. */
export interface UpdateScopeOfWorkHeaderRequest {
  durationDays: number | null;
  plannedStartDate: string | null;
  adjustmentAmount: number;
  adjustmentNote: string | null;
  notes: string | null;
}

/** #100 `PUT …/items/{itemId}`: `description` must be re-sent or it is cleared (C §8.4.4). */
export interface UpdateScopeOfWorkItemRequest {
  name: string;
  description: string | null;
  fee: number;
}

/** #102 `POST …/confirm` → 200, the created stage ids in item order. */
export interface ConfirmScopeOfWorkResponse {
  createdStageIds: string[];
}

/** A stage template as a picker pill: `GET /api/stage-templates` carries no fee (008b audit). */
export interface SowTemplateOption {
  id: string;
  name: string;
}
