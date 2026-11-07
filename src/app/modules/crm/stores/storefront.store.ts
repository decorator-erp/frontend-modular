import { inject } from '@angular/core';
import { HttpErrorResponse } from '@angular/common/http';
import { patchState, signalStore, withMethods, withState } from '@ngrx/signals';
import { forkJoin, of } from 'rxjs';
import { map, switchMap } from 'rxjs/operators';
import { ErrorHandlerService, friendly } from '@platform/http/error-handler.service';
import { injectReloadOnConflict } from '@platform/http/concurrency';
import type { CatalogKey } from '@platform/i18n/catalog/en';
import { CrmStorefrontService } from '../data/crm-storefront.service';
import { CrmCatalogService } from '../data/crm-catalog.service';
import type {
  AddSpaceSelectionRequest,
  CatalogAttribute,
  CatalogAttributeOption,
  CatalogCategory,
  CatalogItem,
  SpaceSelection,
} from '../model';
import type { MutationHandlers } from './mutation-handlers';

/** One attribute of the picked item's category chain with its ACTIVE options (only those with any). */
export interface StorefrontAttributeChoice {
  attribute: CatalogAttribute;
  options: CatalogAttributeOption[];
}

interface StorefrontState {
  spaceId: string | null;
  spaceTypeId: string | null;
  selections: SpaceSelection[];
  loading: boolean;
  notFound: boolean;
  loadError: CatalogKey | null;
  /** In-flight guard for every write. */
  saving: boolean;
  /** The last write's error, already prose (`friendly`). */
  actionError: string | null;
  // ── picker (the catalog read under the space's type) ──
  categories: CatalogCategory[];
  items: CatalogItem[];
  attributes: StorefrontAttributeChoice[];
  pickerLoading: boolean;
  pickerError: CatalogKey | null;
}

const INITIAL: StorefrontState = {
  spaceId: null,
  spaceTypeId: null,
  selections: [],
  loading: false,
  notFound: false,
  loadError: null,
  saving: false,
  actionError: null,
  categories: [],
  items: [],
  attributes: [],
  pickerLoading: false,
  pickerError: null,
};

/**
 * crmp C-6: one space's storefront picks (contract §2.9.1 #110–#114), provided per panel. The
 * picker reads the catalog tree filtered to the space's type (`tree?spaceTypeId`), the picked
 * category's items, and the item category chain's attributes with their active options. Writes are
 * not optimistic: the list reloads after the server answers. 409 `crm.storefront.ConcurrentUpdate`
 * reloads through `injectReloadOnConflict()`; 400 `crm.storefront.InvalidOrder` reloads too.
 */
