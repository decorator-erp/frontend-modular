import { inject } from '@angular/core';
import type { HttpErrorResponse } from '@angular/common/http';
import { patchState, signalStore, withMethods, withState } from '@ngrx/signals';
import { map, switchMap } from 'rxjs/operators';
import { CrmSpaceService } from '../data/crm-space.service';
import { CrmBriefService } from '../data/crm-brief.service';
import { CrmLookupService } from '../data/crm-lookup.service';
import { ErrorHandlerService } from '@platform/http/error-handler.service';
import type { CatalogKey } from '@platform/i18n/catalog/en';
import { ApprovalState } from '../model/crm-enums';
import type {
  BriefSpace,
  CreateSpaceRequest,
  CrmSpace,
  CrmSpaceType,
  UpdateSpaceRequest,
} from '../model';
import type { MutationHandlers } from './mutation-handlers';

/**
 * Route-scoped state for a project's spaces page — the registry, plus the project brief so the
 * per-space brief note has something to bind. 009b #N-5: no space-item routes exist on the
 * backend, so the per-space board and completeness are gone. 009b #N-6: nor do reorder, delete
 * or the provisioning reads.
 *
 * The brief is loaded here (core is importable from any feature) and entries are indexed
 * by `spaceId`; the *current* entry for a space is the newest one not referenced by any
 * other entry's `supersedesSpaceId`.
 */

interface SpacesState {
  projectId: string | null;
  spaces: CrmSpace[];
  spaceTypes: CrmSpaceType[];
  /** The current (newest, not-superseded) brief entry per space id. */
  currentEntryBySpace: Record<string, BriefSpace>;
  briefId: string | null;
  loading: boolean;
  savingSpace: boolean;
  /** A catalog KEY, never prose — every consumer renders `catalog.t(error()!)`. */
  error: CatalogKey | null;
}

const INITIAL: SpacesState = {
  projectId: null,
  spaces: [],
  spaceTypes: [],
  currentEntryBySpace: {},
  briefId: null,
  loading: false,
  savingSpace: false,
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

  withMethods(
    (
      store,
      spacesApi = inject(CrmSpaceService),
      briefApi = inject(CrmBriefService),
      lookup = inject(CrmLookupService),
      errors = inject(ErrorHandlerService),
    ) => {
      return {
        /**
         * The full spaces-page load: the registry, the project brief, and the space-type
         * lookup. A screen that only needs one slice should set the project with
         * `setProject()` and call just the loader it needs.
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
            next: (spaces) => patchState(store, { spaces, loading: false }),
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

        setSpaceActive(spaceId: string, isActive: boolean): void {
          spacesApi.setActive(spaceId, isActive).subscribe({
            next: () => this.loadSpaces(),
            error: () => patchState(store, { error: 'space.statusFailed' }),
          });
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
            // The PUT overwrites all five fields (`CrmBriefSpace.cs:79`, positional
            // `UpdateBriefSpaceRequest`, `CrmBriefEndpoints.cs:261-262`): the ones this note
            // does not edit travel unchanged from the existing entry (FINDING-5-4).
            briefApi
              .updateSpace(existing.id, {
                spaceId: space.id,
                countOrPieces: existing.countOrPieces,
                requirements,
                meetingId: existing.meetingId,
                projectTaskId: existing.projectTaskId,
              })
              .subscribe(done);
          } else {
            briefApi.addSpace(briefId, body).subscribe(done);
          }
        },
      };
    },
  ),
);
