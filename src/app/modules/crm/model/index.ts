/**
 * CRM DTO interfaces — feature 004.
 *
 * Every shape here mirrors the validated backend working tree (see
 * `specs/004-crm-requirement-gathering/contracts/api-surface.md`). Field names,
 * nullability and enum types match the server exactly. Enums arrive as **bare
 * integers** on the wire — the solution has no `JsonStringEnumConverter`.
 *
 * Two approval fields are the documented exception (hand-serialized as strings);
 * they are normalized at the api boundary and never reach a store in wire form.
 */

import {
  ApprovalState,
  ApprovalDecision,
  ApprovalSubjectType,
  ApproverKind,
  ContactRole,
  FinishingPurpose,
  MeetingSlotStatus,
  MeetingStatus,
  MeetingType,
  PastExperience,
  ProjectSector,
  RequirementCategory,
  RequirementPeriodStatus,
  UnitCondition,
  UnitType,
} from './crm-enums';

// ---------------------------------------------------------------------------
// §2 — Space type: server data, NOT an enum.
//
// The backend `SpaceType` enum is deleted; only frozen migration artifacts
// remain. Mirroring it would re-introduce the coupling the 2026-07-12 amendment
// removed. `sortOrder` / `isActive` exist server-side but are not on the wire —
// the server filters and orders; the client renders the list as received.
// ---------------------------------------------------------------------------

export interface CrmSpaceType {
  id: string;
  /** Stable identity — safe to key on. Ids differ per environment; codes do not. */
  code: string;
  nameEn: string;
  nameAr: string;
}

// ---------------------------------------------------------------------------
// §2a — Catalog + spaces (feature 006). Split into their own model files (the
// `finance/` barrel-of-files precedent); re-exported here so consumers keep
// importing from `@core/models/crm`.
// ---------------------------------------------------------------------------

export * from './catalog.model';
export * from './space.model';

// §3 — Checklist templates were retired in feature 006. The catalog (§2a) replaced
// them: a Section/Field/Option is now just a node at some depth. See catalog.model.ts.

// ---------------------------------------------------------------------------
// §3a — Lead intake: qualification data captured at the lead stage.
//
// 1:1 with the lead, upserted separately (`PUT /api/crm/leads/{id}/intake`).
// Sector-aware: exactly zero or one detail block, matching `sector`. Only
// `residential` ships today — future sectors add their own optional block the same
// way. Enum fields carry their real enum types here (not bare `number`) because the
// shared validators and both intake forms switch on them.
// ---------------------------------------------------------------------------

/** Residential sector block (مدلول السكني) — present only when `sector === Residential`. */
export interface ResidentialIntakeRequest {
  unitType?: UnitType | null;
  unitCondition?: UnitCondition | null;
  isLicensed?: boolean | null;
  isRented?: boolean | null;
  finishingPurpose?: FinishingPurpose | null;
}

export interface LeadIntakeRequest {
  /** → `Client` on convert (fill-blanks). */
  jobTitle?: string | null;
  clientAddress?: string | null;
  /** `CrmLeadIntakeData.Sector` (`LeadContracts.cs:17`); the wire name is `sector` (009b #6). */
  sector?: ProjectSector | null;
  /** → brief head at period-open (copy-once). */
  unitAddress?: string | null;
  areaSqm?: number | null;
  usedDesignerBefore?: boolean | null;
  designerExperience?: PastExperience | null;
  designerExperienceReason?: string | null;
  residential?: ResidentialIntakeRequest | null;
}

/** Read back as-is — same shape as the request. */
export type LeadIntakeResponse = LeadIntakeRequest;

/**
 * `GET /api/crm/leads/status-counts` (`LeadContracts.cs:71`): one count per status under the
 * list's owner and search filters (009b #2). `total` is the sum.
 */
export interface CrmLeadStatusCounts {
  total: number;
  new: number;
  contacted: number;
  qualified: number;
  unqualified: number;
  converted: number;
}

/**
 * Anonymous public submission (`POST /api/crm/public/leads`) — creates the lead +
 * intake in one transaction. `website` is a HONEYPOT: always leave empty/hidden and
 * never render it as a real field.
 */
export interface PublicLeadSubmissionRequest {
  firstName: string;
  lastName: string;
  phone?: string | null;
  email?: string | null;
  website?: string | null;
  intake: LeadIntakeRequest;
}

