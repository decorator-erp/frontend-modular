import { computed, inject } from '@angular/core';
import { HttpErrorResponse } from '@angular/common/http';
import { patchState, signalStore, withComputed, withMethods, withState } from '@ngrx/signals';
import { Subscription, of } from 'rxjs';
import { catchError } from 'rxjs/operators';
import { CrmBriefService } from '../data/crm-brief.service';
import { ErrorHandlerService, friendly } from '@platform/http/error-handler.service';
import { injectReloadOnConflict } from '@platform/http/concurrency';
import type { ParsedApiError } from '@platform/types';
import { ApprovalState } from '../model/crm-enums';
import type {
  BriefHead,
  BriefHeadData,
  BriefRound,
  BriefSpace,
  BriefSpaceRef,
  BriefSpaceRequest,
  UpdateBriefHeadRequest,
} from '../model';

export interface BriefSpaceGroup {
  /** The room this group is for — `null` = the "General" (project-wide) group. */
  space: BriefSpaceRef | null;
  /** Current AND superseded entries, trail retained. */
  entries: BriefSpace[];
}

interface BriefState {
  projectId: string | null;
  /** The stage whose brief is loaded (009b #9); `null` = the obsolete project fallback (N-11). */
  stageId: string | null;
  head: BriefHead | null;
  /** 404 `crm.briefs.NotFound` on load: the stage has no brief yet — offer "Create brief" (009b #10). */
  noBrief: boolean;
  creating: boolean;
  spaces: BriefSpace[];
  /** The head's rounds (`GET /briefs/{id}/rounds`, 009b #14) — the round NUMBER lives here, not on the head. */
  rounds: BriefRound[];
  /** The client's sent round, off the portal head (009b #43) — the client never reads the rounds route. */
  portalRound: number;
  /** The portal brief's head is `null`: nothing has been sent to the client yet (009b #43). */
  nothingSent: boolean;
  loading: boolean;
  savingHead: boolean;
  sending: boolean;
  mutatingSpace: boolean;
  error: string | null;
}

const INITIAL: BriefState = {
  projectId: null,
  stageId: null,
  head: null,
  noBrief: false,
  creating: false,
  spaces: [],
  rounds: [],
  portalRound: 0,
  nothingSent: false,
  loading: false,
  savingHead: false,
  sending: false,
  mutatingSpace: false,
  error: null,
};

const GENERAL_KEY = '__general__';

/**
 * The brief for one project — the head AND the unified gathering ledger (FR-024a).
 * Feature-scoped, fresh per visit (the `notification.store.ts` idiom).
 * **`rxMethod` is used nowhere in this repo and is not introduced here.**
 */
