import { inject } from '@angular/core';
import { HttpErrorResponse } from '@angular/common/http';
import { patchState, signalStore, withMethods, withState } from '@ngrx/signals';
import { PublicIntakeApi } from '../data/crm-public-intake.service';
import { ErrorHandlerService } from '@platform/http/error-handler.service';
import type { PublicLeadSubmissionRequest } from '../model';

export type PublicIntakeStatus = 'idle' | 'submitting' | 'success' | 'rateLimited' | 'error';

interface PublicIntakeState {
  status: PublicIntakeStatus;
  /** Domain code (e.g. `crm.leads.SectorMismatch`) or `null` — the component translates it. */
  errorCode: string | null;
  /** Per-field messages from a 400 ProblemDetails, keyed by control name. */
  fieldErrors: Record<string, string[]>;
}

const INITIAL: PublicIntakeState = { status: 'idle', errorCode: null, fieldErrors: {} };

/**
 * State for the anonymous public intake page — provided at the component (never root).
 * Any 2xx ⇒ `success` (the endpoint returns 202 with no body); 429 ⇒ `rateLimited`;
 * otherwise ⇒ `error` carrying the domain `errorCode` and any 400 `fieldErrors`. The store
 * holds **no human copy** — the component renders all strings via CatalogService so the
 * message is bilingual (fix-up a/b).
 */
export const PublicIntakeStore = signalStore(
  withState<PublicIntakeState>(INITIAL),

  withMethods((store, api = inject(PublicIntakeApi), errors = inject(ErrorHandlerService)) => ({
    reset(): void {
      patchState(store, INITIAL);
    },

    submit(body: PublicLeadSubmissionRequest): void {
      patchState(store, { status: 'submitting', errorCode: null, fieldErrors: {} });
      api.submit(body).subscribe({
        next: () => patchState(store, { status: 'success' }),
        error: (err: unknown) => {
          const status = err instanceof HttpErrorResponse ? err.status : 0;
          if (status === 429) {
            patchState(store, { status: 'rateLimited' });
            return;
          }
          const parsed = err instanceof HttpErrorResponse ? errors.parse(err) : null;
          patchState(store, {
            status: 'error',
            errorCode: parsed?.code ?? null,
            fieldErrors: parsed?.fieldErrors ?? {},
          });
        },
      });
    },
  })),
);
