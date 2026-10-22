// The notification slice of the old `core/models/enums.ts` at SOURCE_SHA (spec 005): lines 1–85,
// byte-for-byte. The CRM enums below it move with modules/crm at spec 009.
/**
 * Integer enums mirrored from the backend (`Domain.Enums`) — constitution Principle VII.
 * The wire sends integers; these are the single client-side source of truth. Do NOT use raw
 * enum-int literals elsewhere — reference these members.
 *
 * Values are EXACT and verified against the DMS backend source.
 */

/** Mirrors `Domain.Enums.NotificationEntityType`. The entity a notification points at. */
export enum NotificationEntityType {
  Meeting = 1,
  DesignBrief = 2,
  RequirementItem = 3,
  RequirementPeriod = 4,
  ProjectTask = 5,
  ProjectStage = 6,
  GateCondition = 7,
  Approval = 8,
  Variation = 9,
  Invoice = 10,
  Document = 11,
  Project = 12,
  // ── CRM (feature 004) ──
  BriefSpace = 13,
  Lead = 14,
}

/**
 * Mirrors `Domain.Enums.NotificationType`. Range-grouped by domain. The DTO also carries a
 * server-provided `typeName` string for display — branch on this enum for logic (icon/category),
 * render `typeName` for text. Only the fully-named members below are declared; the remaining
 * ranges are reserved on the backend and mirrored on demand (no invented names/values).
 */
export enum NotificationType {
  // ── Tasks: 100–108 ──
  TaskAssigned = 100,
  TaskStarted = 101,
  TaskApproved = 102,
  TaskRejected = 103,
  TaskCompleted = 104,
  TaskReopened = 105,
  TaskCancelled = 106,
  TaskDueSoon = 107,
  TaskOverdue = 108,

  // ── Stages / gates / approvals: 120–133 ──
  StageCompleted = 120,
  StageRejected = 121,
  StageDueSoon = 122,
  StageOverdue = 123,
  GateSatisfied = 124,
  GateRejected = 125,
  ApprovalRequested = 130,
  ApprovalApproved = 131,
  ApprovalRejected = 132,
  ApprovalResponseOverdue = 133,

  // ── Teams: 140–143 (reserved; mirror members on demand) ──

  // ── Financial: 150–163 ──
  LedgerEntryPosted = 150,
  BoqSnapshotGenerated = 163,
  // (151–162 reserved; mirror members on demand)

  // ── Docs / project: 180–183 (reserved; mirror members on demand) ──
  // ── Auth: 200–203 (reserved; mirror members on demand) ──

  // ── CRM: 500–529. Meetings 500–514; requirement periods 515–529 ──
  // NOTE: briefs have NO dedicated CRM notification type — they reuse the generic
  // ApprovalRequested/Approved/Rejected (130–132) above. Deep-linking must cover
  // both bands (FR-039).
  CrmMeetingRequested = 500,
  CrmMeetingProposed = 501,
  CrmMeetingScheduled = 502,
  CrmMeetingDeclined = 503,
  CrmMeetingRescheduled = 504,
  /** NOTE: single-L American spelling, mirrored verbatim from the backend. */
  CrmMeetingCanceled = 505,
  CrmMeetingReminder = 506,
  CrmMeetingNoShow = 507,
  CrmSlotHoldExpiring = 508,
  CrmPeriodOpened = 515,
  CrmPeriodExtended = 516,
  CrmPeriodClosed = 517,
}
