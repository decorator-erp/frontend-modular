import { HttpErrorResponse } from '@angular/common/http';
import { computed, inject } from '@angular/core';
import { patchState, signalStore, withComputed, withMethods, withState } from '@ngrx/signals';
import { injectReloadOnConflict } from '@platform/http/concurrency';
import { ErrorHandlerService, friendly } from '@platform/http/error-handler.service';
import { CrmItemService } from '../data/crm-item.service';
import { RequirementCategory } from '../model/crm-enums';
import type {
  AddRequirementItemRequest,
  ClientAddRequirementItemRequest,
  RequirementItem,
  UpdateRequirementItemRequest,
} from '../model';

export interface ItemsGroup {
  category: RequirementCategory;
  /** Current AND superseded — the superseded ones keep their trail, never removed. */
  items: RequirementItem[];
}

interface ItemsState {
  items: RequirementItem[];
  projectId: string | null;
  /** 1-based (app convention) — this endpoint has no `totalCount`, so paging is a client concern. */
  page: number;
  pageSize: number;
  loading: boolean;
  mutating: boolean;
  error: string | null;
}

const INITIAL: ItemsState = {
  items: [],
  projectId: null,
  page: 1,
  pageSize: 20,
  loading: false,
  mutating: false,
  error: null,
};

/** The requirement-items board for one project — feature-scoped, fresh per visit. */
export const ItemsStore = signalStore(
  withState<ItemsState>(INITIAL),

  withComputed((store) => ({
    /** Grouped by category (FR-024a) — current and superseded items together, trail retained. */
    groupedByCategory: computed<ItemsGroup[]>(() => {
      const groups = new Map<RequirementCategory, RequirementItem[]>();
      for (const item of store.items()) {
        const list = groups.get(item.category) ?? [];
        list.push(item);
        groups.set(item.category, list);
      }
      return [...groups.entries()]
        .sort((a, b) => a[0] - b[0])
        .map(([category, items]) => ({ category, items }));
    }),

    isSuperseded: computed(
      () => (item: RequirementItem) => store.items().some((i) => i.supersedesItemId === item.id),
    ),

    pagedItems: computed(() => {
      const start = (store.page() - 1) * store.pageSize();
      return store.items().slice(start, start + store.pageSize());
    }),
  })),

  withMethods(
    (
      store,
      api = inject(CrmItemService),
      errors = inject(ErrorHandlerService),
      reloadOnConflict = injectReloadOnConflict(),
    ) => {
      /**
       * 009b #24: a 409 `crm.items.ConcurrentUpdate` reloads the board (X-3) and leaves no error;
       * a coded error (`crm.periods.NotOpen`, `crm.items.AlreadyPending`, …) shows its message.
       */
      const failure = (err: unknown, projectId: string | null, fallback: string): string | null => {
        if (projectId && reloadOnConflict(err, () => methods.load(projectId))) return null;
        const parsed = err instanceof HttpErrorResponse ? errors.parse(err) : null;
        return parsed?.code ? friendly(parsed) : fallback;
      };
      const methods = {
        /**
         * Office load — every item for the project (client authorship included, per the ledger):
         * the project's periods, then each period's items (009b #23).
         */
        load(projectId: string): void {
          patchState(store, { loading: true, error: null, projectId });
          api.listByProject(projectId).subscribe({
            next: (items) => patchState(store, { items, loading: false }),
            error: () =>
              patchState(store, { loading: false, error: 'Could not load requirement items.' }),
          });
        },

        /** Client portal — the client's own items for one project. */
        loadPortal(projectId: string): void {
          patchState(store, { loading: true, error: null, projectId });
          api.portalSearch(projectId).subscribe({
            next: (items) => patchState(store, { items, loading: false }),
            error: () =>
              patchState(store, { loading: false, error: 'Could not load your requirements.' }),
          });
        },

        setPage(page: number): void {
          patchState(store, { page });
        },

        /** `POST /periods/{periodId}/items` (009b #22): the project rides in the request. */
        create(periodId: string, request: AddRequirementItemRequest): void {
          patchState(store, { mutating: true, error: null });
          api.create(periodId, request).subscribe({
            next: () => {
              patchState(store, { mutating: false });
              this.load(request.projectId);
            },
            error: () => patchState(store, { mutating: false, error: 'Could not add the item.' }),
          });
        },

        update(itemId: string, request: UpdateRequirementItemRequest): void {
          const projectId = store.projectId();
          patchState(store, { mutating: true, error: null });
          api.update(itemId, request).subscribe({
            next: () => {
              patchState(store, { mutating: false });
              if (projectId) this.load(projectId);
            },
            error: (err: unknown) =>
              patchState(store, {
                mutating: false,
                error: failure(err, projectId, 'Could not update the item.'),
              }),
          });
        },

        send(itemId: string): void {
          const projectId = store.projectId();
          patchState(store, { mutating: true, error: null });
          api.send(itemId).subscribe({
            next: () => {
              patchState(store, { mutating: false });
              if (projectId) this.load(projectId);
            },
            error: (err: unknown) =>
              patchState(store, {
                mutating: false,
                error: failure(err, projectId, 'Could not send the item.'),
              }),
          });
        },

        /** "New version…" — a locked item offers ONLY this (FR-010, SC-005). */
        supersede(itemId: string, request: UpdateRequirementItemRequest): void {
          const projectId = store.projectId();
          patchState(store, { mutating: true, error: null });
          api.supersede(itemId, request).subscribe({
            next: () => {
              patchState(store, { mutating: false });
              if (projectId) this.load(projectId);
            },
            error: (err: unknown) =>
              patchState(store, {
                mutating: false,
                error: failure(err, projectId, 'Could not add the new version.'),
              }),
          });
        },

        /** The client's own add-requirement (T087) — lands Trusted, no approval step (FR-012). */
        portalCreate(request: ClientAddRequirementItemRequest): void {
          patchState(store, { mutating: true, error: null });
          api.portalCreate(request).subscribe({
            next: () => {
              patchState(store, { mutating: false });
              this.loadPortal(request.projectId);
            },
            error: () =>
              patchState(store, { mutating: false, error: 'Could not add your requirement.' }),
          });
        },
      };
      return methods;
    },
  ),
);
