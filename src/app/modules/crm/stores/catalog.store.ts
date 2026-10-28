import { computed, inject } from '@angular/core';
import { patchState, signalStore, withComputed, withMethods, withState } from '@ngrx/signals';
import { CrmCatalogService } from '../data/crm-catalog.service';
import type { CatalogKey } from '@platform/i18n/catalog/en';
import type { CatalogAttribute, CatalogCategory, CatalogItem } from '../model';

/**
 * The catalog read cache — a `providedIn: 'root'` store (a cache, not page state),
 * the successor to `checklist-templates.store.ts`.
 *
 * ## One whole-category-tree fetch, drilled client-side.
 *
 * There is no `/catalog/children` feed on the backend — only `GET /categories` (the whole
 * tree, flat). So we fetch it **once**, hold the flat list, and derive children, ancestors
 * and subtree ids from that single in-memory tree. A per-parent subtree cache would just
 * re-fetch data the root response already holds, so we key on nothing but "the tree" — one
 * TTL, one invalidation. (Revisit only if the catalog ever outgrows a single response —
 * that is when a `/children` endpoint earns its place.) `items`, unlike categories, has no
 * such bound (it is catalog-wide SKUs, not branches), so it is a per-query cache instead of
 * a whole-table fetch.
 *
 * Four side caches: the v2 item feed keyed by category (F6's admin Items card); the
 * storefront's whole item pool keyed by space type (`itemsBySpaceType` — see
 * `loadItemsForSpaceType`'s own docblock); v2 items keyed by their OWN id (`itemsById` —
 * the board's room-override chip needs an item's default attribute values, which the
 * space-item wire does not carry: the backend joins only the room's own override table,
 * never the catalog item's); and effective attributes keyed by node id — this last one
 * already accepts a v2 category id or item id interchangeably, since
 * `GET /nodes/{id}/attributes` does (verified: the same ancestor-inclusive query backs
 * both `/nodes/{id}/attributes` and the v2 `/categories/{id}/attributes`). Any admin
 * mutation calls `invalidate()`.
 *
 * `CatalogNode` and its whole v1 slice (`nodes`/`roots`/`loadCatalog`/`setNodes`/
 * `childrenOf`/`node`/`ancestorsOf`/`subtreeIds`) — REMOVED in Run B's F7. The v1 picker
 * feed (`pickerBySpaceType`/`loadPickerFeed`/`pickerFeed`) went earlier, in F5, with its
 * sole consumer `record-items-dialog`. By F7 nothing outside this file's own spec called
 * any v1-node method any more — confirmed by grep before deleting, not assumed.
 *
 * Follows the repo store idiom — `.subscribe({ next, error })` + `patchState`, no `rxMethod`.
 */

interface ItemsEntry {
  readonly items: CatalogItem[];
  readonly fetchedAtMs: number;
}

interface CatalogState {
  /** The whole v2 category tree, flat — tens of rows. */
  categories: CatalogCategory[];
  categoriesFetchedAtMs: number | null;
  /** v2 item feed per category — on-demand, TTL'd. F6's admin Items card is its consumer;
   * the storefront (F5) uses `itemsBySpaceType` below instead. */
  itemsByCategory: Record<string, ItemsEntry>;
  /**
   * The storefront's whole item pool per space type — see `loadItemsForSpaceType`'s
   * docblock for why self-excluding facet counts need the unfiltered set in memory.
   */
  itemsBySpaceType: Record<string, ItemsEntry>;
  /** The pool fetch. Separate from `treeLoading` — the storefront's pool fetch and the
   * admin's category-tree fetch race independently. */
  poolLoading: boolean;
  poolError: CatalogKey | null;
  /**
   * v2 items by their OWN id, no TTL (load-once, same idiom as `attrsByNode`) — the
   * board's room-override chip needs an item's own default attribute values, and the
   * space-item wire only carries the room's OVERRIDE values (verified against
   * `GetSpaceItemsQueryHandler`: it joins `CrmSpaceItemAttributeValues` alone, never the
   * catalog item's own value table). So the item defaults are a second fetch, cached
   * here by item id, merged client-side against the room's `SpaceItem.attributes`.
   */
  itemsById: Record<string, CatalogItem>;
  /** Effective (own + inherited) attribute definitions per node. Cleared on invalidate. */
  attrsByNode: Record<string, CatalogAttribute[]>;
  /** The category-tree fetch (`loadCategories`). Kept separate from `poolLoading` — see
   * that field's own comment. */
  treeLoading: boolean;
  /** A catalog KEY, never prose — every consumer renders `catalog.t(error()!)`. */
  error: CatalogKey | null;
}

