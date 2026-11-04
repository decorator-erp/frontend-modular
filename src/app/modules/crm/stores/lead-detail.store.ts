import { CatalogService } from '@platform/i18n/catalog.service';
import { computed, inject } from '@angular/core';
import { patchState, signalStore, withComputed, withMethods, withState } from '@ngrx/signals';
import { forkJoin } from 'rxjs';
import { injectReloadOnConflict } from '@platform/http/concurrency';
import { CrmLeadService, type CrmLead } from '../data/crm-lead.service';
import { LeadStatus } from '../model/crm-enums';
import type { ParsedApiError } from '@platform/types';
import { ErrorHandlerService } from '@platform/http/error-handler.service';
import { HttpErrorResponse } from '@angular/common/http';
import type { LeadIntakeRequest, LeadIntakeResponse } from '../model';

interface LeadDetailState {
  leadId: string | null;
  lead: CrmLead | null;
  /** From `GET /leads/{id}/intake` (009b #5); `{}` when none is saved yet. */
  intakeData: LeadIntakeResponse | null;
  loading: boolean;
  savingIntake: boolean;
  changingStatus: boolean;
  /** The last load answered 404 (unknown or out-of-scope lead). */
  notFound: boolean;
  /** The last load failed for any other reason. */
  loadFailed: boolean;
  error: string | null;
}

const INITIAL: LeadDetailState = {
  leadId: null,
  lead: null,
  intakeData: null,
  loading: false,
  savingIntake: false,
  changingStatus: false,
  notFound: false,
  loadFailed: false,
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
    /**
     * The statuses `PUT /{id}/status` accepts from here (`CrmLead.ChangeStatus`): any of New,
     * Contacted, Qualified, Unqualified other than the current one — never Converted (only
     * `convert` gets there), and nothing once Converted (`crm.leads.AlreadyConverted`).
     */
    statusTargets: computed<LeadStatus[]>(() => {
      const current = store.lead()?.status;
      if (current === undefined || current === LeadStatus.Converted) return [];
      return [
        LeadStatus.New,
        LeadStatus.Contacted,
        LeadStatus.Qualified,
        LeadStatus.Unqualified,
      ].filter((s) => s !== current);
    }),
  })),

  withMethods(
    (
      store,
      api = inject(CrmLeadService),
      errors = inject(ErrorHandlerService),
      catalog = inject(CatalogService),
      reloadOnConflict = injectReloadOnConflict(),
    ) => ({
      load(id: string): void {
        patchState(store, {
          loading: true,
          error: null,
          notFound: false,
          loadFailed: false,
          leadId: id,
        });
        forkJoin({ lead: api.getById(id), intake: api.getIntake(id) }).subscribe({
          next: ({ lead, intake }) =>
            patchState(store, { lead, intakeData: intake, loading: false }),
          error: (err: unknown) => {
            const notFound = err instanceof HttpErrorResponse && err.status === 404;
            patchState(store, {
              loading: false,
              notFound,
              loadFailed: !notFound,
              ...(notFound ? { lead: null, intakeData: null } : {}),
              error: catalog.t('leads.loadLeadFailed'),
            });
          },
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
            patchState(store, { savingIntake: false, error: catalog.t('intake.saveFailed') });
            handlers?.onError?.(err);
          },
        });
      },

      /**
       * `PUT /{id}/status`, then reload the lead (optimistic-off). A 409 (`ConcurrentUpdate`,
       * `AlreadyConverted`, `InvalidStatusTransition`) reloads so the control re-offers only
       * what the fresh status allows; `onError` gets the parsed error either way.
       */
      changeStatus(
        id: string,
        status: LeadStatus,
        handlers?: { onSuccess?: () => void; onError?: (err: ParsedApiError | null) => void },
      ): void {
        if (store.changingStatus()) return;
        patchState(store, { changingStatus: true });
        api.updateStatus(id, status).subscribe({
          next: () => {
            patchState(store, { changingStatus: false });
            this.load(id);
            handlers?.onSuccess?.();
          },
          error: (err: unknown) => {
            patchState(store, { changingStatus: false });
            if (!(err instanceof HttpErrorResponse)) {
              handlers?.onError?.(null);
              return;
            }
            if (err.status === 409) this.load(id);
            handlers?.onError?.(errors.parse(err));
          },
        });
      },
    }),
  ),
);