// ---------------------------------------------------------------------------
// §4.1 — Brief head: editable 1:1, EXEMPT from the ledger rule.
//
// Editing returns the head to PendingApproval and does NOT advance the round.
// The round advances on SEND, never on edit. The head has no version history —
// `UpdateHead` overwrites in place, and the trail IS the approvals table.
//
// ⚠️ CORRECTED against `Application/DTOs/CrmBriefs/CrmBriefDtos.cs`'s real
// `BriefHeadResponse` on the backend working tree — the original sketch here was
// missing ~11 fields and had two renamed ones:
//   - `decisionMakerContactId` is NON-NULLABLE server-side (every brief has one
//     from creation), not `string | null`.
//   - `pastExperience` → `designerExperience` (renamed); `hiringReason` →
//     `hiringReasons` (plural — it is the `[Flags]` enum, bitwise, never `===`).
//   - `projectStageId` is nullable (`Guid?`), not required.
//   - Missing entirely: `unitsPerFloor`, `utilityMetersNote`,
//     `receivesFrequentVisitors`, `visitorsNote`, `parentsHobbies`,
//     `childrenHobbies`, `hobbiesInDesign`, `usedDesignerBefore`,
//     `designerExperienceReason`, `preferredStyle`, `preferredColors`.
// ---------------------------------------------------------------------------

export interface BriefHead {
  id: string;
  projectId: string;
  projectStageId: string | null;
  decisionMakerContactId: string;
  createdById: string;

  unitType: number;
  unitCondition: number;
  address: string | null;
  floorNo: number | null;
  unitsPerFloor: number | null;
  areaSqm: number | null;
  buildingKind: number | null;
  isLicensed: boolean | null;
  /** إيجار/ملك — seeded from the lead intake, then head-edited like any field. */
  isRented: boolean | null;
  /** الغرض من التشطيب — `FinishingPurpose`. Seeded from intake, then head-edited. */
  finishingPurpose: number | null;
  position: number | null;
  elevatorStatus: number | null;
  utilityMetersNote: string | null;
  receivesFrequentVisitors: boolean | null;
  visitorsNote: string | null;
  parentsHobbies: string | null;
  childrenHobbies: string | null;
  hobbiesInDesign: boolean | null;
  usedDesignerBefore: boolean | null;
  designerExperience: number | null;
  designerExperienceReason: string | null;
  /** `[Flags]` — bitwise AND, never `===`. Non-nullable, defaults to `HiringReason.None`. */
  hiringReasons: number;
  preferredStyle: string | null;
  preferredColors: string | null;
  furnitureStatus: number | null;
  expectedBudget: number | null;
  timelinePressure: number | null;
  architecturalRequests: string | null;
  otherNeeds: string | null;

  /** READ-ONLY — `ProjectSector`, stamped once at period-open seeding, never head-edited. */
  sector: number | null;
  status: ApprovalState;
  lastMeetingId: string | null;
  createdAtUtc: string;
}

/** `PUT /api/crm/projects/{projectId}/brief/head` body — `UpdateBriefHeadRequest`. */
export interface UpdateBriefHeadRequest {
  unitType: number;
  unitCondition: number;
  address?: string | null;
  floorNo?: number | null;
  unitsPerFloor?: number | null;
  areaSqm?: number | null;
  buildingKind?: number | null;
  isLicensed?: boolean | null;
  /** إيجار/ملك + الغرض من التشطيب — editable head fields (sector is NOT — it is seeded, read-only). */
  isRented?: boolean | null;
  finishingPurpose?: number | null;
  position?: number | null;
  elevatorStatus?: number | null;
  utilityMetersNote?: string | null;
  receivesFrequentVisitors?: boolean | null;
  visitorsNote?: string | null;
  parentsHobbies?: string | null;
  childrenHobbies?: string | null;
  hobbiesInDesign?: boolean | null;
  usedDesignerBefore?: boolean | null;
  designerExperience?: number | null;
  designerExperienceReason?: string | null;
  hiringReasons?: number;
  preferredStyle?: string | null;
  preferredColors?: string | null;
  furnitureStatus?: number | null;
  expectedBudget?: number | null;
  timelinePressure?: number | null;
  architecturalRequests?: string | null;
  otherNeeds?: string | null;
  lastMeetingId?: string | null;
}

/**
 * The real space an entry is written against, resolved for display (feature 006).
 * `null` on a general (project-wide) entry. Renaming a space is safe — the entry
 * references it by id.
 */
export interface BriefSpaceRef {
  id: string;
  name: string;
  spaceType: CrmSpaceType;
}

