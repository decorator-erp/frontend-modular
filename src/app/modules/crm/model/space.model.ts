/**
 * Spaces + board DTOs — feature 006. A project's registry of real rooms, and the
 * per-space board of catalog items recorded in each (a catalog node + a provisioning
 * status). Mirrors `docs/crm-frontend/01-Models-and-Enums.md §10a`, verified against
 * `Application/DTOs/CrmSpaces/*`. Enums are bare integers; all `Guid` → `string`.
 */

import type { CatalogAttributeType, CrmProvisionStatus } from './crm-enums';
import type { CrmSpaceType } from '.';

// ── Spaces ─────────────────────────────────────────────────────────────────

export interface CrmSpace {
  id: string;
  projectId: string;
  spaceType: CrmSpaceType;
  /** "Kids room 1" — single-language by design, user-authored. */
  name: string;
  sortOrder: number;
  isActive: boolean;
  /**
   * Free prose, office-only, single-language like `name` (F6b). `null` when never written;
   * blank never round-trips — the backend trims and normalizes whitespace-only to `null`.
   * Never served to the client shell.
   */
  description: string | null;
}

export interface CreateSpaceRequest {
  spaceTypeId: string;
  name: string;
  sortOrder?: number;
  description?: string | null;
}

/**
 * `PUT /spaces/{id}` is a FULL replacement — `CrmSpace.Update` assigns `Description`
 * unconditionally, with no "omitted means leave alone" branch. Omitting this field on a
 * rename/retype silently WIPES the description. Always send the space's current
 * description alongside a rename, never just the changed field.
 */
export interface UpdateSpaceRequest {
  spaceTypeId: string;
  name: string;
  description?: string | null;
}

// ── Board items ────────────────────────────────────────────────────────────

/** Root-to-leaf, so the UI can group without walking the tree. */
export interface CatalogBreadcrumb {
  id: string;
  code: string;
  nameEn: string;
  nameAr: string;
}

/**
 * A recorded row on a space board. Either a **catalog** row pointing at a real
 * `CatalogItem`, or a **custom** row someone typed because the catalog had nothing that
 * fit. Exactly one of those, never both and never neither.
 *
 * On a custom row the backend sets `nodeNameEn` **and** `nodeNameAr` to the same
 * `customName` — it is one untranslated string the user typed, not a translated pair.
 * Render it from `customName` with `dir="auto"`; it is user data in an unknown language.
 */
export interface SpaceItem {
  id: string;
  spaceId: string;
  /** The catalog item, or `null` on a custom row. */
  catalogItemId: string | null;
  nodeNameEn: string;
  nodeNameAr: string;
  /** Always `null` on a custom row. */
  imageUri: string | null;
  /** Always `true` on a custom row. */
  isPurchasable: boolean;
  /**
   * Root-to-leaf. A catalog row's chain ends with the ITEM; a custom row's ends with its
   * CATEGORY, because a custom row sits at its category rather than under an item. So
   * the last crumb is only the item id on catalog rows — do not assume it either way.
   */
  path: CatalogBreadcrumb[];
  status: CrmProvisionStatus;
  note: string | null;
  /** Set when synced from an approved brief entry. Custom rows never have one. */
  sourceBriefSpaceId: string | null;
  attributes: SpaceItemAttributeValue[];
  isCustom: boolean;
  /** The typed name. Non-null iff `isCustom`. */
  customName: string | null;
  /** The category the typed row was filed under. Non-null iff `isCustom`. */
  customCategoryId: string | null;
  /** Synthetic render key. Never a domain id — see `ApiService.trackKeyFor`. */
  trackKey: string;
}

export interface SpaceItemAttributeValue {
  attributeId: string;
  code: string;
  nameEn: string;
  nameAr: string;
  dataType: CatalogAttributeType;
  unit: string | null;
  valueText: string | null;
  valueNumber: number | null;
  valueBool: boolean | null;
  /** ISO date, no time-of-day. */
  valueDate: string | null;
  optionId: string | null;
  optionNameEn: string | null;
  optionNameAr: string | null;
}

interface AddSpaceItemRequestBase {
  status?: CrmProvisionStatus;
  note?: string | null;
  sourceBriefSpaceId?: string | null;
}

/**
 * Record a real catalog item.
 *
 * `catalogNodeId` is the wire field name inherited from the v1 node tree — the split
 * (feature 006) never renamed it, and backend Phase 8 (`DropCatalogV1`) made that
 * permanent: the v1 tables are gone, but the field name is not going anywhere. It means
 * "catalog item id" despite `CatalogNode` itself having retired from the frontend in Run
 * B's F7 — that is the current contract, not a migration in progress.
 */
export interface AddCatalogSpaceItemRequest extends AddSpaceItemRequestBase {
  catalogNodeId: string;
  customName?: never;
  customCategoryId?: never;
}

/**
 * Record a row the catalog does not have. Both fields are required together — a name
 * with no category, or a category with no name, is a 400.
 */
export interface AddCustomSpaceItemRequest extends AddSpaceItemRequestBase {
  customName: string;
  customCategoryId: string;
  catalogNodeId?: never;
}

