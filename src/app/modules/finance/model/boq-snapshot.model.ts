import type { BoqSnapshotType } from './enums';
import type { BoqSnapshotLineResponse } from './boq-snapshot-line.model';

/**
 * BOQ snapshot — per `api-docs/11-finance.md` Section 6.
 *
 * A snapshot is the FROZEN Bill of Quantities at a milestone. The list-by-
 * project endpoint returns headers only (no `lines`); the detail endpoint
 * includes them.
 */
export interface BoqSnapshotResponse {
  id: string;
  projectId: string;
  projectStageId: string | null;
  type: BoqSnapshotType;
  /** Per-project version. */
  version: number;
  /** ISO datetime. */
  generatedAt: string;
  generatedById: string;
  /** decimal(19,4) — string. */
  budgetedTotal: string;
  /** decimal(19,4) — string. */
  purchaseTotal: string;
  /** decimal(19,4) — string. */
  differenceTotal: string;
  /** decimal(19,4) — string. */
  actualTotal: string;
  notes: string | null;
  /** Empty when the endpoint returns headers only (`/by-project`). */
  lines: BoqSnapshotLineResponse[];
}

export interface GenerateBoqSnapshotRequest {
  projectId: string;
  /** Null = project-level snapshot. */
  projectStageId?: string | null;
  type: BoqSnapshotType;
  notes?: string | null;
}

export type { BoqSnapshotLineResponse };
