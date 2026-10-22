/** Mirrors ApprovalRequestResponse (projects + clients approval queues). */
export interface ApprovalRequest {
  /**
   * Not just a track key — sent straight to `stageGates`/`taskGates.satisfy(...)` and
   * used to filter the pending list after a decision. Left exactly as `field(...) ?? ''`;
   * `trackKey` below is where the "never crash the list" hardening lives instead.
   */
  gateConditionId: string;
  ownerKind: string;
  ownerId: string;
  ownerName: string;
  projectId: string;
  projectName: string;
  projectStageId: string | null;
  stageName: string | null;
  approvalType: string;
  label: string;
  requestedAtUtc: string;
  /** Render-only `@for` key — synthetic when the server omitted `gateConditionId`. Never send it. */
  trackKey: string;
}
