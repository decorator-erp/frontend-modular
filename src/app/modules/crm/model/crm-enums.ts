// The CRM slice of the old `core/models/enums.ts` at SOURCE_SHA (spec 009): lines 87–327,
// byte-for-byte. Lines 1–85 (the notification slice) went to modules/notifications at spec 005.
// ===========================================================================
// CRM — feature 004. Mirrored from the backend `Domain/Enums/*.cs` working tree.
//
// ⛔ `SpaceType` is deliberately NOT mirrored. The backend enum is DELETED (only
//    frozen migration artifacts remain); space types are server data served by
//    `GET /api/crm/space-types`. See `core/models/crm/index.ts` → `CrmSpaceType`.
// ===========================================================================

// ── Trust rule / approvals ────────────────────────────────────────────────

/** The trust-rule state machine. `Approved` = locked forever (FR-010). */
export enum ApprovalState {
  Draft = 1,
  PendingApproval = 2,
  Approved = 3,
  Rejected = 4,
  /** Client-authored artifacts land here — Trusted on arrival (FR-012). */
  NotRequired = 5,
}

/** Undecided is represented by a `null` decision, not by a member. */
export enum ApprovalDecision {
  Approved = 1,
  Rejected = 2,
}

export enum ApprovalSubjectType {
  GateCondition = 1,
  DesignBrief = 2,
  RequirementItem = 3,
  BriefSpace = 4,
}

export enum ApproverKind {
  Employee = 1,
  Client = 2,
}

// ── Catalog + spaces (feature 006 — replaced the retired checklist enums) ──
//
// The catalog is one global, unversioned, hierarchical tree. A `Section`/`Field`/
// `Option` from the retired checklist is now just a node at some depth — depth is
// unlimited. Mirrored from `Domain/Enums/*` (verified against the shipped backend
// contract `docs/crm-frontend/01-Models-and-Enums.md §1`).

/** Branch rule over a subtree. A selectable leaf is ALWAYS `None`. */
export enum CatalogSelectionMode {
  None = 1,
  Single = 2,
  Multi = 3,
}

/** Which value column an attribute writes into. Only `Select` carries options. */
export enum CatalogAttributeType {
  Text = 1,
  Number = 2,
  Boolean = 3,
  Date = 4,
  Select = 5,
}

/**
 * What happens to an item recorded in a space. `NotApplicable` still counts as
 * *recorded* — the space wasn't forgotten, the decision was "no".
 */
export enum CrmProvisionStatus {
  ToBuy = 1,
  ClientHas = 2,
  Reuse = 3,
  NotApplicable = 4,
}

// ── CRM domain ────────────────────────────────────────────────────────────

export enum ContactRole {
  Owner = 1,
  Spouse = 2,
  FamilyMember = 3,
  Representative = 4,
  Other = 5,
}

export enum LeadStatus {
  New = 1,
  Contacted = 2,
  Qualified = 3,
  Unqualified = 4,
  Converted = 5,
}

export enum LeadSource {
  Website = 1,
  Referral = 2,
  SocialMedia = 3,
  Phone = 4,
  Event = 5,
  Other = 6,
}

export enum RequirementPeriodStatus {
  Open = 1,
  Closed = 2,
}

export enum MeetingType {
  InOffice = 1,
  OnSite = 2,
  Online = 3,
}

export enum MeetingStatus {
  Requested = 1,
  Scheduled = 2,
  Rescheduled = 3,
  Completed = 4,
  /** Single-L, matching the backend. */
  Canceled = 5,
  NoShow = 6,
}

export enum MeetingSlotStatus {
  Proposed = 1,
  Accepted = 2,
  Declined = 3,
}

export enum RequirementCategory {
  SpaceLayout = 1,
  Style = 2,
  ColorPalette = 3,
  Materials = 4,
  Furniture = 5,
  Lighting = 6,
  /** Never reaches the designer surface — the server excludes it (FR-018). */
  Budget = 7,
  Timeline = 8,
  Technical = 9,
  Other = 10,
}

export enum RequirementSource {
  Meeting = 1,
  Brief = 2,
  Note = 3,
  ClientDirect = 4,
}

/**
 * Mirrors the backend's `TaskPriority` int enum (`Domain/Enums/TaskPriority.cs`), which
 * `CrmRequirementItem.Priority` reuses on the wire as a bare integer. **Not** the app's
 * existing `TaskPriority` (`project.model.ts`), a string union (`'Low' | 'Medium' | …`)
 * the project-task feature already serializes as strings — CRM has no such exception, so
 * a distinct numeric mirror is needed here (Principle VI/VII).
 */
export enum RequirementPriority {
  Low = 1,
  Medium = 2,
  High = 3,
  Urgent = 4,
}

// ── Brief-head vocabulary ─────────────────────────────────────────────────

export enum UnitType {
  Apartment = 1,
  Villa = 2,
  Duplex = 3,
  Studio = 4,
}

export enum UnitCondition {
  BareBrick = 1,
  SemiFinished = 2,
  Renovation = 3,
}

export enum BuildingKind {
  Tower = 1,
  Private = 2,
}

export enum UnitPosition {
  Corner = 1,
  Facade = 2,
}

export enum ElevatorStatus {
  Working = 1,
  NotWorking = 2,
  None = 3,
}

export enum PastExperience {
  Good = 1,
  Bad = 2,
}

/**
 * ⚠️ A `[Flags]` enum server-side — the ONLY bitwise enum in the CRM set. Values
 * combine (`ReliefFromCraftsmen | SaveMoneyAndTime` = 3), so a consumer must test
 * with a bitwise AND, never with `===`. The artifacts list it alongside the plain
 * enums; the backend `Domain/Enums/HiringReason.cs` carries `[Flags]`.
 */
export enum HiringReason {
  None = 0,
  ReliefFromCraftsmen = 1,
  SaveMoneyAndTime = 2,
  OrganizeAndComfort = 4,
}

export enum FurnitureStatus {
  AlreadyOwned = 1,
  BuyPerDesign = 2,
  Mixed = 3,
}

export enum TimelinePressure {
  Tight = 1,
  Normal = 2,
}

// ── Lead intake (qualification data captured at the lead stage) ────────────

/** The business sector of the project — drives which typed intake sub-form applies. */
export enum ProjectSector {
  Residential = 1,
  Medical = 2,
  Administrative = 3,
  FoodAndBeverage = 4,
  Retail = 5,
  MegaProject = 6,
}

/** الغرض من التشطيب — `TurnkeyDelivery` = تسليم على المفتاح (شامل الفرش وتركيب الأجهزة). */
export enum FinishingPurpose {
  UnitFinishingOnly = 1,
  TurnkeyDelivery = 2,
  FinishingWithKitchen = 3,
  Restoration = 4,
  Renovation = 5,
}