/**
 * §4.2 — Gathering entry (`BriefSpace`) — APPEND-ONLY. Since feature 006 an entry is a
 * thin wrapper: it references a real `space` (or is general, project-wide) and carries
 * free text. What was *learned* about the room lives on its board, not here.
 *
 * Approved = locked forever. A correction appends a superseding entry.
 */
export interface BriefSpace {
  id: string;
  briefId: string;
  /** The referenced space — `null` = a general, project-wide entry. */
  space: BriefSpaceRef | null;
  countOrPieces: number | null;
  /** The freeform body. */
  requirements: string | null;
  /** Optional source — never blocks the save. */
  meetingId: string | null;
  approvalStatus: ApprovalState;
  supersedesSpaceId: string | null;
  /** Entries anchor to a TASK. */
  projectTaskId: string | null;
  createdById: string;
  createdAtUtc: string;
}

/** The write shape for add / update / supersede — one shape for all three. */
export interface BriefSpaceRequest {
  /** The real space this entry is about; omit/null for a general (project-wide) entry. */
  spaceId?: string | null;
  countOrPieces?: number | null;
  requirements?: string | null;
  meetingId?: string | null;
  projectTaskId?: string | null;
}

/** `GET /api/crm/projects/{projectId}/brief` — the head AND every entry in one call. */
export interface BriefView {
  head: BriefHead;
  spaces: BriefSpace[];
}

// ---------------------------------------------------------------------------
// Per-round head diff (FR-029, Dependency 5) — raw facts, never prose.
// ---------------------------------------------------------------------------

export interface BriefHeadFieldChange {
  /** The exact PascalCase entity property name (`"UnitType"`) — a catalog key. */
  field: string;
  /** Raw facts as strings: enums are the bare integer as a string ("2"), not the name. */
  previousValue: string | null;
  currentValue: string | null;
}

export interface BriefHeadDiff {
  briefId: string;
  round: number;
  /** Round 1 has no prior snapshot → null, with empty `changes`. */
  previousRound: number | null;
  changes: BriefHeadFieldChange[];
}

// ---------------------------------------------------------------------------
// §4.3 — Requirement item: append-only, with the one trust-rule asymmetry.
//
// A CLIENT-authored item is Trusted on arrival — it lands at
// `ApprovalState.NotRequired` and renders with a green Trusted chip. It never
// shows Draft or Pending (FR-012).
//
// ⚠️ CORRECTED against `Application/DTOs/CrmItems/CrmItemDtos.cs` and
// `Domain/Entities/CrmRequirementItem.cs` on the backend working tree —
// data-model.md's §4.3 sketch does not match the real `RequirementItemResponse`:
// `room` is free text, not a `spaceTypeId` FK; `source` is a nullable `sourceType`
// with THREE possible reference FKs (`meetingId` / `briefId` / `noteId`), not one;
// items pin a `periodId`, not just a project; and there is no `authoredByClient`
// flag on the wire — author is `createdByEmployeeId` XOR `createdByContactId`, and
// `authoredByClient` is derived as `createdByContactId !== null` (see
// `isClientAuthoredItem()` in `crm-item.service.ts`).
// ---------------------------------------------------------------------------

export interface RequirementItem {
  id: string;
  projectId: string;
  periodId: string;
  category: number;
  /** Free text — NOT a `CrmSpaceType` FK (that abstraction does not exist here). */
  room: string | null;
  title: string;
  details: string | null;
  priority: number;
  /** `null` ⇒ a manual entry with no source reference. */
  sourceType: number | null;
  meetingId: string | null;
  briefId: string | null;
  noteId: string | null;
  approvalStatus: ApprovalState;
  supersedesItemId: string | null;
  /** Author is XOR — exactly one of these two is set. */
  createdByEmployeeId: string | null;
  createdByContactId: string | null;
  projectTaskId: string | null;
  createdAtUtc: string;
}

/**
 * `POST /api/crm/projects/{projectId}/requirement-items` body — `AddItemRequest`.
 * When `sourceType` is set, exactly the matching FK must be set too
 * (`ck_crm_requirement_items_source_matches`); when omitted, all three FKs must be
 * null. The manual add-item form (T043) only ever offers the `Meeting` source.
 */
export interface AddRequirementItemRequest {
  periodId: string;
  category: number;
  title: string;
  priority: number;
  room?: string | null;
  description?: string | null;
  sourceType?: number | null;
  meetingId?: string | null;
  briefId?: string | null;
  noteId?: string | null;
  projectTaskId?: string | null;
}

