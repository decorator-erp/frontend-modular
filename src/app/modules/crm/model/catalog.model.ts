/**
 * Catalog DTOs — feature 006.
 *
 * The backend split the one unified node tree into two things that were never really
 * one: **categories** (the branches — they carry the selection rule, the required flag
 * and the attribute declarations) and **items** (the leaves — they carry resolved
 * attribute VALUES and nothing structural). An item has no `path`, no `depth`, no
 * `parentId`, no `selectionMode`; its parent field is `categoryId`.
 *
 * `CatalogNode`, the v1 flat projection that used to live here alongside these v2
 * shapes, retired in Run B's F7 — its last frontend consumers (the admin tree/attributes
 * UI, the storefront picker) moved onto `CatalogCategory`/`CatalogItem` in F5/F6, and F7
 * deleted the type itself, its request shapes, and the v1 `/nodes` write methods it
 * backed. `GET /catalog/nodes` still exists server-side — backend Phase 8 dropped the v1
 * TABLES but kept the v1 ROUTES as a permanent alias, so it is not going away — nothing
 * here calls it any more regardless.
 *
 * Mirrors the shipped backend contract, verified field-for-field against
 * `Application/DTOs/CrmCatalog/CrmCatalogDtos.cs` at backend `3d400a7` — NOT against
 * `docs/crm-frontend/01-Models-and-Enums.md §10`, which predates the split and does not
 * define the v2 shapes at all. Enums arrive as **bare integers**; all `Guid` → `string`.
 */

import type { CatalogAttributeType, CatalogSelectionMode } from './crm-enums';

// ── Categories + items (v2) ────────────────────────────────────────────────

/**
 * A branch. Carries the structure and the rules; holds no attribute values of its own.
 *
 * Mirrors `CrmCatalogCategoryResponse` (`Crm.Contracts/Catalog/CatalogContracts.cs:5-7`,
 * 009b #34): no description, image or space-type targeting set on the wire — no route reads
 * a category's space-type mappings.
 */
export interface CatalogCategory {
  id: string;
  /** `null` = a root category. */
  parentId: string | null;
  code: string;
  /** Payload DATA, never a catalog string — picked by locale in the component. */
  nameEn: string;
  nameAr: string;
  /** Materialised `/id/id/…/` with a trailing slash — resolve ancestors by prefix. */
  path: string;
  /** Root = 0. */
  depth: number;
  /** The branch rule that drives Single/Multi enforcement. */
  selectionMode: CatalogSelectionMode;
  /** Drives completeness. */
  isRequired: boolean;
  sortOrder: number;
  isActive: boolean;
  /** Synthetic render key. Never a domain id — see `ApiService.trackKeyFor`. */
  trackKey: string;
}

export interface CreateCatalogCategoryRequest {
  /** `undefined`/`null` = a root category. */
  parentId?: string | null;
  code: string;
  nameEn: string;
  nameAr: string;
  selectionMode?: CatalogSelectionMode;
  isRequired?: boolean;
  sortOrder?: number;
  descriptionEn?: string | null;
  descriptionAr?: string | null;
  imageUri?: string | null;
}

/**
 * No `sortOrder` (use `reorderCategories`) and no `parentId` (use `moveCategory`) — full
 * replacement of everything else, so `selectionMode`/`isRequired` are REQUIRED here, not
 * optional like on create.
 */
export interface UpdateCatalogCategoryRequest {
  code: string;
  nameEn: string;
  nameAr: string;
  selectionMode: CatalogSelectionMode;
  isRequired: boolean;
  descriptionEn?: string | null;
  descriptionAr?: string | null;
  imageUri?: string | null;
}

export interface MoveCatalogCategoryRequest {
  /** `null` = move to root. */
  newParentId: string | null;
}

export interface CloneCatalogCategoryRequest {
  /** `null`/omitted = clone as a sibling of the source, under the same parent. */
  newParentId?: string | null;
  newCode: string;
}

/**
 * A leaf. Structurally flat: its only tie to the tree is `categoryId`.
 *
 * `attributes` are the item's own values for the attributes it inherits from its
 * category chain. The backend emits **every effective attribute**, so an entry whose
 * value members are all `null` means "declared and unanswered", not "absent".
 */
