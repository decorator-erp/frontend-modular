import { CatalogAttributeType, CatalogSelectionMode } from '../../model/crm-enums';
import type { CatalogCategory, CatalogItem, ItemAttributeValue, SpaceItem } from '../../model';

/**
 * Pure filtering + facet-derivation for the storefront (F5). Everything here operates on
 * ONE pool already fetched for a space type (`CatalogStore.itemsForSpaceType`) plus the
 * whole cached category tree — no network calls, no store dependency, so it is testable
 * without Angular. Mirrors the reasoning `branch-chain.ts` used for the picker it replaces.
 *
 * ## Why client-side, and why the pool must be the WHOLE unfiltered set
 *
 * `GET /catalog/items` binds exactly one `(attributeId, optionId)` pair server-side —
 * `optionId` alone is a silent no-op, repeated params are a 400 — so a multi-facet,
 * multi-select storefront cannot be built as one server query per filter change. Worse,
 * this page's facet counts are SELF-EXCLUDING: each group's counts are computed with that
 * group's OWN selection dropped but every other filter still applied. A server-filtered
 * response has already thrown away the rows a self-excluding count needs, so the counts
 * are only answerable against the full pool held in memory.
 */

export interface StorefrontFilters {
  /** Selected category ids (leaf categories only). Empty = no restriction. */
  categoryIds: ReadonlySet<string>;
  /** Selected option ids per Select attribute id. An empty Set is treated as "no selection". */
  facets: ReadonlyMap<string, ReadonlySet<string>>;
  /** Free-text search term, matched case-insensitively against name + category name. */
  term: string;
}

export const EMPTY_FILTERS: StorefrontFilters = {
  categoryIds: new Set(),
  facets: new Map(),
  term: '',
};

/** Self + every ancestor, order not significant — for chain-membership checks only. */
export function categoryChain(
  category: CatalogCategory,
  byId: ReadonlyMap<string, CatalogCategory>,
): CatalogCategory[] {
  const chain: CatalogCategory[] = [category];
  let cursor = category.parentId;
  while (cursor) {
    const parent = byId.get(cursor);
    if (!parent) break;
    chain.push(parent);
    cursor = parent.parentId;
  }
  return chain;
}

/**
 * Whether a category applies to a space type. 009b #34: the category wire
 * (`CrmCatalogCategoryResponse`) carries no space-type targeting set and no route reads a
 * category's mappings, so targeting is not available and every category is global.
 */
export function categoryApplies(
  _category: CatalogCategory,
  _spaceTypeId: string,
  _byId: ReadonlyMap<string, CatalogCategory>,
): boolean {
  return true;
}

/**
 * The categories the filter rail offers: LEAF categories only (a non-leaf category's items
 * are reached through its children, never directly — matching how the pool itself is
 * organized), active, and applicable to the space type. Every offered category renders in
 * the rail even at zero matches, so this list does not depend on the current filter state.
 */
export function offeredCategories(
  spaceTypeId: string,
  categories: readonly CatalogCategory[],
): CatalogCategory[] {
  const byId = new Map(categories.map((c) => [c.id, c]));
  const hasChildren = new Set(categories.filter((c) => c.parentId).map((c) => c.parentId!));
  return categories.filter(
    (c) => c.isActive && !hasChildren.has(c.id) && categoryApplies(c, spaceTypeId, byId),
  );
}

/** An item's own resolved value for one attribute, or `undefined` if the item carries none. */
function valueOf(item: CatalogItem, attributeId: string): ItemAttributeValue | undefined {
  return item.attributes.find((a) => a.attributeId === attributeId);
}

/**
 * Whether `item` matches `filters`. `skip` names one axis to ignore — `'category'` for the
 * category group's self-excluding count, or a specific `attributeId` for that facet
 * group's. An item with NO value for a filtered attribute is EXCLUDED outright, not merely
 * deranked — that is what makes selecting "Style: Modern" actually narrow the grid rather
 * than just re-sort it.
 */
export function matchesFilters(
  item: CatalogItem,
  filters: StorefrontFilters,
  skip: 'category' | string | null,
  searchable: (item: CatalogItem) => string,
): boolean {
  if (
    skip !== 'category' &&
    filters.categoryIds.size > 0 &&
    !filters.categoryIds.has(item.categoryId)
  ) {
    return false;
  }
  for (const [attributeId, selected] of filters.facets) {
    if (skip === attributeId || selected.size === 0) continue;
    const v = valueOf(item, attributeId);
    if (!v || v.optionId === null || !selected.has(v.optionId)) return false;
  }
  const term = filters.term.trim().toLowerCase();
  if (term && !searchable(item).toLowerCase().includes(term)) return false;
  return true;
}