const INITIAL: CatalogState = {
  categories: [],
  categoriesFetchedAtMs: null,
  itemsByCategory: {},
  itemsBySpaceType: {},
  itemsById: {},
  attrsByNode: {},
  treeLoading: false,
  poolLoading: false,
  error: null,
  poolError: null,
};

export const CATALOG_TTL_MS = 5 * 60 * 1000;

export const CatalogStore = signalStore(
  { providedIn: 'root' },
  withState<CatalogState>(INITIAL),

  withComputed((store) => ({
    /** Root categories, sorted — the first drill-down level. */
    categoryRoots: computed(() =>
      store
        .categories()
        .filter((c) => c.parentId === null)
        .sort((a, b) => a.sortOrder - b.sortOrder),
    ),
  })),

  withMethods((store, api = inject(CrmCatalogService)) => {
    const isCategoriesFresh = (nowMs: number): boolean => {
      const at = store.categoriesFetchedAtMs();
      return at !== null && nowMs - at < CATALOG_TTL_MS;
    };

    return {
      /** Drop every cache so the next read refetches — call after any admin mutation. */
      invalidate(): void {
        patchState(store, {
          categoriesFetchedAtMs: null,
          itemsByCategory: {},
          itemsBySpaceType: {},
          itemsById: {},
          attrsByNode: {},
        });
      },

      // ── v2 categories — one whole-tree fetch, drilled client-side ───────

      /** Fetch the whole category tree once. A fresh cache short-circuits unless `force`. */
      loadCategories(nowMs: number = Date.now(), force = false): void {
        if (!force && isCategoriesFresh(nowMs)) return;
        patchState(store, { treeLoading: true });
        api.getCategories(null, true).subscribe({
          next: (categories) =>
            patchState(store, {
              categories,
              categoriesFetchedAtMs: nowMs,
              treeLoading: false,
              error: null,
            }),
          error: () => patchState(store, { treeLoading: false, error: 'cat.loadFailed' }),
        });
      },

      /** Direct child categories of a parent (`null` = roots), sorted. */
      categoryChildrenOf(parentId: string | null): CatalogCategory[] {
        return store
          .categories()
          .filter((c) => c.parentId === parentId)
          .sort((a, b) => a.sortOrder - b.sortOrder);
      },

      category(id: string): CatalogCategory | undefined {
        return store.categories().find((c) => c.id === id);
      },

      /**
       * Root-to-category breadcrumb, resolved locally by walking `parentId`.
       * `GET /categories/{id}/ancestors` exists on the backend too
       * ({@link CrmCatalogService.categoryAncestors}), but this derives client-side
       * while the cache holds the whole tree — the round trip is redundant against a
       * cache that already has the answer. If the cache ever goes partial or paged,
       * `categoryAncestors()` is the fallback to reach for.
       */
      categoryAncestorsOf(id: string): CatalogCategory[] {
        const byId = new Map(store.categories().map((c) => [c.id, c]));
        const chain: CatalogCategory[] = [];
        let cursor = byId.get(id)?.parentId ?? null;
        while (cursor) {
          const parent = byId.get(cursor);
          if (!parent) break;
          chain.unshift(parent);
          cursor = parent.parentId;
        }
        return chain;
      },

      /** The category's own subtree ids (incl. itself) — for the admin's move-target
       * guard (a category cannot move under its own descendant). */
      categorySubtreeIds(id: string): Set<string> {
        const self = store.categories().find((c) => c.id === id);
        if (!self) return new Set([id]);
        const ids = store
          .categories()
          .filter((c) => c.path.startsWith(self.path))
          .map((c) => c.id);
        return new Set([id, ...ids]);
      },

      // ── v2 items — per-category, on-demand (unlike categories, unbounded) ─

      /**
       * `force` re-fetches past both the TTL and a cached entry. `catalog-admin.store.ts`
       * (F6) is its consumer — the admin's Items card.
       */
      loadItemsForCategory(categoryId: string, nowMs: number = Date.now(), force = false): void {
        const entry = store.itemsByCategory()[categoryId];
        if (!force && entry && nowMs - entry.fetchedAtMs < CATALOG_TTL_MS) return;
        api.itemsByCategory(categoryId).subscribe({
          next: (items) =>
            patchState(store, (s) => ({
              itemsByCategory: {
                ...s.itemsByCategory,
                [categoryId]: { items, fetchedAtMs: nowMs },
              },
            })),
          error: () => patchState(store, { error: 'cat.itemsLoadFailed' }),
        });
      },

      itemsForCategory(categoryId: string): CatalogItem[] | undefined {
        return store.itemsByCategory()[categoryId]?.items;
      },

      // ── v2 items by space type — the storefront's whole pool ─────────────

      /**
       * The storefront's whole item pool for one space type — **not available** (009b #35).
       * The backend's only item read is per category (`GET /categories/{id}/items`), with no
       * space-type, attribute or option facet, and no route reads a category's space-type
       * mappings, so the pool cannot be built. No request is made; `poolError` carries the
       * catalog's "not available" key. The signature stays for the storefront page.
       */
      loadItemsForSpaceType(
        _spaceTypeId: string,
        _nowMs: number = Date.now(),
        _force = false,
      ): void {
        patchState(store, { poolLoading: false, poolError: 'cat.notAvailable' });
      },

      itemsForSpaceType(spaceTypeId: string): CatalogItem[] | undefined {
        return store.itemsBySpaceType()[spaceTypeId]?.items;
      },

      // ── v2 items by id — for resolving an item's own default attribute values ──

      /** Load-once, same idiom as `loadEffectiveAttributes` — no in-flight guard needed
       * beyond the cache check, since a second call before the first resolves just
       * re-requests the same (idempotent) read. */
      loadItem(itemId: string): void {
        if (store.itemsById()[itemId]) return;
        api.getItem(itemId).subscribe({
          next: (item) =>
            patchState(store, (s) => ({ itemsById: { ...s.itemsById, [itemId]: item } })),
          error: () => patchState(store, { error: 'cat.itemsLoadFailed' }),
        });
      },

      item(itemId: string): CatalogItem | undefined {
        return store.itemsById()[itemId];
      },

      // ── Effective attributes per node (v1 node id, v2 category id, or v2 item id) ─
      //
      // One cache serves all three. `GET /nodes/{id}/attributes` accepts a category id
      // or an item id in v2 terms just as well as a v1 node id — same ancestor-inclusive
      // query, same result — so there is no separate v2 method or cache to keep in sync.

      loadEffectiveAttributes(nodeId: string): void {
        if (store.attrsByNode()[nodeId]) return;
        api.effectiveAttributes(nodeId).subscribe({
          next: (attrs) =>
            patchState(store, (s) => ({ attrsByNode: { ...s.attrsByNode, [nodeId]: attrs } })),
          error: () => patchState(store, { error: 'cat.attrsLoadFailed' }),
        });
      },

      effectiveAttributes(nodeId: string): CatalogAttribute[] | undefined {
        return store.attrsByNode()[nodeId];
      },
    };
  }),
);
