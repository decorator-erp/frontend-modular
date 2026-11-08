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

import type { SpaceSelection } from './space.model';
import {
  ApprovalState,
  ApprovalDecision,
  ApprovalSubjectType,
  ContactRole,
  FinishingPurpose,
  MeetingSlotStatus,
  MeetingStatus,
  MeetingType,
  PastExperience,
  ProjectSector,
  RequirementPeriodStatus,
  UnitCondition,
  UnitType,
} from './crm-enums';

// ---------------------------------------------------------------------------
// §2 — Space type: server data, NOT an enum.
//
// The backend `SpaceType` enum is deleted; only frozen migration artifacts
// remain. Mirroring it would re-introduce the coupling the 2026-07-12 amendment
// removed. `CrmSpaceTypeResponse` (`SpaceContracts.cs:5-6`) carries `sortOrder` and
// `isActive`: the server orders by `sortOrder` but returns inactive types too, so
// pickers for new rows filter `isActive` themselves (009b #27).
// ---------------------------------------------------------------------------

export interface CrmSpaceType {
  id: string;
  /** Stable identity — safe to key on. Ids differ per environment; codes do not. */
  code: string;
  nameEn: string;
  nameAr: string;
  /**
   * Set by the `/crm/space-types` lookup; absent on the `spaceType` refs embedded in other
   * responses, which never carry them.
   */
  sortOrder?: number;
  /** An item create/update rejects an inactive type (400 `crm.items.UnknownSpaceType`). */
  isActive?: boolean;
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
 * The convert picker's slice of `ClientListItemResponse` (`ClientContracts.cs:85-87`), read by
 * the CRM-side `CrmLeadService.searchClients` (009b #31, D-c). `displayName`/`email` come from
 * the portal login and may be absent.
 */
export interface CrmClientOption {
  id: string;
  displayName: string | null;
  email: string | null;
}

/**
 * `GET /api/clients/{id}` → `ClientResponse` (`ClientContracts.cs:12-21`), read by the CRM-side
 * `CrmClientService.getClient` for the client hub (009b #30, D-b). It carries **no name, email
 * or phone**: the hub's display name comes from the primary contact.
 */
export interface CrmClient {
  id: string;
  appUserId: string;
  address: string;
  notes: string | null;
  jobTitle: string | null;
  maritalStatus: string | null;
  representativeName: string | null;
  children: CrmClientChild[];
  isActive: boolean;
}

/** `ClientChildResponse(Id, Gender, Age)`; `gender` is a one-character string. */
export interface CrmClientChild {
  id: string;
  gender: string;
  age: number;
}

/**
 * Anonymous public submission (`POST /api/crm/public/leads`) — creates the lead only.
 * `PublicLeadRequest(FirstName, LastName, Email?, Phone?, Notes?)` (`CrmPublicEndpoints.cs:80`):
 * no intake and no honeypot are bound (009b #8, D-a).
 */
export interface PublicLeadSubmissionRequest {
  firstName: string;
  lastName: string;
  email: string | null;
  phone: string | null;
  notes: string | null;
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

/**
 * `CrmDesignBriefResponse` (`BriefContracts.cs:38-40`) flattened: its `id`/`projectId`/`projectStageId`/
 * `createdById`/`lastMeetingId`/`status` with the nested `head: CrmBriefHeadData` fields (009b #9). The
 * response has no `createdAtUtc`, no `decisionMakerContactId`, and the head no `utilityMetersNote`,
 * `parentsHobbies`, `childrenHobbies` or `hobbiesInDesign`.
 */
export interface BriefHead {
  id: string;
  projectId: string;
  projectStageId: string | null;
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
  receivesFrequentVisitors: boolean | null;
  visitorsNote: string | null;
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
}

/**
 * `PUT /api/crm/briefs/{briefId}/head` body (009b #12): a **full replace** of `data`, except that an
 * omitted `sector` (and `lastMeetingId`) keeps its stored value. Editing an Approved/Rejected head
 * returns it to Draft; a PendingApproval head is locked (409 `crm.briefs.HeadLockedPendingApproval`).
 */
export interface UpdateBriefHeadRequest {
  data: BriefHeadData;
  lastMeetingId?: string | null;
}

/**
 * `CrmBriefHeadData` (`BriefContracts.cs:10-36`) — every editable head field in one carrier. On
 * create, `unitType`/`unitCondition` may be `0` only when the client's converted lead intake can seed
 * them (else 400 `crm.briefs.UnitDetailsRequired`); an omitted `sector` is seeded too.
 */
export interface BriefHeadData {
  unitType: number;
  unitCondition: number;
  address?: string | null;
  floorNo?: number | null;
  unitsPerFloor?: number | null;
  areaSqm?: number | null;
  buildingKind?: number | null;
  isLicensed?: boolean | null;
  position?: number | null;
  elevatorStatus?: number | null;
  receivesFrequentVisitors?: boolean | null;
  visitorsNote?: string | null;
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
  isRented?: boolean | null;
  finishingPurpose?: number | null;
  sector?: number | null;
}

/** `POST /api/crm/projects/{projectId}/brief` body (009b #10) — one brief per stage. */
export interface CreateBriefRequest {
  data: BriefHeadData;
  projectStageId: string;
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
  /** The wire `spaceId` (009b #11) — `null` = a general, project-wide entry. */
  spaceId: string | null;
  /** The referenced space, resolved for display from the project's spaces — `null` = general. */
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
  /** `false` once another entry supersedes this one (C §8.2.10). No `createdAtUtc`: order is the server's, newest first. */
  isCurrent: boolean;
  /**
   * crmp C-6: the space's storefront picks as FROZEN at this entry's last send (#38), read-only
   * (`CrmBriefSpaceResponse.Selections`, `BriefContracts.cs:46-50`; portal
   * `PortalBriefSpaceResponse.Selections`, `PortalContracts.cs:53-56`). `[]` for an entry never
   * sent or with no space. On the portal each pick's `notes` is `null` (FINDING-F-9).
   */
  selections: SpaceSelection[];
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

/**
 * The portal head (`BriefHeadBlock`, `PortalContracts.cs:20-28`, 009b #43): the latest **sent** snapshot
 * plus the brief's live status. `id` is the wire `briefId`; `round` is the sent round. The block has no
 * `expectedBudget`, `lastMeetingId` or `createdById`, so those read `null` / `''`.
 */
export interface PortalBriefHead extends BriefHead {
  round: number;
}

/**
 * `GET /api/crm/portal/projects/{projectId}/brief[?stageId]` → `PortalBriefViewResponse`
 * (`PortalContracts.cs:48-54`, 009b #43). `head` is `null` until the head is first sent; `spaces` holds
 * no Drafts and carries no meeting, task or author link.
 */
export interface PortalBriefView {
  head: PortalBriefHead | null;
  spaces: BriefSpace[];
}

/**
 * `CrmBriefRoundResponse` (`BriefContracts.cs:149`, 009b #14): one sent round of the head, in round
 * order, Voided rounds included. `outcome` is `CrmBriefRoundOutcome` (1 Pending, 2 Approved,
 * 3 ChangesRequested, 4 Voided, 5 Unknown).
 */
export interface BriefRound {
  round: number;
  sentAtUtc: string;
  outcome: number;
  decidedAtUtc: string | null;
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
  /** The item's `CrmSpaceType`, when set (009b #23); `room` stays free text beside it. */
  spaceTypeId: string | null;
  /** Free text. */
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
  /** No `createdAtUtc` (009b #23): the server order is newest first. */
  projectTaskId: string | null;
}

/**
 * `POST /api/crm/periods/{periodId}/items` body — `CreateItemRequest` (009b #22): the period is
 * the path, the project is in the body. When `sourceType` is set, exactly the matching FK must be
 * set too (`crm.items.InvalidSource`); when omitted, all three FKs must be null. The manual
 * add-item form (T043) only ever offers the `Meeting` source.
 */
export interface AddRequirementItemRequest {
  projectId: string;
  category: number;
  title: string;
  priority: number;
  /** An active `CrmSpaceType` id (`crm.items.UnknownSpaceType` otherwise). */
  spaceTypeId?: string | null;
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
 * item to a different period. Both bind every field positionally, so an omitted `spaceTypeId`
 * CLEARS the item's space type: callers carry the item's own value (009b #24, FINDING-4-5).
 */
export interface UpdateRequirementItemRequest {
  category: number;
  title: string;
  priority: number;
  spaceTypeId?: string | null;
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

/**
 * `PendingApprovalResponse` (`Approvals.Contracts/Approvals/ApprovalContracts.cs:20-22`, 009b #41).
 * The wire carries no project, owner or gate label; screens render those as "not available".
 */
export interface PendingApproval {
  id: string;
  subjectType: ApprovalSubjectType;
  subjectId: string;
  /** `ApprovalType` on the wire: 1 = ManagerApproval, 2 = ClientReview. */
  type: number;
  round: number;
  dueAtUtc: string | null;
  /** Render-only `@for` key — synthetic when the server omitted `id`. Never send it. */
  trackKey: string;
}

/** `PortalApprovalSubjectType` / `PortalApprovalDecision` share the Approvals ordinals. */
export type PortalApprovalStatus = 'pending' | 'decided';

/**
 * The two decisions the portal accepts (`PortalContracts.cs:78-83`): Rejected (2) is only ever
 * READ on a decided row, and is a 400 `crm.portal.InvalidDecision` when sent.
 */
export type PortalApprovalDecision = ApprovalDecision.Approved | ApprovalDecision.ChangesRequested;

/** The changes-request comment cap, enforced server-side (`approvals.CommentTooLong`, 400). */
export const PORTAL_APPROVAL_COMMENT_MAX = 2000;

/**
 * crm-prod B1-fe: one row of the client's approvals inbox — `PortalApprovalResponse`
 * (`Crm.Contracts/Portal/PortalContracts.cs:114-117`), served by
 * `GET /api/crm/portal/approvals?status=pending|decided`. Portal-only: no employee ids.
 * A brief-round row has `briefId === subjectId` and `title === null`; an entry row carries
 * its brief in `briefId` and the space name in `title` (null for a general entry).
 */
export interface PortalApproval {
  id: string;
  subjectType: ApprovalSubjectType;
  subjectId: string;
  projectId: string;
  projectName: string;
  briefId: string | null;
  stageId: string | null;
  stageName: string | null;
  /** The brief round, or the send the entry/item went out under; null when it can't be told. */
  round: number | null;
  title: string | null;
  requestedAtUtc: string;
  dueAtUtc: string | null;
  /** `null` ⇒ still pending. */
  decision: ApprovalDecision | null;
  decidedAtUtc: string | null;
  /** The client's own comment; null when there was none. */
  comment: string | null;
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

/** `CrmMeetingSlotResponse` — no employee id and no hold timestamp (009b #19). */
export interface CrmMeetingSlot {
  id: string;
  meetingId: string;
  startsAtUtc: string;
  endsAtUtc: string;
  status: MeetingSlotStatus;
  /** XOR-by-convention with `proposedByContactId` — whoever put this slot forward. */
  proposedByEmployeeId: string | null;
  proposedByContactId: string | null;
  /**
   * Portal reads only (`PortalMeetingSlotResponse.ProposedByMe`, 009b #44): whether the client's side
   * proposed the slot. The portal carries no proposer ids, so they read `null` there; absent on office reads.
   */
  proposedByMe?: boolean;
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

/**
 * `PortalMeetingResponse` (`PortalContracts.cs:13-14`, 009b #44): one row of the client's paged
 * `GET /api/crm/portal/meetings` — no type and no slots; `portalGetById` reads those.
 */
export interface PortalMeeting {
  id: string;
  projectId: string;
  title: string;
  status: MeetingStatus;
  scheduledAtUtc: string | null;
}

/** `PortalMeetingSlotResponse` (`PortalContracts.cs:40-41`): no proposer ids, only `proposedByMe`. */
export interface PortalMeetingSlot {
  id: string;
  startsAtUtc: string;
  endsAtUtc: string;
  status: MeetingSlotStatus;
  proposedByMe: boolean;
}

/** `PortalMeetingDetailResponse` (`PortalContracts.cs:35-38`, 009b #44): `GET /api/crm/portal/meetings/{id}`. */
export interface PortalMeetingDetail extends PortalMeeting {
  type: MeetingType;
  durationMinutes: number | null;
  location: string | null;
  canceledAtUtc: string | null;
  cancelReason: string | null;
  slots: PortalMeetingSlot[];
}

/**
 * `POST /api/crm/meetings/propose` body — `ProposeMeetingRequest(ProjectId, Title, Type, Slots, PeriodId?,
 * Location?, DurationMinutes?)`. The proposer is the caller's token (009b #20: no `targetEmployeeId`).
 */
export interface ProposeMeetingRequest {
  projectId: string;
  periodId?: string | null;
  title: string;
  type: MeetingType;
  location?: string | null;
  durationMinutes?: number | null;
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
 * meeting `Requested`, with one `Proposed` slot, acceptable until it starts (009b #19).
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
 * `GET /api/crm/portal/profile` (`CrmPortalEndpoints.cs:53`, gated `crm.portal`;
 * `PortalProfileResponse`, `PortalContracts.cs:146-160`) — one combined read, mirroring the brief's "head AND every
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
  /** The primary contact's full name (or the login's display name). */
  name: string;
  firstName: string;
  lastName: string;
  /** The portal login's email. */
  email: string | null;
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
  /** A `ProjectStatus` NAME (`Draft` … `Cancelled`), not an int (`PortalContracts.cs:158`). */
  status: string;
  progressPercentage: number;
  activeStageId: string | null;
  activeStageName: string | null;
  /** `null` ⇒ no period currently open — add-requirement/schedule must not render. */
  openPeriodId: string | null;
}

// ---------------------------------------------------------------------------
// The designer profile (T120–T127, FR-030) — mirrors `ClientDesignProfileResponse`
// (`DesignProfileContracts.cs:8-10`, 009b #17): the latest brief's design preferences only.
// The server excludes money (`ExpectedBudget` is never on it). Client metadata, the primary
// contact, the rest of the head, spaces, items and attachments are no longer served.
// ---------------------------------------------------------------------------

/** `GET /api/crm/projects/{projectId}/design-profile` — 404 `crm.briefs.NotFound` when there is no brief. */
export interface ClientDesignProfile {
  projectId: string;
  preferredStyle: string | null;
  preferredColors: string | null;
  furnitureStatus: number | null;
  /** `[Flags]` — bitwise AND, never `===`. */
  hiringReasons: number;
  architecturalRequests: string | null;
  otherNeeds: string | null;
}

// ---------------------------------------------------------------------------
// crmp C-7 — artifact links (contract §2.12, `Crm.Contracts/Artifacts/ArtifactContracts.cs:5-7`).
// ---------------------------------------------------------------------------

/** The subject segment of the by-subject lists #70–#73 (`CrmArtifactEndpoints.cs:65,79,93,108`). */
export type CrmArtifactSubject = 'brief' | 'space' | 'requirement-item' | 'meeting';

/** `CrmArtifactDocumentResponse`: one document linked to one subject. `id` is the LINK id (#120). */
export interface CrmArtifactLink {
  id: string;
  documentId: string;
  briefId: string | null;
  spaceId: string | null;
  requirementItemId: string | null;
  meetingId: string | null;
  /** The HR employee who linked it — the only non-manager who may unlink it (#120). */
  addedByEmployeeId: string | null;
  addedByContactId: string | null;
}
