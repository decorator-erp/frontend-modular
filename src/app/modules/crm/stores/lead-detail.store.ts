import { computed, inject } from '@angular/core';
import { patchState, signalStore, withComputed, withMethods, withState } from '@ngrx/signals';
import { forkJoin } from 'rxjs';
import { injectReloadOnConflict } from '@platform/http/concurrency';
import { CrmLeadService, type CrmLead } from '../data/crm-lead.service';
import { LeadStatus } from '../model/crm-enums';
import type { LeadIntakeRequest, LeadIntakeResponse } from '../model';

interface LeadDetailState {
  leadId: string | null;
  lead: CrmLead | null;
  /** From `GET /leads/{id}/intake` (009b #5); `{}` when none is saved yet. */
  intakeData: LeadIntakeResponse | null;
  loading: boolean;
  savingIntake: boolean;
  error: string | null;
}

const INITIAL: LeadDetailState = {
  leadId: null,
  lead: null,
  intakeData: null,
  loading: false,
  savingIntake: false,
  error: null,
};

/**
 * One office lead + its 1:1 intake. Feature-scoped, fresh per visit (the `brief.store.ts`
 * idiom). Optimistic-OFF: `upsertIntake` reloads the lead on success — the intake is the
 * server's truth, never patched client-side. **`rxMethod` is used nowhere in this repo.**
 */
export const LeadDetailStore = signalStore(
  withState<LeadDetailState>(INITIAL),

  withComputed((store) => ({
    /** The intake, read from its own route; exposed directly for the form. */
    intake: computed(() => store.intakeData()),
    /** Converted ⇒ the intake is locked (read-only). */
    isConverted: computed(() => store.lead()?.status === LeadStatus.Converted),
  })),

  withMethods(
    (store, api = inject(CrmLeadService), reloadOnConflict = injectReloadOnConflict()) => ({
      load(id: string): void {
        patchState(store, { loading: true, error: null, leadId: id });
        forkJoin({ lead: api.getById(id), intake: api.getIntake(id) }).subscribe({
          next: ({ lead, intake }) =>
            patchState(store, { lead, intakeData: intake, loading: false }),
          error: () => patchState(store, { loading: false, error: 'Could not load the lead.' }),
        });
      },

      /** Save the intake, then reload the lead (optimistic-off). Server errors bubble to the form. */
      upsertIntake(
        id: string,
        request: LeadIntakeRequest,
        handlers?: { onSuccess?: () => void; onError?: (err: unknown) => void },
      ): void {
        patchState(store, { savingIntake: true, error: null });
        api.upsertIntake(id, request).subscribe({
          next: () => {
            patchState(store, { savingIntake: false });
            this.load(id);
            handlers?.onSuccess?.();
          },
          error: (err) => {
            // 409 crm.leads.ConcurrentUpdate (C §1.4): reload the lead + intake and say so.
            if (reloadOnConflict(err, () => this.load(id))) {
              patchState(store, { savingIntake: false });
              return;
            }
            patchState(store, { savingIntake: false, error: 'Could not save the intake.' });
            handlers?.onError?.(err);
          },
        });
      },
    }),
  ),
);
