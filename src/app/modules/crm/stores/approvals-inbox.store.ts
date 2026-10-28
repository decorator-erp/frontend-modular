import { computed } from '@angular/core';
import { patchState, signalStore, withComputed, withMethods, withState } from '@ngrx/signals';
import type { CatalogKey } from '@platform/i18n/catalog/en';
import type { ClientApprovalTrailRow } from '../model';

interface ApprovalsInboxState {
  rows: ClientApprovalTrailRow[];
  loading: boolean;
  /** A catalog KEY, not prose — this store is client-only (mirrors `ClientProfileStore`). */
  error: CatalogKey | null;
}

const INITIAL: ApprovalsInboxState = {
  rows: [],
  loading: false,
  error: null,
};

/**
 * The client's approvals inbox (T119, FR-029).
 *
 * 009b #N-2: the backend maps neither `GET /api/crm/portal/approvals` nor the portal decide
 * route (`DecideMyPortalApprovalCommand` is unmapped, `EP/CrmPortalEndpoints.cs:36-153`), so
 * `load()` issues no request and reports `appr.notAvailableYet`, and the store has no decide.
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

  withMethods((store) => ({
    load(): void {
      patchState(store, { rows: [], loading: false, error: 'appr.notAvailableYet' });
    },
  })),
);
