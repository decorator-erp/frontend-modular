import { computed, inject } from '@angular/core';
import type { HttpErrorResponse } from '@angular/common/http';
import { patchState, signalStore, withComputed, withMethods, withState } from '@ngrx/signals';
import type { Observable } from 'rxjs';
import { map, switchMap } from 'rxjs/operators';
import { CrmSpaceService } from '../data/crm-space.service';
import { CrmSpaceItemService } from '../data/crm-space-item.service';
import { CrmBriefService } from '../data/crm-brief.service';
import { CrmLookupService } from '../data/crm-lookup.service';
import { ErrorHandlerService } from '@platform/http/error-handler.service';
import type { CatalogKey } from '@platform/i18n/catalog/en';
import type { ParsedApiError } from '@platform/types';
import { ApprovalState, CrmProvisionStatus } from '../model/crm-enums';
import type {
  AddSpaceItemRequest,
  BriefSpace,
  CreateSpaceRequest,
  CrmSpace,
  CrmSpaceType,
  ProvisionGroup,
  ProvisionSummary,
  SetSpaceItemAttributeValuesRequest,
  SetSpaceItemStatusRequest,
  SpaceCompleteness,
  SpaceItem,
  UpdateSpaceRequest,
} from '../model';
import type { MutationHandlers } from './mutation-handlers';

/**
 * Route-scoped state for a project's spaces page — the registry, each space's board,
 * completeness and provisioning, plus the project brief so the per-space brief note has
 * something to bind.
 *
 * The brief is loaded here (core is importable from any feature) and entries are indexed
 * by `spaceId`; the *current* entry for a space is the newest one not referenced by any
 * other entry's `supersedesSpaceId`. Board mutations refetch the affected space.
 */

interface SpacesState {
  projectId: string | null;
  spaces: CrmSpace[];
  spaceTypes: CrmSpaceType[];
  boardBySpace: Record<string, SpaceItem[]>;
  completenessBySpace: Record<string, SpaceCompleteness>;
  provisioning: ProvisionGroup[];
  provisioningSummary: ProvisionSummary[];
  /** The current (newest, not-superseded) brief entry per space id. */
  currentEntryBySpace: Record<string, BriefSpace>;
  briefId: string | null;
  loading: boolean;
  savingSpace: boolean;
  mutatingBySpace: Record<string, boolean>;
  /** A catalog KEY, never prose — every consumer renders `catalog.t(error()!)`. */
  error: CatalogKey | null;
}

const INITIAL: SpacesState = {
  projectId: null,
  spaces: [],
  spaceTypes: [],
  boardBySpace: {},
  completenessBySpace: {},
  provisioning: [],
  provisioningSummary: [],
  currentEntryBySpace: {},
  briefId: null,
  loading: false,
  savingSpace: false,
  mutatingBySpace: {},
  error: null,
};

/**
 * Index the current (newest, not-superseded) entry per space id.
 *
 * Exported for its spec: this encodes the ledger's trust rule (an entry chained over by a
 * newer one is history, not current) and is worth pinning down independently of the store.
 * The entries arrive newest first and carry `isCurrent` (009b #11): there is no `createdAtUtc`, so
 * the first current entry seen for a space is its newest.
 */
export function indexCurrentEntries(spaces: BriefSpace[]): Record<string, BriefSpace> {
  const superseded = new Set(
    spaces.map((s) => s.supersedesSpaceId).filter((x): x is string => !!x),
  );
  const bySpace: Record<string, BriefSpace> = {};
  for (const entry of spaces) {
    const spaceId = entry.space?.id;
    if (!spaceId || !entry.isCurrent || superseded.has(entry.id)) continue;
    if (!bySpace[spaceId]) bySpace[spaceId] = entry;
  }
  return bySpace;
}