export interface CatalogItem {
  id: string;
  /** The owning category. There is no `parentId` and no `path` on an item. */
  categoryId: string;
  code: string;
  /** Payload DATA, never a catalog string — picked by locale in the component. */
  nameEn: string;
  nameAr: string;
  descriptionEn: string | null;
  descriptionAr: string | null;
  imageUri: string | null;
  /** Finishes and labour aren't SKUs. */
  isPurchasable: boolean;
  sortOrder: number;
  isActive: boolean;
  attributes: ItemAttributeValue[];
  /** Synthetic render key. Never a domain id — see `ApiService.trackKeyFor`. */
  trackKey: string;
}

/**
 * One resolved attribute value. Keyed by **`attributeId`**, not `id`.
 *
 * Exactly one value member is set, matching `dataType` — unless the attribute is
 * effective but unanswered, in which case all five are `null`.
 */
export interface ItemAttributeValue {
  attributeId: string;
  code: string;
  nameEn: string;
  nameAr: string;
  dataType: CatalogAttributeType;
  /** Display unit for a `Number` (mm, m², W). */
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

/** One value-member is set, matching the attribute's `dataType`. */
export interface ItemAttributeValueRequest {
  attributeId: string;
  valueText?: string | null;
  valueNumber?: number | null;
  valueBool?: boolean | null;
  valueDate?: string | null;
  optionId?: string | null;
}

/**
 * Replace-all. An attribute omitted from `values` is **cleared**, not left alone —
 * the same rule the space-item attribute write follows.
 */
export interface SetCatalogItemAttributeValuesRequest {
  values: ItemAttributeValueRequest[];
}

export interface CreateCatalogItemRequest {
  categoryId: string;
  code: string;
  nameEn: string;
  nameAr: string;
  isPurchasable?: boolean;
  sortOrder?: number;
  descriptionEn?: string | null;
  descriptionAr?: string | null;
  imageUri?: string | null;
}

/** `categoryId` is absent on purpose — re-filing an item is its own route. */
export interface UpdateCatalogItemRequest {
  code: string;
  nameEn: string;
  nameAr: string;
  isPurchasable: boolean;
  descriptionEn?: string | null;
  descriptionAr?: string | null;
  imageUri?: string | null;
}

export interface MoveCatalogItemRequest {
  categoryId: string;
}

export interface SetCatalogActiveRequest {
  isActive: boolean;
}

export interface CatalogReorderItem {
  id: string;
  sortOrder: number;
}

export interface CatalogReorderRequest {
  items: CatalogReorderItem[];
}

// ── Attributes + options (defined on a branch, INHERITED by every descendant) ──

export interface CatalogAttribute {
  id: string;
  /**
   * The category that DECLARES this attribute.
   *
   * The wire field is still named `nodeId` (same permanent v1-name-on-v2-data pattern
   * `AddCatalogSpaceItemRequest.catalogNodeId` documents), but has carried a category id
   * since the split — `normalizeAttribute()` reads the wire's `nodeId` and exposes it here
   * under its real meaning. The `nodeId`
   * read-only alias this type used to carry for the admin UI retired in Run B's F7 once
   * every consumer moved onto `categoryId` directly.
   */
  categoryId: string;
  code: string;
  nameEn: string;
  nameAr: string;
  dataType: CatalogAttributeType;
  /** Display unit for a `Number` (mm, m², W). */
  unit: string | null;
  isRequired: boolean;
  sortOrder: number;
  isActive: boolean;
  /** `Select` only; empty otherwise. */
  options: CatalogAttributeOption[];
}

export interface CatalogAttributeOption {
  id: string;
  code: string;
  nameEn: string;
  nameAr: string;
  imageUri: string | null;
  sortOrder: number;
  isActive: boolean;
}

export interface AddCatalogAttributeRequest {
  code: string;
  nameEn: string;
  nameAr: string;
  dataType: CatalogAttributeType;
  unit?: string | null;
  isRequired?: boolean;
  sortOrder?: number;
}

/** `dataType` is absent on purpose — immutable once any value exists. */
export interface UpdateCatalogAttributeRequest {
  code: string;
  nameEn: string;
  nameAr: string;
  unit?: string | null;
  isRequired: boolean;
}

export interface AddCatalogAttributeOptionRequest {
  code: string;
  nameEn: string;
  nameAr: string;
  imageUri?: string | null;
  sortOrder?: number;
}

export interface UpdateCatalogAttributeOptionRequest {
  code: string;
  nameEn: string;
  nameAr: string;
  imageUri?: string | null;
}