/**
 * Either a catalog item **or** a custom entry, never both and never neither — the
 * backend validates it as an exclusive-or and rejects a malformed body with a
 * FluentValidation field message that carries **no domain `code`**.
 *
 * Modelled as a union rather than one interface of optionals on purpose: the wire's
 * `catalogNodeId` is a non-nullable `Guid`, so a custom add must OMIT the property
 * entirely. Sending `catalogNodeId: null` is a `System.Text.Json` throw — a bare 400
 * with nothing to map. The `?: never` members make that shape unrepresentable here.
 */
export type AddSpaceItemRequest = AddCatalogSpaceItemRequest | AddCustomSpaceItemRequest;

/** Promote a custom row onto a real catalog item. Permission: `crm.catalog.manage`. */
export interface PromoteCustomSpaceItemRequest {
  catalogItemId: string;
}

export interface SetSpaceItemStatusRequest {
  status: CrmProvisionStatus;
  note?: string | null;
}

/** Exactly one value member per entry, matching the attribute's `dataType`. */
export interface SpaceItemAttributeValueRequest {
  attributeId: string;
  valueText?: string | null;
  valueNumber?: number | null;
  valueBool?: boolean | null;
  valueDate?: string | null;
  optionId?: string | null;
}

/** Replace-all for one item — anything omitted is CLEARED. */
export interface SetSpaceItemAttributeValuesRequest {
  values: SpaceItemAttributeValueRequest[];
}

// ── Completeness (all three assertions at once) ─────────────────────────────

export interface SpaceMissingBranch {
  branchId: string;
  code: string;
  nameEn: string;
  nameAr: string;
}

export interface SpaceSingleViolation {
  branchId: string;
  nameEn: string;
  nameAr: string;
  recordedCount: number;
}

export interface SpaceMissingAttribute {
  spaceItemId: string;
  attributeId: string;
  code: string;
  nameEn: string;
  nameAr: string;
}

export interface SpaceCompleteness {
  spaceId: string;
  isComplete: boolean;
  missingRequiredBranches: SpaceMissingBranch[];
  singleViolations: SpaceSingleViolation[];
  missingRequiredAttributes: SpaceMissingAttribute[];
}

// ── Provisioning (the buy list) ─────────────────────────────────────────────

/**
 * One buy-list line: the same thing recorded across N spaces, collapsed.
 *
 * Custom rows are **not groupable** — two typed strings are never the same thing, even
 * spelled identically — so each arrives as its own group with `occurrences: 1` and a
 * null `nodeId`.
 */
export interface ProvisionGroup {
  /** `null` on a custom row: there is no catalog item to group by. */
  nodeId: string | null;
  /**
   * The space-item row this line IS. Non-null **iff** `isCustom`.
   *
   * A catalog line is a group over many board rows, so no single row id describes it — its
   * identity is (item, status), and this is null. A custom line is exactly one board row and
   * carries that row's id. It is the only stable identity a custom line has: two entries typed
   * with the same text under one category are indistinguishable by every other member here.
   */
  spaceItemId: string | null;
  nameEn: string;
  nameAr: string;
  imageUri: string | null;
  isPurchasable: boolean;
  status: CrmProvisionStatus;
  occurrences: number;
  spaces: string[];
  isCustom: boolean;
  /** The typed name. Non-null iff `isCustom`. */
  customName: string | null;
  /** Synthetic render key. Never a domain id — see `ApiService.trackKeyFor`. */
  trackKey: string;
}

export interface ProvisionSummary {
  spaceId: string;
  spaceName: string;
  status: CrmProvisionStatus;
  count: number;
}

// ── Storefront picks (crmp C-6, contract §2.9.1 #110–#114) ──────────────────

/** `CrmSpaceSelectionOptionResponse` (`Crm.Contracts/Spaces/StorefrontContracts.cs:8`). */
export interface SpaceSelectionOption {
  attributeId: string;
  attributeNameEn: string;
  attributeNameAr: string;
  optionId: string;
  optionCode: string;
  optionNameEn: string;
  optionNameAr: string;
}

/**
 * `CrmSpaceSelectionResponse` (`StorefrontContracts.cs:14-16`): one storefront pick with the
 * catalog names resolved. The same shape is the brief entry's frozen `selections` snapshot;
 * on the portal `notes` is always `null` (FINDING-F-9).
 */
export interface SpaceSelection {
  id: string;
  spaceId: string;
  catalogItemId: string;
  itemCode: string;
  itemNameEn: string;
  itemNameAr: string;
  quantity: number;
  notes: string | null;
  sortOrder: number;
  options: SpaceSelectionOption[];
}

/** `SpaceSelectionOptionInput` (`StorefrontContracts.cs:6`): the option chosen for one attribute. */
export interface SpaceSelectionOptionInput {
  attributeId: string;
  optionId: string;
}

/** `POST …/selections` body (`CrmStorefrontEndpoints.cs:66`, `SelectionRequest`). */
export interface AddSpaceSelectionRequest {
  catalogItemId: string;
  /** 0.001..1,000,000, at most 3 decimals. */
  quantity: number;
  notes?: string | null;
  options?: SpaceSelectionOptionInput[];
}

/**
 * `PUT …/selections/{selectionId}` body. The item can't change. `options` omitted/`null` KEEPS
 * the chosen options, `[]` clears them; `notes` is full replace (omitted = cleared).
 */
export interface UpdateSpaceSelectionRequest {
  quantity: number;
  notes: string | null;
  options?: SpaceSelectionOptionInput[] | null;
}
