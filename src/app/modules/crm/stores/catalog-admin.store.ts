import { computed, inject } from '@angular/core';
import type { HttpErrorResponse } from '@angular/common/http';
import { patchState, signalStore, withComputed, withMethods, withState } from '@ngrx/signals';
import type { Observable } from 'rxjs';
import { CrmCatalogService, type CatalogEntryKind } from '../data/crm-catalog.service';
import { ErrorHandlerService } from '@platform/http/error-handler.service';
import type { CatalogKey } from '@platform/i18n/catalog/en';
import type {
  AddCatalogAttributeOptionRequest,
  AddCatalogAttributeRequest,
  CatalogAttribute,
  CatalogAttributeOption,
  CatalogCategory,
  CatalogItem,
  CreateCatalogCategoryRequest,
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
 * Every mutation refetches. This store is deliberately URL-agnostic — it never imports the
 * Router. crmp C-4 (D4): activate/deactivate and delete for every kind, unmap, the options
 * read (`includeInactive` toggle) and the `tree?spaceTypeId` filter are back; edits go
 * through `CrmCatalogEntryDialogComponent`, which calls the service and asks for `reload()`.
 */

interface CatalogAdminState {
  currentCategoryId: string | null;
  saving: boolean;
  /** Non-empty ⇒ the page shows results instead of the current level's children. */
  searchTerm: string;
  searchResults: CatalogCategory[];
  /** A catalog KEY, never prose — every consumer renders `catalog.t(error()!)`. */
  error: CatalogKey | null;
  /** crmp C-4: options per attribute id, read through `GET attributes/{id}/options`. */
  options: Record<string, CatalogAttributeOption[]>;
  includeInactiveOptions: boolean;
  /** crmp C-4: `tree?spaceTypeId` — non-null ⇒ the page lists that space type's picker tree. */
  spaceTypeFilter: string | null;
  spaceTypeResults: CatalogCategory[];
  spaceTypeLoading: boolean;
}

const INITIAL: CatalogAdminState = {
  currentCategoryId: null,
  saving: false,
  searchTerm: '',
  searchResults: [],
  error: null,
  options: {},
  includeInactiveOptions: false,
  spaceTypeFilter: null,
  spaceTypeResults: [],
  spaceTypeLoading: false,
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

      /** Re-read the space-type filter's tree, when one is set. */
      const refreshFilter = (): void => {
        const filter = store.spaceTypeFilter();
        if (!filter) return;
        api.treeForSpaceType(filter).subscribe({
          next: (list) => patchState(store, { spaceTypeResults: list }),
          error: () => undefined,
        });
      };

      /** After an activate/delete: the tree, the filter and every loaded options list. */
      const refreshAll = (): void => {
        refresh();
        refreshFilter();
        const include = store.includeInactiveOptions();
        for (const id of Object.keys(store.options())) {
          api.attributeOptions(id, include).subscribe({
            next: (list) => patchState(store, { options: { ...store.options(), [id]: list } }),
            error: () => undefined,
          });
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
        if (store.saving()) return;
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
          refreshAll();
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
        moveCategory(
          categoryId: string,
          newParentId: string | null,
          handlers?: MutationHandlers,
        ): void {
          run(api.moveCategory(categoryId, { newParentId }), 'cat.moveFailed', refresh, handlers);
        },

        // ── Attributes + options (009b #39: add is POST /attributes { categoryId }) ─────
        addAttribute(
          categoryId: string,
          request: AddCatalogAttributeRequest,
          handlers?: MutationHandlers,
        ): void {
          run(api.addAttribute(categoryId, request), 'cat.attrSaveFailed', refresh, handlers);
        },
        addOption(
          attributeId: string,
          request: AddCatalogAttributeOptionRequest,
          handlers?: MutationHandlers,
        ): void {
          run(api.addOption(attributeId, request), 'cat.optionSaveFailed', refresh, handlers);
        },
        // ── crmp C-4: activate/deactivate, delete, options read, tree filter ──
        setActive(
          kind: CatalogEntryKind,
          id: string,
          isActive: boolean,
          handlers?: MutationHandlers,
        ): void {
          run(api.setEntryActive(kind, id, isActive), 'cat.statusFailed', refreshAll, handlers);
        },
        /**
         * Hard delete. A 409 `crm.catalog.InUse` is not a page error: the caller offers
         * deactivate instead, so the store's `error` stays clear for it.
         */
        deleteEntry(kind: CatalogEntryKind, id: string, handlers?: MutationHandlers): void {
          if (store.saving()) return;
          patchState(store, { saving: true, error: null });
          api.deleteEntry(kind, id).subscribe({
            next: () => {
              patchState(store, { saving: false });
              refreshAll();
              handlers?.onDone?.();
            },
            error: (err: HttpErrorResponse) => {
              const parsed = errors.parse(err);
              patchState(store, {
                saving: false,
                error: parsed.code === 'crm.catalog.InUse' ? null : 'cat.deleteFailed',
              });
              handlers?.onError?.(parsed, 'cat.deleteFailed');
            },
          });
        },
        /** Read one attribute's options under the current `includeInactiveOptions`. */
        loadOptions(attributeId: string): void {
          api.attributeOptions(attributeId, store.includeInactiveOptions()).subscribe({
            next: (list) =>
              patchState(store, { options: { ...store.options(), [attributeId]: list } }),
            error: () => patchState(store, { error: 'cat.optionsLoadFailed' }),
          });
        },
        /** Flip the toggle and re-read every attribute whose options are already loaded. */
        setIncludeInactiveOptions(include: boolean): void {
          patchState(store, { includeInactiveOptions: include });
          for (const id of Object.keys(store.options())) this.loadOptions(id);
        },
        /** `null` clears the filter and the page returns to drill-down. */
        filterBySpaceType(spaceTypeId: string | null): void {
          patchState(store, { spaceTypeFilter: spaceTypeId, spaceTypeResults: [] });
          if (!spaceTypeId) return;
          patchState(store, { spaceTypeLoading: true });
          api.treeForSpaceType(spaceTypeId).subscribe({
            next: (list) => {
              if (store.spaceTypeFilter() !== spaceTypeId) return;
              patchState(store, { spaceTypeResults: list, spaceTypeLoading: false });
            },
            error: () => patchState(store, { spaceTypeLoading: false, error: 'cat.loadFailed' }),
          });
        },
        unmapSpaceType(categoryId: string, spaceTypeId: string, handlers?: MutationHandlers): void {
          run(
            api.unmapCategorySpaceType(categoryId, spaceTypeId),
            'cat.targetingFailed',
            refreshFilter,
            handlers,
          );
        },

        // ── Space-type targeting ──
        mapSpaceType(categoryId: string, spaceTypeId: string, handlers?: MutationHandlers): void {
          run(
            api.mapCategorySpaceType(categoryId, spaceTypeId),
            'cat.targetingFailed',
            refreshFilter,
            handlers,
          );
        },
      };
    },
  ),
);