/**
 * `PUT /api/crm/requirement-items/{itemId}` AND `POST .../supersede` body —
 * `UpdateItemRequest`. ⚠️ No `periodId` — unlike add, update/supersede never move an
 * item to a different period.
 */
export interface UpdateRequirementItemRequest {
  category: number;
  title: string;
  priority: number;
  room?: string | null;
  description?: string | null;
  sourceType?: number | null;
  meetingId?: string | null;
  briefId?: string | null;
  noteId?: string | null;
  projectTaskId?: string | null;
}

/**
 * `POST /api/crm/portal/requirement-items` body — `ClientAddItemRequest`. No source
 * fields at all — a client-authored item never cites a meeting/brief/note (FR-012).
 */
export interface ClientAddRequirementItemRequest {
  projectId: string;
  periodId: string;
  category: number;
  title: string;
  priority: number;
  room?: string | null;
  description?: string | null;
}

// ---------------------------------------------------------------------------
// Approvals. The two hand-serialized string enums are normalized at the api
// boundary — these are the POST-normalization shapes.
// ---------------------------------------------------------------------------

export interface PendingApproval {
  id: string;
  subjectType: ApprovalSubjectType;
  subjectId: string;
  round: number;
  approverKind: ApproverKind;
  assignedContactId: string | null;
  requestedAtUtc: string;
  // Documented `PendingApprovalResponse` fields (office "mine" inbox) — used by the
  // dashboard "Needs attention" widget. Additive; older callers ignore them.
  projectId: string;
  projectName: string;
  ownerKind: string;
  ownerName: string;
  gateLabel: string | null;
  /** Render-only `@for` key — synthetic when the server omitted `id`. Never send it. */
  trackKey: string;
}

export interface ApprovalTrailItem {
  id: string;
  round: number;
  /** `null` ⇒ undecided. */
  decision: ApprovalDecision | null;
  comment: string | null;
  decidedAtUtc: string | null;
  decidedById: string | null;
}

/** Reject comment is mandatory; whitespace-only counts as empty; max 2000. */
export interface DecideApprovalRequest {
  decision: ApprovalDecision;
  comment: string | null;
}

/**
 * `GET /api/crm/portal/approvals` — mirrors `ClientApprovalTrailResponse`. **A
 * different, richer shape than `PendingApproval`** (the office pending-list row):
 * this one row IS the client's whole trail entry — pending or decided — carrying
 * its own project identity, so the inbox needs no second lookup to label a row.
 * `pendingOnly=false` (this app's default) returns the FULL trail, which is exactly
 * what FR-029's "a decision trail MUST show past decisions" needs — one call serves
 * both the action list and the history.
 */
export interface ClientApprovalTrailRow {
  id: string;
  subjectType: ApprovalSubjectType;
  subjectId: string;
  projectId: string;
  projectName: string;
  round: number;
  createdAtUtc: string;
  /** `null` ⇒ still pending. */
  decision: ApprovalDecision | null;
  decidedAtUtc: string | null;
  comment: string | null;
  responseDueAtUtc: string | null;
  /** Synthetic render key. Never a domain id — see `ApiService.trackKeyFor`. */
  trackKey: string;
}

// ---------------------------------------------------------------------------
// §5 — The crm block: FACTS, not prose.
//
// A stage or task is CRM iff this block is non-null (FR-005). Never re-derive
// CRM-ness from any other signal; never introduce a kind flag.
//
// The block is served on the DETAILS DTOs only — it is absent from
// `ProjectTaskResponse`, `ProjectStageListResponse` and `ProjectTaskListResponse`.
// No CRM affordance may be rendered from a list row.
// ---------------------------------------------------------------------------

// ---------------------------------------------------------------------------
// Meetings (US2/B2) — mirrors `CrmMeetingDtos.cs`. The server computes
// availability (office hours, DST-safe `Africa/Cairo`, minus busy windows) for
// `project.CreatedById` ONLY — there is no `employeeId` param anywhere in this
// domain. `productOwnerId` on the Angular `Project` model is that same value
// (`ProductOwnerId` is a read-model alias for `CreatedById`, confirmed against
// the backend working tree — never a distinct "product owner" concept).
// ---------------------------------------------------------------------------

/** A raw free UTC window — the server computes it; the client slices it into slots. */
export interface FreeSlot {
  startsAtUtc: string;
  endsAtUtc: string;
}

