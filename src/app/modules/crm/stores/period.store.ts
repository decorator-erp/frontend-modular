import { HttpErrorResponse } from '@angular/common/http';
import { computed, inject } from '@angular/core';
import { patchState, signalStore, withComputed, withMethods, withState } from '@ngrx/signals';
import { injectReloadOnConflict } from '@platform/http/concurrency';
import { ErrorHandlerService, friendly } from '@platform/http/error-handler.service';
import { CrmPeriod, CrmPeriodService } from '../data/crm-period.service';
import { RequirementPeriodStatus } from '../model/crm-enums';

interface PeriodState {
  /** The project's full period history — closed periods included, most recent last. */
  periods: CrmPeriod[];
  /** Remembered so `extend()`/`close()` can refresh without the caller re-passing it. */
  projectId: string | null;
  loading: boolean;
  extending: boolean;
  closing: boolean;
  error: string | null;
  /** 404 on load (FINDING-5-6, X-5): the project's periods are outside the caller's scope or gone. */
  notFound: boolean;
}

const INITIAL: PeriodState = {
  periods: [],
  projectId: null,
  loading: false,
  extending: false,
  closing: false,
  error: null,
  notFound: false,
};

/**
 * The requirement period for one project — feature-scoped, provide it in the page's
 * `providers` so each visit starts clean (the `notification.store` idiom, minus its
 * root registration; the `ProjectFinancialStore` precedent for a feature-scoped store).
 * **`rxMethod` is used nowhere in this repo and is not introduced here.**
 *
 * A project holds at most one OPEN period at a time (the server rejects a second with
 * `crm.periods.AlreadyOpen`), so `openPeriod` is derived, not stored directly.
 */
export const PeriodStore = signalStore(
  withState<PeriodState>(INITIAL),

  withComputed((store) => {
    const openPeriod = computed(
      () => store.periods().find((p) => p.status === RequirementPeriodStatus.Open) ?? null,
    );

    /**
     * Milliseconds until the open period closes, as of the last `load()`/mutation.
     * `null` when there is no open period. This is a snapshot, not a live tick — a
     * `computed()` only re-derives when a tracked signal changes, and "now" is not
     * one. A live countdown display (re-rendering every second) is the component's
     * job (T036, out of scope here); it formats FROM `closesAtUtc` on its own timer,
     * never hand-writing the time (`Africa/Cairo`, bidi-isolated — FR-034).
     */
    const msRemaining = computed(() => {
      const period = openPeriod();
      return period ? new Date(period.closesAtUtc).getTime() - Date.now() : null;
    });

    return {
      openPeriod,
      isOpen: computed(() => openPeriod() !== null),
      msRemaining,
      /** Whole days remaining, rounded up (a period closing in 40 minutes reads as 1 day left). */
      daysRemaining: computed(() => {
        const ms = msRemaining();
        return ms === null ? null : Math.ceil(ms / 86_400_000);
      }),
    };
  }),

  withMethods(
    (
      store,
      api = inject(CrmPeriodService),
      errors = inject(ErrorHandlerService),
      reloadOnConflict = injectReloadOnConflict(),
    ) => ({
      /** Load the project's period history. */
      load(projectId: string): void {
        patchState(store, { loading: true, error: null, notFound: false, projectId });
        api.list(projectId).subscribe({
          next: (periods) => patchState(store, { periods, loading: false }),
          error: (err: unknown) =>
            err instanceof HttpErrorResponse && err.status === 404
              ? patchState(store, { periods: [], loading: false, notFound: true })
              : patchState(store, {
                  loading: false,
                  error: 'Could not load the requirement period.',
                }),
        });
      },

      /**
       * Extend the open period's close date. Refreshes from the server on success rather
       * than guessing the new record's shape locally — `extend()` returns `204`, and
       * server-only fields (`closedAtUtc`, etc.) are not ours to reconstruct.
       */
      extend(periodId: string, newClosesAtUtc: string): void {
        const projectId = store.projectId();
        patchState(store, { extending: true, error: null });
        api.extend(periodId, newClosesAtUtc).subscribe({
          next: () => {
            patchState(store, { extending: false });
            if (projectId) this.load(projectId);
          },
          error: (err: unknown) => {
            // 009b #26: 409 crm.periods.ConcurrentUpdate → reload (X-3); a coded error → its message.
            if (projectId && reloadOnConflict(err, () => this.load(projectId))) {
              patchState(store, { extending: false });
              return;
            }
            patchState(store, {
              extending: false,
              error: codedMessage(err, errors) ?? 'Could not extend the requirement period.',
            });
          },
        });
      },

      /** Close the open period. Same refresh-on-success reasoning as `extend()`. */
      close(periodId: string): void {
        const projectId = store.projectId();
        patchState(store, { closing: true, error: null });
        api.close(periodId).subscribe({
          next: () => {
            patchState(store, { closing: false });
            if (projectId) this.load(projectId);
          },
          error: (err: unknown) => {
            if (projectId && reloadOnConflict(err, () => this.load(projectId))) {
              patchState(store, { closing: false });
              return;
            }
            patchState(store, {
              closing: false,
              error: codedMessage(err, errors) ?? 'Could not close the requirement period.',
            });
          },
        });
      },
    }),
  ),
);

/** The catalog message for a coded server error (`NotOpen`, `crm.projects.Inactive`, …), else `null`. */
function codedMessage(err: unknown, errors: ErrorHandlerService): string | null {
  if (!(err instanceof HttpErrorResponse)) return null;
  const parsed = errors.parse(err);
  return parsed.code ? friendly(parsed) : null;
}
