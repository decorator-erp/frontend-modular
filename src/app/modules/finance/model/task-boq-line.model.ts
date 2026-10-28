/**
 * Task/stage BOQ-line drilldown — a denormalised projection that joins BOQ
 * snapshot header fields onto each line (distinct from `BoqSnapshotLineResponse`,
 * the write model). Money and quantity fields are decimal STRINGS.
 */
export interface TaskBoqLineResponse {
  boqSnapshotId: string;
  snapshotVersion: number;
  /** ISO datetime. */
  generatedAt: string;
  snapshotType: string;
  boqSnapshotLineId: string;
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
  variationId: string | null;
  invoiceLineId: string | null;
}