export const SpacesStore = signalStore(
  withState<SpacesState>(INITIAL),

  withComputed((store) => ({
    incompleteSpaceIds: computed(() => {
      const map = store.completenessBySpace();
      return new Set(
        Object.values(map)
          .filter((c) => !c.isComplete)
          .map((c) => c.spaceId),
      );
    }),
  })),

  withMethods(
    (
      store,
      spacesApi = inject(CrmSpaceService),
      itemsApi = inject(CrmSpaceItemService),
      briefApi = inject(CrmBriefService),
      lookup = inject(CrmLookupService),
      errors = inject(ErrorHandlerService),
    ) => {
      const setMutating = (spaceId: string, on: boolean): void =>
        patchState(store, (s) => ({ mutatingBySpace: { ...s.mutatingBySpace, [spaceId]: on } }));

      const loadBoard = (spaceId: string): void => {
        itemsApi.list(spaceId).subscribe({
          next: (items) =>
            patchState(store, (s) => ({ boardBySpace: { ...s.boardBySpace, [spaceId]: items } })),
          error: () => patchState(store, { error: 'space.boardLoadFailed' }),
        });
      };

      const loadCompleteness = (spaceId: string): void => {
        itemsApi.completeness(spaceId).subscribe({
          next: (c) =>
            patchState(store, (s) => ({
              completenessBySpace: { ...s.completenessBySpace, [spaceId]: c },
            })),
          error: () => patchState(store, { error: 'space.completenessFailed' }),
        });
      };

      /**
       * Board mutation: flag the space, refetch its board + completeness on success.
       *
       * `handlers.onError` gets the PARSED server error so a caller can name the reason — the
       * picker renders it per row, which per-space `mutatingBySpace` could never express.
       */
      const mutateBoard = (
        spaceId: string,
        obs: Observable<unknown>,
        errorKey: CatalogKey,
        handlers?: MutationHandlers,
      ): void => {
        setMutating(spaceId, true);
        obs.subscribe({
          next: () => {
            setMutating(spaceId, false);
            loadBoard(spaceId);
            loadCompleteness(spaceId);
            handlers?.onDone?.();
          },
          error: (err: HttpErrorResponse) => {
            setMutating(spaceId, false);
            patchState(store, { error: errorKey });
            handlers?.onError?.(errors.parse(err), errorKey);
          },
        });
      };

      return {
        /**
         * The full spaces-page load: registry + every space's board and completeness, the
         * project brief, and the space-type lookup. Expensive by design — a screen that
         * only needs one slice should set the project with `setProject()` and call just
         * the loader it needs (see the provisioning page).
         */
        load(projectId: string): void {
          patchState(store, { projectId, loading: true, error: null });
          this.loadSpaces();
          this.loadBrief();
          lookup.spaceTypes().subscribe({
            next: (spaceTypes) => patchState(store, { spaceTypes }),
            error: () => patchState(store, { error: 'space.typesLoadFailed' }),
          });
        },

        /** Point the store at a project WITHOUT fetching anything. */
        setProject(projectId: string): void {
          patchState(store, { projectId, error: null });
        },

        loadSpaces(): void {
          const projectId = store.projectId();
          if (!projectId) return;
          patchState(store, { loading: true });
          spacesApi.list(projectId).subscribe({
            next: (spaces) => {
              patchState(store, { spaces, loading: false });
              for (const space of spaces) {
                loadBoard(space.id);
                loadCompleteness(space.id);
              }
            },
            error: () => patchState(store, { loading: false, error: 'space.loadFailed' }),
          });
        },

        loadBrief(): void {
          const projectId = store.projectId();
          if (!projectId) return;
          briefApi
            .getBrief(projectId)
            .pipe(
              switchMap((head) =>
                briefApi.listSpaces(head.id, projectId).pipe(map((spaces) => ({ head, spaces }))),
              ),
            )
            .subscribe({
              next: ({ head, spaces }) =>
                patchState(store, {
                  briefId: head.id || null,
                  currentEntryBySpace: indexCurrentEntries(spaces),
                }),
              error: () => patchState(store, { error: 'space.briefLoadFailed' }),
            });
        },

        loadProvisioning(status?: CrmProvisionStatus | null): void {
          const projectId = store.projectId();
          if (!projectId) return;
          patchState(store, { loading: true });
          spacesApi.provisioning(projectId, status).subscribe({
            next: (provisioning) => patchState(store, { provisioning, loading: false }),
            error: () => patchState(store, { loading: false, error: 'space.provLoadFailed' }),
          });
        },

        loadProvisioningSummary(): void {
          const projectId = store.projectId();
          if (!projectId) return;
          spacesApi.provisioningSummary(projectId).subscribe({
            next: (provisioningSummary) => patchState(store, { provisioningSummary }),
            error: () => patchState(store, { error: 'space.provLoadFailed' }),
          });
        },

        board(spaceId: string): SpaceItem[] {
          return store.boardBySpace()[spaceId] ?? [];
        },

        completeness(spaceId: string): SpaceCompleteness | undefined {
          return store.completenessBySpace()[spaceId];
        },

        currentEntryFor(spaceId: string): BriefSpace | undefined {
          return store.currentEntryBySpace()[spaceId];
        },

        // ── Space registry mutations ──────────────────────────────────────
        createSpace(request: CreateSpaceRequest, handlers?: MutationHandlers): void {
          const projectId = store.projectId();
          if (!projectId) return;
          patchState(store, { savingSpace: true, error: null });
          spacesApi.create(projectId, request).subscribe({
            next: () => {
              patchState(store, { savingSpace: false });
              this.loadSpaces();
              handlers?.onDone?.();
            },
            error: (err: HttpErrorResponse) => {
              patchState(store, { savingSpace: false, error: 'space.saveFailed' });
              handlers?.onError?.(errors.parse(err), 'space.saveFailed');
            },
          });
        },

        renameSpace(
          spaceId: string,
          request: UpdateSpaceRequest,
          handlers?: MutationHandlers,
        ): void {
          patchState(store, { savingSpace: true, error: null });
          spacesApi.update(spaceId, request).subscribe({
            next: () => {
              patchState(store, { savingSpace: false });
              this.loadSpaces();
              handlers?.onDone?.();
            },
            error: (err: HttpErrorResponse) => {
              patchState(store, { savingSpace: false, error: 'space.saveFailed' });
              handlers?.onError?.(errors.parse(err), 'space.saveFailed');
            },
          });
        },

        /**
         * Optimistic sibling reorder (Move up/down) with rollback — mirrors
         * `CatalogAdminStore.reorderChild`. `direction` is -1 or +1.
         */
        reorderSpace(spaceId: string, direction: -1 | 1): void {
          const projectId = store.projectId();
          if (!projectId) return;
          const ordered = [...store.spaces()].sort((a, b) => a.sortOrder - b.sortOrder);
          const index = ordered.findIndex((s) => s.id === spaceId);
          const target = index + direction;
          if (index < 0 || target < 0 || target >= ordered.length) return;

          [ordered[index], ordered[target]] = [ordered[target], ordered[index]];
          const items = ordered.map((s, i) => ({ id: s.id, sortOrder: i }));
          const order = new Map(items.map((it) => [it.id, it.sortOrder]));

          const snapshot = store.spaces();
          patchState(store, {
            spaces: snapshot
              .map((s) => (order.has(s.id) ? { ...s, sortOrder: order.get(s.id)! } : s))
              .sort((a, b) => a.sortOrder - b.sortOrder),
          });

          spacesApi.reorder(projectId, { items }).subscribe({
            error: () => patchState(store, { spaces: snapshot, error: 'space.saveFailed' }),
          });
        },

        setSpaceActive(spaceId: string, isActive: boolean): void {
          spacesApi.setActive(spaceId, isActive).subscribe({
            next: () => this.loadSpaces(),
            error: () => patchState(store, { error: 'space.statusFailed' }),
          });
        },

        deleteSpace(spaceId: string): void {
          spacesApi.remove(spaceId).subscribe({
            next: () => this.loadSpaces(),
            error: () => patchState(store, { error: 'space.inUse' }),
          });
        },

        // ── Board mutations ───────────────────────────────────────────────
        /** Either a catalog item or a custom entry — see {@link AddSpaceItemRequest}. */
        addItem(spaceId: string, request: AddSpaceItemRequest, handlers?: MutationHandlers): void {
          mutateBoard(spaceId, itemsApi.add(spaceId, request), 'space.itemSaveFailed', handlers);
        },
        /**
         * The custom-entry path, named for what it does at the call site rather than
         * making every caller assemble the union's custom variant by hand.
         */
        addCustomItem(
          spaceId: string,
          categoryId: string,
          name: string,
          handlers?: MutationHandlers,
        ): void {
          mutateBoard(
            spaceId,
            itemsApi.add(spaceId, { customName: name, customCategoryId: categoryId }),
            'space.itemSaveFailed',
            handlers,
          );
        },
        /**
         * Turn a custom row into a reference to a real catalog item. `crm.catalog.manage`,
         * not `crm.spaces.manage` — gate the affordance accordingly.
         */
        promoteItem(
          spaceId: string,
          itemId: string,
          catalogItemId: string,
          handlers?: MutationHandlers,
        ): void {
          mutateBoard(
            spaceId,
            itemsApi.promote(spaceId, itemId, { catalogItemId }),
            'space.itemSaveFailed',
            handlers,
          );
        },
        setItemStatus(spaceId: string, itemId: string, request: SetSpaceItemStatusRequest): void {
          mutateBoard(
            spaceId,
            itemsApi.setStatus(spaceId, itemId, request),
            'space.itemSaveFailed',
          );
        },
        /**
         * The pencil is hidden for a custom row (it inherits no catalog attributes), but
         * this guards the path anyway rather than trusting the UI alone: a custom item
         * short-circuits here, surfaced through the SAME `AttributeNotApplicable` key a
         * 409 from this same call would map to via `domainErrorKey`, with no network
         * round trip and no board refetch — nothing changed, so nothing to reload.
         */
        setItemAttributes(
          spaceId: string,
          itemId: string,
          request: SetSpaceItemAttributeValuesRequest,
          handlers?: MutationHandlers,
        ): void {
          const item = store.boardBySpace()[spaceId]?.find((i) => i.id === itemId);
          if (item?.isCustom) {
            const errorKey: CatalogKey = 'space.attrNotApplicable';
            const parsed: ParsedApiError = {
              status: 0,
              generalMessage: '',
              fieldErrors: {},
              code: 'crm.catalog.AttributeNotApplicable',
              raw: null,
            };
            patchState(store, { error: errorKey });
            handlers?.onError?.(parsed, errorKey);
            return;
          }
          mutateBoard(
            spaceId,
            itemsApi.setAttributes(spaceId, itemId, request),
            'space.itemSaveFailed',
            handlers,
          );
        },
        removeItem(spaceId: string, itemId: string): void {
          mutateBoard(spaceId, itemsApi.remove(spaceId, itemId), 'space.itemRemoveFailed');
        },

        // ── Brief note (routes through the existing brief commands) ────────
        //
        // No entry → create one preset to this space; Draft/Rejected → edit in place.
        saveSpaceNote(space: CrmSpace, requirements: string, handlers?: MutationHandlers): void {
          const briefId = store.briefId();
          if (!briefId) return;
          const existing = store.currentEntryBySpace()[space.id];

          // An Approved entry is locked forever — the caller opens the supersede modal
          // instead of saving. Return BEFORE raising `savingSpace`, or the flag would
          // never clear (no request is issued on this path) and would wedge every other
          // consumer of it: create space, rename space, and the note's own Save button.
          if (existing && existing.approvalStatus === ApprovalState.Approved) return;

          patchState(store, { savingSpace: true, error: null });
          const done = {
            next: () => {
              patchState(store, { savingSpace: false });
              this.loadBrief();
              handlers?.onDone?.();
            },
            error: (err: HttpErrorResponse) => {
              patchState(store, { savingSpace: false, error: 'space.noteSaveFailed' });
              handlers?.onError?.(errors.parse(err), 'space.noteSaveFailed');
            },
          };
          const body = { spaceId: space.id, requirements };
          if (existing) {
            briefApi.updateSpace(existing.id, body).subscribe(done);
          } else {
            briefApi.addSpace(briefId, body).subscribe(done);
          }
        },
      };
    },
  ),
);