/** The write shape for one candidate time — used by propose, decline (counter) and reschedule. */
export interface SlotRequest {
  startsAtUtc: string;
  endsAtUtc: string;
}

export interface CrmMeetingSlot {
  id: string;
  meetingId: string;
  employeeId: string;
  startsAtUtc: string;
  endsAtUtc: string;
  status: MeetingSlotStatus;
  /** XOR-by-convention with `proposedByContactId` — whoever put this slot forward. */
  proposedByEmployeeId: string | null;
  proposedByContactId: string | null;
  /** Set while `status = Proposed` and the hold has not yet lapsed. */
  holdExpiresAtUtc: string | null;
}

export interface CrmMeeting {
  id: string;
  projectId: string;
  periodId: string | null;
  title: string;
  type: MeetingType;
  status: MeetingStatus;
  scheduledAtUtc: string | null;
  durationMinutes: number | null;
  location: string | null;
  /** XOR-by-convention with `requestedByContactId`. */
  requestedByEmployeeId: string | null;
  requestedByContactId: string | null;
  canceledAtUtc: string | null;
  cancelReason: string | null;
  createdAtUtc: string;
  slots: CrmMeetingSlot[];
}

/** `POST /api/crm/meetings/propose` body. `targetEmployeeId` is always `project.productOwnerId`. */
export interface ProposeMeetingRequest {
  projectId: string;
  periodId?: string | null;
  title: string;
  type: MeetingType;
  location?: string | null;
  durationMinutes?: number | null;
  targetEmployeeId: string;
  slots: SlotRequest[];
}

/** `PUT /meetings/slots/{slotId}/decline` body — an optional counter-proposal, never a reason. */
export interface DeclineSlotRequest {
  counterSlots?: SlotRequest[] | null;
}

/** `PUT /meetings/{id}/cancel` body — the ONLY meeting action that requires a reason. */
export interface CancelMeetingRequest {
  reason: string;
}

/**
 * `POST /api/crm/portal/meetings/request` body — the client requests ONE specific
 * slot directly (picked from the free-slot grid), not a proposal list. Lands the
 * meeting `Requested`, with one `Proposed` slot held under `holdExpiresAtUtc`.
 */
export interface RequestMeetingByClientRequest {
  projectId: string;
  periodId?: string | null;
  title: string;
  type: MeetingType;
  startsAtUtc: string;
  endsAtUtc: string;
  location?: string | null;
}

export interface CrmStageBlock {
  openPeriodId: string | null;
  periodStatus: RequirementPeriodStatus | null;
  closesAtUtc: string | null;
  briefId: string | null;
  briefStatus: ApprovalState | null;
  /** Note: 'space', not 'entry', on the STAGE block. */
  spaceTotal: number;
  spacePending: number;
  itemTotal: number;
  itemPending: number;
  meetingsUpcoming: number;
  unresolvedTotal: number;
}

export interface CrmTaskBlock {
  briefId: string | null;
  briefStatus: ApprovalState | null;
  /** Note: 'entry', not 'space', on the TASK block. */
  entryTotal: number;
  entryPending: number;
  itemTotal: number;
  itemPending: number;
  unresolvedTotal: number;
  meetingsUpcoming: number;
}

/**
 * `GET /api/crm/portal/profile` (`CrmClientPortalEndpoints.cs`, gated
 * `portal.profile.view_own`) — one combined read, mirroring the brief's "head AND every
 * entry in one call" shape:
 * the client's own identity (never `notes` — FR-016), organized contacts (the primary
 * badge, FR-021), and every project the caller can see, each carrying its own
 * currently-open period id so downstream screens never need a second lookup.
 */
export interface ClientProfile {
  client: ClientIdentity;
  contacts: ClientProfileContact[];
  projects: ClientProfileProject[];
}

/** Deliberately excludes `notes` — an office-authored field, never client-facing (FR-016). */
export interface ClientIdentity {
  id: string;
  firstName: string;
  lastName: string;
  phoneNumber: string | null;
  address: string | null;
}

/** Deliberately excludes `notes` — same FR-016 exclusion as `ClientIdentity`. */
export interface ClientProfileContact {
  id: string;
  firstName: string;
  lastName: string;
  email: string | null;
  phone: string | null;
  mobile: string | null;
  role: ContactRole;
  isPrimary: boolean;
}

