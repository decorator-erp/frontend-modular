import { computed, inject } from '@angular/core';
import { patchState, signalStore, withComputed, withMethods, withState } from '@ngrx/signals';
import { CrmApprovalsService } from '../data/crm-approvals.service';
import type { CatalogKey } from '@platform/i18n/catalog/en';
import type { ClientApprovalTrailRow, DecideApprovalRequest } from '../model';

interface ApprovalsInboxState {
  rows: ClientApprovalTrailRow[];
  loading: boolean;
  /** The row id currently being decided — drives a per-row spinner, not a global one. */
  decidingId: string | null;
  /** A catalog KEY, not prose — this store is client-only (mirrors `ClientProfileStore`). */
  error: CatalogKey | null;
}

const INITIAL: ApprovalsInboxState = {
  rows: [],
  loading: false,
  decidingId: null,
  error: null,
};

/**
 * The client's approvals inbox (T119, FR-029) — ONE call, `portalPending()`, serves
 * both the action list and the decision trail: `pendingOnly=false` (this app's
 * default) returns every row, decided or not. Feature-scoped, fresh per visit.
 * **`rxMethod` is used nowhere in this repo and is not introduced here.**
 */
export const ApprovalsInboxStore = signalStore(
  withState<ApprovalsInboxState>(INITIAL),

  withComputed((store) => ({
    pending: computed(() => store.rows().filter((r) => r.decision === null)),
    /** Most recently decided first — the trail (FR-029: "MUST show past decisions"). */
    decided: computed(() =>
      [...store.rows()]
        .filter((r) => r.decision !== null)
        .sort((a, b) => (b.decidedAtUtc ?? '').localeCompare(a.decidedAtUtc ?? '')),
    ),
  })),

  withMethods((store, api = inject(CrmApprovalsService)) => ({
    load(): void {
      patchState(store, { loading: true, error: null });
      api.portalPending().subscribe({
        next: (rows) => patchState(store, { rows, loading: false }),
        error: () => patchState(store, { loading: false, error: 'client.profileUnavailable' }),
      });
    },

    /**
     * Approve or reject one row. `CrmApprovalsService.decideAsClient` enforces the
     * reject-comment rule by THROWING synchronously (not an Observable error) — the
     * UI must disable submit until a comment exists, but this still guards defensively.
     */
    decide(id: string, request: DecideApprovalRequest): void {
      patchState(store, { decidingId: id, error: null });
      try {
        api.decideAsClient(id, request).subscribe({
          next: () => {
            patchState(store, { decidingId: null });
            this.load();
          },
          error: () => patchState(store, { decidingId: null, error: 'appr.decideFailed' }),
        });
      } catch {
        patchState(store, { decidingId: null, error: 'appr.decideFailed' });
      }
    },
  })),
);