export const BriefStore = signalStore(
  withState<BriefState>(INITIAL),

  withComputed((store) => ({
    /**
     * The round the head is currently on — the last entry of its rounds list (009b #14, C §8.2.2),
     * since `CrmDesignBriefResponse` carries no round. 0 ⇒ never sent (an empty list).
     */
    headRound: computed(() => store.rounds().at(-1)?.round ?? store.portalRound()),

    /** Send is disabled while a round is outstanding (FR-014) — the head's own status IS that fact. */
    isHeadRoundOutstanding: computed(() => store.head()?.status === ApprovalState.PendingApproval),

    /**
     * ONE unified ledger, grouped by space (feature 006). A null-space entry lands in
     * the "General" group. Includes superseded entries in the same group, trail retained.
     */
    groupedBySpace: computed<BriefSpaceGroup[]>(() => {
      const groups = new Map<string, BriefSpaceGroup>();

      for (const entry of store.spaces()) {
        const key = entry.space?.id ?? GENERAL_KEY;
        const existing = groups.get(key);
        if (existing) {
          existing.entries.push(entry);
        } else {
          groups.set(key, { space: entry.space, entries: [entry] });
        }
      }

      // Rooms A→Z; the "General" group sorts last.
      return [...groups.values()].sort((a, b) => {
        if (!a.space) return 1;
        if (!b.space) return -1;
        return a.space.name.localeCompare(b.space.name);
      });
    }),
  })),

  withMethods(
    (
      store,
      api = inject(CrmBriefService),
      errors = inject(ErrorHandlerService),
      reloadOnConflict = injectReloadOnConflict(),
      /** The in-flight `load()`: a newer load cancels it, so a stale head never lands (FINDING-5-5). */
      inFlight = { load: new Subscription() },
    ) => ({
      /**
       * Loads the stage's brief head (009b #9) — or, with no stage, the project's latest through the
       * obsolete project route (N-11) — then its entries (`GET /briefs/{id}/spaces`, 009b #11) and its
       * rounds (`GET /briefs/{id}/rounds`, 009b #14).
       */
      load(projectId: string, stageId: string | null = null): void {
        inFlight.load.unsubscribe();
        const load = new Subscription();
        inFlight.load = load;
        patchState(store, { loading: true, error: null, noBrief: false, projectId, stageId });
        const head$ = stageId ? api.getBriefByStage(stageId) : api.getBrief(projectId);
        // Entries and rounds land only while their brief is still the loaded head (FINDING-5-5).
        const isCurrent = (briefId: string) => store.head()?.id === briefId;
        const sub = head$.subscribe({
          next: (head) => {
            patchState(store, { head, loading: false });
            load.add(
              api
                .listSpaces(head.id, head.projectId || projectId)
                .pipe(catchError(() => of<BriefSpace[]>([])))
                .subscribe((spaces) => {
                  if (isCurrent(head.id)) patchState(store, { spaces });
                }),
            );
            load.add(
              api
                .listRounds(head.id)
                .pipe(catchError(() => of<BriefRound[]>([])))
                .subscribe((rounds) => {
                  if (isCurrent(head.id)) patchState(store, { rounds });
                }),
            );
          },
          error: (err: unknown) => {
            const noBrief =
              err instanceof HttpErrorResponse &&
              err.status === 404 &&
              errors.parse(err).code === 'crm.briefs.NotFound';
            patchState(store, {
              loading: false,
              head: null,
              spaces: [],
              rounds: [],
              noBrief,
              error: noBrief ? null : 'Could not load the brief.',
            });
          },
        });
        load.add(sub);
      },

      /**
       * "Create brief" on a stage that has none (009b #10): `POST /projects/{projectId}/brief`, then
       * loads the new brief by its stage. A failure shows the code's catalog message.
       */
      createBrief(stageId: string, data: BriefHeadData): void {
        const projectId = store.projectId();
        if (!projectId) return;
        patchState(store, { creating: true, error: null });
        api.createBrief(projectId, { data, projectStageId: stageId }).subscribe({
          next: () => {
            patchState(store, { creating: false });
            this.load(projectId, stageId);
          },
          error: (err: unknown) =>
            patchState(store, {
              creating: false,
              error:
                err instanceof HttpErrorResponse
                  ? friendly(errors.parse(err))
                  : 'Could not create the brief.',
            }),
        });
      },

      /** Re-reads the brief that is loaded now — same project, same stage. */
      reload(): void {
        const projectId = store.projectId();
        if (projectId) this.load(projectId, store.stageId());
      },

      /**
       * The client's own read of their brief (T111's brief tab). Skips the rounds read — the
       * office route is gated `crm.briefs.read` — so `headRound` is the portal head's own `round`
       * (009b #43). A `null` head is `nothingSent`; 404 `crm.portal.NotFound` and 403
       * `crm.portal.NotAClient` / `crm.access.NoStanding` show their catalog message.
       */
      loadAsClient(projectId: string): void {
        patchState(store, { loading: true, error: null, nothingSent: false, projectId });
        api.getMyBrief(projectId).subscribe({
          next: (view) =>
            patchState(store, {
              head: view.head,
              spaces: view.spaces,
              portalRound: view.head?.round ?? 0,
              nothingSent: view.head === null,
              loading: false,
            }),
          error: (err: unknown) => {
            const parsed = err instanceof HttpErrorResponse ? errors.parse(err) : null;
            patchState(store, {
              loading: false,
              head: null,
              spaces: [],
              error: parsed?.code ? friendly(parsed) : 'Could not load your brief.',
            });
          },
        });
      },

      /**
       * Edit the loaded head (009b #12, keyed by its brief id) — the round does NOT move (FR-009).
       * 409 `crm.briefs.ConcurrencyConflict` reloads (X-3); a coded failure (e.g.
       * `HeadLockedPendingApproval`) shows its catalog message; `onError` gets the parsed error so
       * the form can place the `Data.<Field>` validation keys.
       */
      updateHead(
        request: UpdateBriefHeadRequest,
        handlers?: { onError?: (error: ParsedApiError) => void },
      ): void {
        const head = store.head();
        if (!head) return;
        patchState(store, { savingHead: true, error: null });
        api.updateHead(head.id, request).subscribe({
          next: () => {
            patchState(store, { savingHead: false });
            this.reload();
          },
          error: (err: unknown) => {
            if (reloadOnConflict(err, () => this.reload())) {
              patchState(store, { savingHead: false });
              return;
            }
            const parsed = err instanceof HttpErrorResponse ? errors.parse(err) : null;
            patchState(store, {
              savingHead: false,
              error: parsed?.code ? friendly(parsed) : 'Could not save the brief head.',
            });
            if (parsed) handlers?.onError?.(parsed);
          },
        });
      },

      /**
       * Send the head for confirmation (`PUT /briefs/{id}/send`, 009b #13) — THIS is what advances
       * the round (FR-009): it opens round n+1.
       */
      sendForConfirmation(): void {
        const head = store.head();
        const projectId = store.projectId();
        if (!head || !projectId) return;
        patchState(store, { sending: true, error: null });
        api.sendForConfirmation(head.id).subscribe({
          next: () => {
            patchState(store, { sending: false });
            this.reload();
          },
          error: (err: unknown) => {
            // 409 crm.briefs.ConcurrentSend / ConcurrencyConflict: reload (X-3, 009b #13).
            if (reloadOnConflict(err, () => this.reload())) {
              patchState(store, { sending: false });
              return;
            }
            // NotSendable, TooManyVoidedRounds, NotPending, approvals.OpenApprovalExists /
            // ApprovalIdInUse, 404 crm.clients.NotFound: the code's catalog message.
            const parsed = err instanceof HttpErrorResponse ? errors.parse(err) : null;
            patchState(store, {
              sending: false,
              error: parsed?.code ? friendly(parsed) : 'Could not send the brief for confirmation.',
            });
          },
        });
      },

      /** Add a gathering entry (a space entry, or general/project-wide). */
      addSpace(request: BriefSpaceRequest): void {
        const head = store.head();
        const projectId = store.projectId();
        if (!head || !projectId) return;
        patchState(store, { mutatingSpace: true, error: null });
        api.addSpace(head.id, request).subscribe({
          next: () => {
            patchState(store, { mutatingSpace: false });
            this.reload();
          },
          error: (err: unknown) =>
            patchState(store, {
              mutatingSpace: false,
              error: codedOr(err, errors, 'Could not add the entry.'),
            }),
        });
      },

      /** Update a Draft/Rejected entry in place. */
      updateSpace(spaceId: string, request: BriefSpaceRequest): void {
        const projectId = store.projectId();
        if (!projectId) return;
        patchState(store, { mutatingSpace: true, error: null });
        api.updateSpace(spaceId, request).subscribe({
          next: () => {
            patchState(store, { mutatingSpace: false });
            this.reload();
          },
          error: () =>
            patchState(store, { mutatingSpace: false, error: 'Could not update the entry.' }),
        });
      },

      /** Send one entry for the client's confirmation. */
      sendSpace(spaceId: string): void {
        const projectId = store.projectId();
        if (!projectId) return;
        patchState(store, { mutatingSpace: true, error: null });
        api.sendSpace(spaceId).subscribe({
          next: () => {
            patchState(store, { mutatingSpace: false });
            this.reload();
          },
          error: () =>
            patchState(store, { mutatingSpace: false, error: 'Could not send the entry.' }),
        });
      },

      /** "New version…" — append a superseding entry. Server reports nothing back but a bare id. */
      supersedeSpace(spaceId: string, request: BriefSpaceRequest): void {
        const projectId = store.projectId();
        if (!projectId) return;
        patchState(store, { mutatingSpace: true, error: null });
        api.supersedeSpace(spaceId, request).subscribe({
          next: () => {
            patchState(store, { mutatingSpace: false });
            this.reload();
          },
          error: (err: unknown) =>
            patchState(store, {
              mutatingSpace: false,
              error: codedOr(err, errors, 'Could not add the new version.'),
            }),
        });
      },
    }),
  ),
);

/** FINDING-5-7: a coded failure (e.g. a handled 403) shows its catalog message, else `fallback`. */
function codedOr(err: unknown, errors: ErrorHandlerService, fallback: string): string {
  const parsed = err instanceof HttpErrorResponse ? errors.parse(err) : null;
  return parsed?.code ? friendly(parsed) : fallback;
}