/** The full pool filtered by every axis — what the product grid renders. */
export function filteredItems(
  pool: readonly CatalogItem[],
  filters: StorefrontFilters,
  searchable: (item: CatalogItem) => string,
): CatalogItem[] {
  return pool.filter((i) => matchesFilters(i, filters, null, searchable));
}

export interface FacetGroupDef {
  attributeId: string;
  nameEn: string;
  nameAr: string;
}

/**
 * The Select-typed attributes reachable from the pool, in first-encountered order (the
 * pool itself arrives `SortOrder, NameEn` from the backend, so this reads as declaration
 * order without needing the attribute's own `sortOrder` — `ItemAttributeValue` doesn't
 * carry one). Number/Text/Boolean/Date attributes are never facets.
 */
export function facetAttributesOf(pool: readonly CatalogItem[]): FacetGroupDef[] {
  const seen = new Map<string, FacetGroupDef>();
  for (const item of pool) {
    for (const attr of item.attributes) {
      if (attr.dataType !== CatalogAttributeType.Select) continue;
      if (!seen.has(attr.attributeId)) {
        seen.set(attr.attributeId, {
          attributeId: attr.attributeId,
          nameEn: attr.nameEn,
          nameAr: attr.nameAr,
        });
      }
    }
  }
  return [...seen.values()];
}

export interface FacetOptionCount {
  optionId: string;
  nameEn: string;
  nameAr: string;
  count: number;
}

/**
 * Every option of one facet attribute that is either currently selected or appears at
 * least once in `self` (the pool filtered with every axis EXCEPT this attribute's own
 * selection). An option with zero count that is NOT selected is omitted entirely — the
 * caller renders it neither dimmed nor as a choice — while a selected option always
 * renders (even at 0) so the user can undo the selection.
 */
export function facetOptionCounts(
  attributeId: string,
  self: readonly CatalogItem[],
  selected: ReadonlySet<string>,
): FacetOptionCount[] {
  const byOption = new Map<string, FacetOptionCount>();
  for (const item of self) {
    const v = valueOf(item, attributeId);
    if (!v || v.optionId === null) continue;
    const existing = byOption.get(v.optionId);
    if (existing) {
      existing.count += 1;
    } else {
      byOption.set(v.optionId, {
        optionId: v.optionId,
        nameEn: v.optionNameEn ?? '',
        nameAr: v.optionNameAr ?? '',
        count: 1,
      });
    }
  }
  // A selected option that no longer matches anything in `self` still renders at 0 — the
  // caller can only undo a selection it can see.
  for (const optionId of selected) {
    if (!byOption.has(optionId)) {
      byOption.set(optionId, { optionId, nameEn: '', nameAr: '', count: 0 });
    }
  }
  return [...byOption.values()];
}

/** `fCats.size + Σ facet set sizes + (term ? 1 : 0)` — drives "Clear all" and the dot counts. */
export function activeFilterCount(filters: StorefrontFilters): number {
  let n = filters.categoryIds.size;
  for (const sel of filters.facets.values()) n += sel.size;
  if (filters.term.trim()) n += 1;
  return n;
}

// ── The tri-state card: Added / Already chosen / Add ────────────────────────

/**
 * The category a recorded board row occupies. A CATALOG row's `path` ends with the item
 * itself, so its category is the second-to-last crumb; a CUSTOM row's `path` ends AT its
 * own category (established in F4 — a custom row has no item to append). Reading this off
 * `path` rather than re-resolving `catalogItemId` through the pool means it works even for
 * a row whose item has since gone inactive or is outside the current space-type pool.
 */
export function rowCategoryId(row: SpaceItem): string | undefined {
  if (row.path.length === 0) return row.isCustom ? (row.customCategoryId ?? undefined) : undefined;
  return row.isCustom ? row.path[row.path.length - 1].id : row.path[row.path.length - 2]?.id;
}

/**
 * Whether `item` is blocked by the `Single` rule: some ancestor (or the item's own
 * category) is `Single`, and the space already has ANY row — catalog or custom — sitting
 * in that ancestor's subtree. Resolved client-side from the cached category tree so the
 * card can show "Already chosen" before the user picks, rather than only after a
 * `SingleRuleViolated` 409; the server stays authoritative regardless.
 */
export function isSingleLocked(
  item: CatalogItem,
  categories: readonly CatalogCategory[],
  board: readonly SpaceItem[],
): boolean {
  const byId = new Map(categories.map((c) => [c.id, c]));
  const itemCategory = byId.get(item.categoryId);
  if (!itemCategory) return false;
  // `categoryChain` already returns self + every ancestor.
  const singleAncestor = categoryChain(itemCategory, byId).find(
    (c) => c.selectionMode === CatalogSelectionMode.Single,
  );
  if (!singleAncestor) return false;
  return board.some((row) => {
    const rcId = rowCategoryId(row);
    const rc = rcId ? byId.get(rcId) : undefined;
    return rc ? rc.path.startsWith(singleAncestor.path) : false;
  });
}
