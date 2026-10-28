import { computed, inject } from '@angular/core';
import { HttpErrorResponse } from '@angular/common/http';
import { patchState, signalStore, withComputed, withMethods, withState } from '@ngrx/signals';
import { of } from 'rxjs';
import { catchError } from 'rxjs/operators';
import { CrmApprovalsService } from '../data/crm-approvals.service';
import { CrmBriefService } from '../data/crm-brief.service';
import { ErrorHandlerService, friendly } from '@platform/http/error-handler.service';
import { ApprovalState, ApprovalSubjectType } from '../model/crm-enums';
import type {
  ApprovalTrailItem,
  BriefHead,
  BriefHeadData,
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
  /** The head's own approval trail — round NUMBER lives here, not on the head itself. */
  headTrail: ApprovalTrailItem[];
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
  headTrail: [],
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
     * The round the head is currently on — derived from its OWN approval trail, since
     * the head entity carries no round field (only the diff endpoint and the trail do).
     * 0 ⇒ never sent (still Draft, no approval row exists yet).
     */
    headRound: computed(() => store.headTrail().reduce((max, t) => Math.max(max, t.round), 0)),

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
      approvals = inject(CrmApprovalsService),
      errors = inject(ErrorHandlerService),
    ) => ({
      /**
       * Loads the stage's brief head (009b #9) — or, with no stage, the project's latest through the
       * obsolete project route (N-11) — then its entries (`GET /briefs/{id}/spaces`, 009b #11) and the
       * head's own approval trail (for its round).
       */
      load(projectId: string, stageId: string | null = null): void {
        patchState(store, { loading: true, error: null, noBrief: false, projectId, stageId });
        const head$ = stageId ? api.getBriefByStage(stageId) : api.getBrief(projectId);
        head$.subscribe({
          next: (head) => {
            patchState(store, { head, loading: false });
            api
              .listSpaces(head.id, head.projectId || projectId)
              .pipe(catchError(() => of<BriefSpace[]>([])))
              .subscribe((spaces) => patchState(store, { spaces }));
            approvals
              .bySubject(ApprovalSubjectType.DesignBrief, head.id)
              .pipe(catchError(() => of([])))
              .subscribe((headTrail) => patchState(store, { headTrail }));
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
              noBrief,
              error: noBrief ? null : 'Could not load the brief.',
            });
          },
        });
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
       * The client's own read of their brief (T111's brief tab). Skips the head's
       * approval trail — `GET /approvals/by-subject` is gated `approvals.read`, which the
       * Client role does not hold — so `headRound` stays 0 for a client caller;
       * `isHeadRoundOutstanding` is unaffected (it reads `head.status` directly).
       */
      loadAsClient(projectId: string): void {
        patchState(store, { loading: true, error: null, projectId });
        api.getMyBrief(projectId).subscribe({
          next: (view) =>
            patchState(store, { head: view.head, spaces: view.spaces, loading: false }),
          error: () => patchState(store, { loading: false, error: 'Could not load your brief.' }),
        });
      },

      /** Edit the head — returns it to PendingApproval, but the round does NOT move (FR-009). */
      updateHead(projectId: string, request: UpdateBriefHeadRequest): void {
        patchState(store, { savingHead: true, error: null });
        api.updateHead(projectId, request).subscribe({
          next: () => {
            patchState(store, { savingHead: false });
            this.reload();
          },
          error: () =>
            patchState(store, { savingHead: false, error: 'Could not save the brief head.' }),
        });
      },

      /** Send the head for confirmation — THIS is what advances the round (FR-009). */
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
          error: () =>
            patchState(store, {
              sending: false,
              error: 'Could not send the brief for confirmation.',
            }),
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
          error: () =>
            patchState(store, { mutatingSpace: false, error: 'Could not add the entry.' }),
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
          error: () =>
            patchState(store, { mutatingSpace: false, error: 'Could not add the new version.' }),
        });
      },
    }),
  ),
);