export interface ClientProfileProject {
  id: string;
  code: string;
  name: string;
  status: string;
  productOwnerName: string | null;
  progressPercentage: number;
  /** `null` ⇒ no period currently open — add-requirement/schedule must not render. */
  openPeriodId: string | null;
}

// ---------------------------------------------------------------------------
// The designer profile (T120–T127, FR-018/FR-019/FR-030) — mirrors
// `ClientDesignProfileResponse`. **The server has already done the two things
// that make this surface safe**: it structurally excludes money (`BriefHeadBlock`
// carries no `ExpectedBudget` property at all; Budget-category items are filtered
// out server-side) and unconfirmed content (only an Approved head; only
// Approved, un-superseded spaces; only Approved/NotRequired, un-superseded
// items — verified against `GetClientDesignProfileQueryHandler`). The client
// MUST NOT re-derive either exclusion (T125/T126) — it renders exactly what
// arrives, read-only throughout.
// ---------------------------------------------------------------------------

export interface DesignProfileChild {
  gender: string;
  age: number;
}

/** No `notes` field exists here either — same FR-016 shape as `ClientIdentity`. */
export interface DesignProfileClient {
  clientId: string;
  fullName: string | null;
  jobTitle: string | null;
  maritalStatus: string | null;
  address: string | null;
  children: DesignProfileChild[];
}

export interface DesignProfilePrimaryContact {
  id: string;
  firstName: string;
  lastName: string;
  email: string | null;
  phone: string | null;
  mobile: string | null;
  role: ContactRole;
}

/**
 * The confirmed brief head, money-free. **Deliberately no `expectedBudget` field
 * — never add one**; the wire has none to normalize (FR-018). `null` overall ⇒
 * no head has been Approved yet (T124's empty-profile edge case).
 */
export interface DesignProfileBriefHead {
  id: string;
  unitType: number;
  unitCondition: number;
  address: string | null;
  floorNo: number | null;
  unitsPerFloor: number | null;
  areaSqm: number | null;
  buildingKind: number | null;
  isLicensed: boolean | null;
  position: number | null;
  elevatorStatus: number | null;
  utilityMetersNote: string | null;
  receivesFrequentVisitors: boolean | null;
  visitorsNote: string | null;
  parentsHobbies: string | null;
  childrenHobbies: string | null;
  hobbiesInDesign: boolean | null;
  usedDesignerBefore: boolean | null;
  designerExperience: number | null;
  designerExperienceReason: string | null;
  hiringReasons: number;
  preferredStyle: string | null;
  preferredColors: string | null;
  furnitureStatus: number | null;
  timelinePressure: number | null;
  architecturalRequests: string | null;
  otherNeeds: string | null;
  /** Sector-aware head fields (mirror the office head block); `sector` is read-only. */
  sector: number | null;
  isRented: boolean | null;
  finishingPurpose: number | null;
}

/** Already Approved, un-superseded — no `approvalStatus` field exists on the wire. */
export interface DesignProfileSpace {
  id: string;
  /** The referenced space — `null` = a general, project-wide entry (feature 006). */
  space: BriefSpaceRef | null;
  countOrPieces: number | null;
  requirements: string | null;
  meetingId: string | null;
  projectTaskId: string | null;
}

export interface DesignProfileItem {
  id: string;
  room: string | null;
  title: string;
  description: string | null;
  priority: number;
  approvalStatus: ApprovalState;
  projectTaskId: string | null;
}

export interface DesignProfileAttachment {
  linkId: string;
  documentId: string;
  fileName: string;
  contentType: string;
  fileSizeBytes: number;
  subjectKind: 'Brief' | 'BriefSpace' | 'RequirementItem' | 'Meeting';
  subjectId: string;
}

/**
 * `GET /api/crm/projects/{projectId}/design-profile` — permission
 * `crm.design_profile.read`. `itemsByCategory` arrives as a JSON OBJECT (a
 * serialized C# `Dictionary<RequirementCategory, ...>`), its keys bare-integer
 * STRINGS — normalized here into a `RequirementCategory`-keyed map, never left
 * as string keys for a component to re-parse.
 */
export interface ClientDesignProfile {
  projectId: string;
  client: DesignProfileClient;
  primaryContact: DesignProfilePrimaryContact | null;
  briefHead: DesignProfileBriefHead | null;
  spaces: DesignProfileSpace[];
  itemsByCategory: Partial<Record<RequirementCategory, DesignProfileItem[]>>;
  attachments: DesignProfileAttachment[];
}
