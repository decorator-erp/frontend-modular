import { computed, inject } from '@angular/core';
import { patchState, signalStore, withComputed, withMethods, withState } from '@ngrx/signals';
import { CrmLeadService, type CrmLead } from '../data/crm-lead.service';
import { LeadStatus } from '../model/crm-enums';
import type { LeadIntakeRequest } from '../model';

interface LeadDetailState {
  leadId: string | null;
  lead: CrmLead | null;
  loading: boolean;
  savingIntake: boolean;
  error: string | null;
}

const INITIAL: LeadDetailState = {
  leadId: null,
  lead: null,
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
    /** Intake lives on the lead; expose it directly for the form. */
    intake: computed(() => store.lead()?.intake ?? null),
    /** Converted ⇒ the intake is locked (read-only). */
    isConverted: computed(() => store.lead()?.status === LeadStatus.Converted),
  })),

  withMethods((store, api = inject(CrmLeadService)) => ({
    load(id: string): void {
      patchState(store, { loading: true, error: null, leadId: id });
      api.getById(id).subscribe({
        next: (lead) => patchState(store, { lead, loading: false }),
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
          patchState(store, { savingIntake: false, error: 'Could not save the intake.' });
          handlers?.onError?.(err);
        },
      });
    },
  })),
);
