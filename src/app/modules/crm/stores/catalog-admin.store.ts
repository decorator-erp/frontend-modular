import { computed, inject } from '@angular/core';
import type { HttpErrorResponse } from '@angular/common/http';
import { patchState, signalStore, withComputed, withMethods, withState } from '@ngrx/signals';
import type { Observable } from 'rxjs';
import { CrmCatalogService } from '../data/crm-catalog.service';
import { ErrorHandlerService } from '@platform/http/error-handler.service';
import type { CatalogKey } from '@platform/i18n/catalog/en';
import type {
  AddCatalogAttributeOptionRequest,
  AddCatalogAttributeRequest,
  CatalogAttribute,
  CatalogCategory,
  CatalogItem,
  CloneCatalogCategoryRequest,
  CreateCatalogCategoryRequest,
  UpdateCatalogAttributeOptionRequest,
  UpdateCatalogAttributeRequest,
  UpdateCatalogCategoryRequest,
} from '../model';
import { CatalogStore } from './catalog.store';
import type { MutationHandlers } from './mutation-handlers';

export type { MutationHandlers };

/**
 * Route-scoped state for the catalog admin drill-down — v2 categories (Run B, F6).
 * The current position is a `?category=` query param owned by the page; everything else
 * (children, breadcrumb, effective attributes, items) is DERIVED from the root
 * `CatalogStore` cache, so a mutation refetches the cache once and every view updates.
 *
 * Attribute + option CRUD still calls the v1 `/nodes/{id}/attributes` routes — there is
 * NO v2 equivalent (`a7de73f` added category CRUD and one effective-attribute derivation,
 * not attribute/option write routes), and a v2 category id resolves against `/nodes/{id}`
 * exactly as a v1 node id does, since ids were preserved across the split. This is not a
 * gap Run B left open; there is nothing on the v2 surface to repoint to.
 *
 * 009b #N-7: no route reads a category's space-type mappings or searches categories, so
 * targeting is write-only again and the search filters the cached `/tree` client-side.
 *
 * Reorder is optimistic against the cache with rollback; all other mutations refetch.
 * This store is deliberately URL-agnostic — it never imports the Router. A mutation that
 * must move the URL (delete → go to the parent) reports upward and the page navigates.
 */

interface CatalogAdminState {
  currentCategoryId: string | null;
  saving: boolean;
  /** Non-empty ⇒ the page shows results instead of the current level's children. */
  searchTerm: string;
  searchResults: CatalogCategory[];
  /** A catalog KEY, never prose — every consumer renders `catalog.t(error()!)`. */
  error: CatalogKey | null;
}

const INITIAL: CatalogAdminState = {
  currentCategoryId: null,
  saving: false,
  searchTerm: '',
  searchResults: [],
  error: null,
};