export const StorefrontStore = signalStore(
  withState<StorefrontState>(INITIAL),
  withMethods(
    (
      store,
      api = inject(CrmStorefrontService),
      catalogApi = inject(CrmCatalogService),
      errors = inject(ErrorHandlerService),
      reloadOnConflict = injectReloadOnConflict(),
    ) => {
      const fail = (err: unknown, fallback: CatalogKey, handlers?: MutationHandlers): void => {
        patchState(store, { saving: false });
        if (reloadOnConflict(err, () => methods.reload())) return;
        if (!(err instanceof HttpErrorResponse)) return;
        const parsed = errors.parse(err);
        if (parsed.code === 'crm.storefront.InvalidOrder') methods.reload();
        patchState(store, { actionError: friendly(parsed) });
        handlers?.onError?.(parsed, fallback);
      };

      const methods = {
        load(spaceId: string, spaceTypeId: string): void {
          patchState(store, { ...INITIAL, spaceId, spaceTypeId });
          methods.reload();
          methods.loadCategories();
        },

        reload(): void {
          const spaceId = store.spaceId();
          if (!spaceId) return;
          patchState(store, { loading: true, loadError: null, notFound: false });
          api.list(spaceId).subscribe({
            next: (selections) => patchState(store, { selections, loading: false }),
            error: (err: unknown) => {
              const notFound = err instanceof HttpErrorResponse && err.status === 404;
              patchState(store, {
                loading: false,
                notFound,
                loadError: notFound ? null : 'storefront.loadFailed',
              });
            },
          });
        },

        loadCategories(): void {
          const spaceTypeId = store.spaceTypeId();
          if (!spaceTypeId) return;
          patchState(store, { pickerLoading: true, pickerError: null });
          catalogApi.treeForSpaceType(spaceTypeId).subscribe({
            next: (categories) => patchState(store, { categories, pickerLoading: false }),
            error: () =>
              patchState(store, { pickerLoading: false, pickerError: 'storefront.catalogFailed' }),
          });
        },

        pickCategory(categoryId: string | null): void {
          patchState(store, { items: [], attributes: [] });
          if (!categoryId) return;
          patchState(store, { pickerLoading: true, pickerError: null });
          catalogApi.itemsByCategory(categoryId).subscribe({
            next: (items) =>
              patchState(store, { items: items.filter((i) => i.isActive), pickerLoading: false }),
            error: () =>
              patchState(store, { pickerLoading: false, pickerError: 'storefront.catalogFailed' }),
          });
        },

        /** The item category chain's active attributes, each with its active options. */
        pickItem(item: CatalogItem | null): void {
          patchState(store, { attributes: [] });
          if (!item) return;
          patchState(store, { pickerLoading: true, pickerError: null });
          catalogApi
            .effectiveAttributes(item.categoryId)
            .pipe(
              map((attrs) => attrs.filter((a) => a.isActive)),
              switchMap((attrs) =>
                attrs.length === 0
                  ? of<StorefrontAttributeChoice[]>([])
                  : forkJoin(
                      attrs.map((attribute) =>
                        catalogApi.attributeOptions(attribute.id).pipe(
                          map((options) => ({
                            attribute,
                            options: options.filter((o) => o.isActive),
                          })),
                        ),
                      ),
                    ),
              ),
            )
            .subscribe({
              next: (choices) =>
                patchState(store, {
                  attributes: choices.filter((c) => c.options.length > 0),
                  pickerLoading: false,
                }),
              error: () =>
                patchState(store, {
                  pickerLoading: false,
                  pickerError: 'storefront.catalogFailed',
                }),
            });
        },

        add(request: AddSpaceSelectionRequest, handlers?: MutationHandlers): void {
          const spaceId = store.spaceId();
          if (!spaceId || store.saving()) return;
          patchState(store, { saving: true, actionError: null });
          api.add(spaceId, request).subscribe({
            next: () => {
              patchState(store, { saving: false });
              methods.reload();
              handlers?.onDone?.();
            },
            error: (err: unknown) => fail(err, 'storefront.saveFailed', handlers),
          });
        },

        /** One step up (-1) or down (+1); sends EVERY selection id (#112). */
        move(selectionId: string, step: -1 | 1, handlers?: MutationHandlers): void {
          const spaceId = store.spaceId();
          if (!spaceId || store.saving()) return;
          const order = store.selections().map((s) => s.id);
          const i = order.indexOf(selectionId);
          const j = i + step;
          if (i < 0 || j < 0 || j >= order.length) return;
          [order[i], order[j]] = [order[j], order[i]];
          patchState(store, { saving: true, actionError: null });
          api.reorder(spaceId, order).subscribe({
            next: () => {
              patchState(store, { saving: false });
              methods.reload();
              handlers?.onDone?.();
            },
            error: (err: unknown) => fail(err, 'storefront.reorderFailed', handlers),
          });
        },

        remove(selectionId: string, handlers?: MutationHandlers): void {
          const spaceId = store.spaceId();
          if (!spaceId || store.saving()) return;
          patchState(store, { saving: true, actionError: null });
          api.remove(spaceId, selectionId).subscribe({
            next: () => {
              patchState(store, { saving: false });
              methods.reload();
              handlers?.onDone?.();
            },
            error: (err: unknown) => {
              if (err instanceof HttpErrorResponse && err.status === 404) methods.reload();
              fail(err, 'storefront.removeFailed', handlers);
            },
          });
        },
      };
      return methods;
    },
  ),
);