export const CatalogAdminStore = signalStore(
  withState<CatalogAdminState>(INITIAL),

  withComputed((store, cache = inject(CatalogStore)) => ({
    /** The category whose detail the rail shows; `null` at the root level. */
    currentCategory: computed<CatalogCategory | null>(() => {
      const id = store.currentCategoryId();
      return id ? (cache.category(id) ?? null) : null;
    }),
    /** The children of the current position (`null` id ⇒ roots). */
    children: computed<CatalogCategory[]>(() =>
      cache.categoryChildrenOf(store.currentCategoryId()),
    ),
    /** Root-to-current breadcrumb. */
    ancestors: computed<CatalogCategory[]>(() => {
      const id = store.currentCategoryId();
      return id ? cache.categoryAncestorsOf(id) : [];
    }),
    /** Own + inherited attribute definitions of the current category. */
    effectiveAttributes: computed<CatalogAttribute[]>(() => {
      const id = store.currentCategoryId();
      return id ? (cache.effectiveAttributes(id) ?? []) : [];
    }),
    /** The current category's own items — the Items card. */
    items: computed<CatalogItem[]>(() => {
      const id = store.currentCategoryId();
      return id ? (cache.itemsForCategory(id) ?? []) : [];
    }),
    catalogLoading: computed(() => cache.treeLoading()),
    /** The root cache's own failure (tree / attribute / item reads) — rendered by the page. */
    catalogError: computed(() => cache.error()),
  })),

  withMethods(
    (
      store,
      api = inject(CrmCatalogService),
      cache = inject(CatalogStore),
      errors = inject(ErrorHandlerService),
    ) => {
      /** Refetch the cache after a structural mutation and reload the current level's data. */
      const refresh = (): void => {
        cache.invalidate();
        cache.loadCategories(Date.now(), true);
        const id = store.currentCategoryId();
        if (id) {
          cache.loadEffectiveAttributes(id);
          cache.loadItemsForCategory(id, Date.now(), true);
        }
      };

      /**
       * Run a mutation with the shared `saving`/`error` bookkeeping. `handlers.onError`
       * gets the parsed server error so the caller can surface the domain code.
       */
      const run = (
        obs: Observable<unknown>,
        errorKey: CatalogKey,
        after: () => void = refresh,
        handlers?: MutationHandlers,
      ): void => {
        patchState(store, { saving: true, error: null });
        obs.subscribe({
          next: () => {
            patchState(store, { saving: false });
            after();
            handlers?.onDone?.();
          },
          error: (err: HttpErrorResponse) => {
            patchState(store, { saving: false, error: errorKey });
            handlers?.onError?.(errors.parse(err), errorKey);
          },
        });
      };

      return {
        /** Load the tree and point at a category (`null` = roots). Called by the page from `?category=`. */
        init(categoryId: string | null): void {
          cache.loadCategories();
          this.selectCategory(categoryId);
        },

        selectCategory(categoryId: string | null): void {
          patchState(store, { currentCategoryId: categoryId });
          if (categoryId) {
            cache.loadEffectiveAttributes(categoryId);
            cache.loadItemsForCategory(categoryId);
          }
        },

        /** Refetch the cache — for the page to call after a dialog mutates out-of-band. */
        reload(): void {
          refresh();
        },

        /**
         * Search across code, nameEn AND nameAr of the cached `/tree` (009b #N-7: no search
         * route exists), case-insensitive. Empty term clears the results and returns the
         * page to normal drill-down.
         */
        search(term: string): void {
          const trimmed = term.trim();
          if (!trimmed) {
            patchState(store, { searchTerm: '', searchResults: [] });
            return;
          }
          const needle = trimmed.toLocaleLowerCase();
          const searchResults = cache
            .categories()
            .filter((c) =>
              [c.code, c.nameEn, c.nameAr].some((v) => v.toLocaleLowerCase().includes(needle)),
            );
          patchState(store, { searchTerm: trimmed, searchResults });
        },

        // ── Category structure (v2) ───────────────────────────────────────
        createCategory(request: CreateCatalogCategoryRequest, handlers?: MutationHandlers): void {
          run(api.createCategory(request), 'cat.saveFailed', refresh, handlers);
        },
        updateCategory(
          categoryId: string,
          request: UpdateCatalogCategoryRequest,
          handlers?: MutationHandlers,
        ): void {
          run(api.updateCategory(categoryId, request), 'cat.saveFailed', refresh, handlers);
        },
        setCategoryActive(
          categoryId: string,
          isActive: boolean,
          handlers?: MutationHandlers,
        ): void {
          run(api.setCategoryActive(categoryId, isActive), 'cat.statusFailed', refresh, handlers);
        },
        moveCategory(
          categoryId: string,
          newParentId: string | null,
          handlers?: MutationHandlers,
        ): void {
          run(api.moveCategory(categoryId, { newParentId }), 'cat.moveFailed', refresh, handlers);
        },
        cloneCategory(
          categoryId: string,
          request: CloneCatalogCategoryRequest,
          handlers?: MutationHandlers,
        ): void {
          run(api.cloneCategory(categoryId, request), 'cat.saveFailed', refresh, handlers);
        },
        /**
         * Delete, then point at the parent. The URL is NOT touched here — the page owns
         * `?category=` and navigates from its own `(deleted)` binding.
         */
        deleteCategory(
          categoryId: string,
          parentId: string | null,
          handlers?: MutationHandlers,
        ): void {
          run(
            api.deleteCategory(categoryId),
            'cat.nodeInUse',
            () => {
              this.selectCategory(parentId);
              refresh();
            },
            handlers,
          );
        },

        /**
         * Sibling reorder (Move up/down). NOT optimistic, unlike the v1 admin's
         * `reorderChild` — `CatalogStore` has no `setCategories` mutator to patch ahead of
         * the response (categories were never written to client-side before this run), so
         * this sends the new order and refetches on success rather than inventing a
         * write-path into a cache that has only ever been read into. `direction` is -1/+1.
         */
        reorderChild(parentId: string | null, categoryId: string, direction: -1 | 1): void {
          const siblings = cache.categoryChildrenOf(parentId);
          const index = siblings.findIndex((c) => c.id === categoryId);
          const target = index + direction;
          if (index < 0 || target < 0 || target >= siblings.length) return;

          const reordered = [...siblings];
          [reordered[index], reordered[target]] = [reordered[target], reordered[index]];
          const items = reordered.map((c, i) => ({ id: c.id, sortOrder: i }));

          patchState(store, { saving: true, error: null });
          api.reorderCategories(parentId, { items }).subscribe({
            next: () => {
              patchState(store, { saving: false });
              refresh();
            },
            error: () => patchState(store, { saving: false, error: 'cat.reorderFailed' }),
          });
        },

        // ── Attributes + options (009b #39: add is POST /attributes { categoryId }) ─────
        addAttribute(
          categoryId: string,
          request: AddCatalogAttributeRequest,
          handlers?: MutationHandlers,
        ): void {
          run(api.addAttribute(categoryId, request), 'cat.attrSaveFailed', refresh, handlers);
        },
        updateAttribute(
          attributeId: string,
          request: UpdateCatalogAttributeRequest,
          handlers?: MutationHandlers,
        ): void {
          run(api.updateAttribute(attributeId, request), 'cat.attrSaveFailed', refresh, handlers);
        },
        deleteAttribute(attributeId: string, handlers?: MutationHandlers): void {
          run(api.deleteAttribute(attributeId), 'cat.attrRemoveFailed', refresh, handlers);
        },
        addOption(
          attributeId: string,
          request: AddCatalogAttributeOptionRequest,
          handlers?: MutationHandlers,
        ): void {
          run(api.addOption(attributeId, request), 'cat.optionSaveFailed', refresh, handlers);
        },
        updateOption(
          optionId: string,
          request: UpdateCatalogAttributeOptionRequest,
          handlers?: MutationHandlers,
        ): void {
          run(api.updateOption(optionId, request), 'cat.optionSaveFailed', refresh, handlers);
        },
        deleteOption(optionId: string, handlers?: MutationHandlers): void {
          run(api.deleteOption(optionId), 'cat.optionRemoveFailed', refresh, handlers);
        },
        /**
         * Move one option within its attribute. Options live on the category's effective
         * attributes (a cache read), not in `categories`, so there is nothing to patch
         * optimistically — send the new order and let the refetch settle it.
         */
        reorderOption(
          attribute: CatalogAttribute,
          optionId: string,
          direction: -1 | 1,
          handlers?: MutationHandlers,
        ): void {
          const ordered = [...attribute.options].sort((a, b) => a.sortOrder - b.sortOrder);
          const index = ordered.findIndex((o) => o.id === optionId);
          const target = index + direction;
          if (index < 0 || target < 0 || target >= ordered.length) return;

          [ordered[index], ordered[target]] = [ordered[target], ordered[index]];
          const items = ordered.map((o, i) => ({ id: o.id, sortOrder: i }));
          run(
            api.reorderOptions(attribute.id, { items }),
            'cat.optionSaveFailed',
            refresh,
            handlers,
          );
        },

        // ── Space-type targeting (write-only: no mappings read, 009b #N-7) ──
        mapSpaceType(categoryId: string, spaceTypeId: string, handlers?: MutationHandlers): void {
          run(
            api.mapCategorySpaceType(categoryId, spaceTypeId),
            'cat.targetingFailed',
            () => undefined,
            handlers,
          );
        },
        unmapSpaceType(categoryId: string, spaceTypeId: string, handlers?: MutationHandlers): void {
          run(
            api.unmapCategorySpaceType(categoryId, spaceTypeId),
            'cat.targetingFailed',
            () => undefined,
            handlers,
          );
        },

        // ── Items (v2 — new in F6) ─────────────────────────────────────────
        //
        // Create/update + the attribute-values write are a TWO-STEP chain (create needs
        // the new id back before the spec can be written), which this store's `run()`
        // helper doesn't expose — it discards the response body. `catalog-item-dialog`
        // calls `CrmCatalogService` directly for that pair, the same precedent
        // `new-node-dialog.component.ts` already set for category creation, and calls
        // `reload()` below once both steps finish. Only the single-step mutations live
        // here.
        setItemActive(itemId: string, isActive: boolean, handlers?: MutationHandlers): void {
          run(api.setItemActive(itemId, isActive), 'cat.statusFailed', refresh, handlers);
        },
        deleteItem(itemId: string, handlers?: MutationHandlers): void {
          run(api.deleteItem(itemId), 'cat.nodeInUse', refresh, handlers);
        },
      };
    },
  ),
);
