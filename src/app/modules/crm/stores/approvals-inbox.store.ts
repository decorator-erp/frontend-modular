import { HttpErrorResponse } from '@angular/common/http';
import { inject } from '@angular/core';
import { patchState, signalStore, withMethods, withState } from '@ngrx/signals';
import {
  ErrorHandlerService,
  friendly,
  hasCatalogMessage,
} from '@platform/http/error-handler.service';
import { ToastService } from '@platform/feedback/toast.service';
import { CatalogService } from '@platform/i18n/catalog.service';
import type { CatalogKey } from '@platform/i18n/catalog/en';
import type { ParsedApiError } from '@platform/types';
import { CrmPortalApprovalsService } from '../data/crm-portal-approvals.service';
import type { PortalApproval, PortalApprovalDecision, PortalApprovalStatus } from '../model';

/** One paged list of the inbox — the pending rows or the decided trail. */
export interface ApprovalsListState {
  rows: PortalApproval[];
  /** The last page loaded (1-based); 0 before the first load. */
  page: number;
  totalPages: number;
  loading: boolean;
  /** A message already resolved through the catalog (`friendly()` / `catalog.t()`), or null. */
  error: string | null;
}

interface ApprovalsInboxState {
  pending: ApprovalsListState;
  decided: ApprovalsListState;
  /** Approvals with a decide request in flight — one request per approval at a time. */
  decidingIds: string[];
}

const EMPTY_LIST: ApprovalsListState = {
  rows: [],
  page: 0,
  totalPages: 0,
  loading: false,
  error: null,
};

const INITIAL: ApprovalsInboxState = {
  pending: EMPTY_LIST,
  decided: EMPTY_LIST,
  decidingIds: [],
};

/** Completion hooks for `decide`: a 400 (comment rules) is the caller's to show inline. */
export interface DecideHandlers {
  onDone?: () => void;
  onError?: (message: string) => void;
}

/**
 * The client's approvals inbox (T119, FR-029; crm-prod B1-fe — replaces 009b #N-2's "not
 * available"). Two server-paged lists, `pending` (newest requested first) and `decided` (the
 * trail, newest decided first), both in server order.
 *
 * `decide` holds one request per approval (`decidingIds`); a second call while one is in flight
 * is dropped. After a decision both lists are re-read: the subject's own status moves
 * asynchronously (the outbox), so nothing is assumed locally. 409 `approvals.AlreadyDecided` →
 * both lists reload and a toast says so; 404 → the row is dropped and both lists reload.
 * **`rxMethod` is used nowhere in this repo and is not introduced here.**
 */
export const ApprovalsInboxStore = signalStore(
  withState<ApprovalsInboxState>(INITIAL),

  withMethods((store) => {
    const api = inject(CrmPortalApprovalsService);
    const errors = inject(ErrorHandlerService);
    const catalog = inject(CatalogService);
    const toast = inject(ToastService);

    const parse = (err: unknown): ParsedApiError | null =>
      err instanceof HttpErrorResponse ? errors.parse(err) : null;

    const message = (parsed: ParsedApiError | null, fallback: CatalogKey): string =>
      parsed && hasCatalogMessage(parsed) ? friendly(parsed) : catalog.t(fallback);

    const patchList = (status: PortalApprovalStatus, patch: Partial<ApprovalsListState>): void => {
      const current = status === 'pending' ? store.pending() : store.decided();
      const next = { ...current, ...patch };
      patchState(store, status === 'pending' ? { pending: next } : { decided: next });
    };

    const loadPage = (status: PortalApprovalStatus, page: number): void => {
      patchList(status, { loading: true, error: null });
      api.list(status, page).subscribe({
        next: (result) => {
          const current = status === 'pending' ? store.pending() : store.decided();
          const kept = page === 1 ? [] : current.rows;
          const seen = new Set(kept.map((r) => r.id));
          patchList(status, {
            rows: [...kept, ...result.items.filter((r) => !seen.has(r.id))],
            page: result.page,
            totalPages: result.totalPages,
            loading: false,
          });
        },
        error: (err: unknown) =>
          patchList(status, { loading: false, error: message(parse(err), 'appr.loadFailed') }),
      });
    };

    const reloadAll = (): void => {
      loadPage('pending', 1);
      loadPage('decided', 1);
    };

    const release = (approvalId: string): void =>
      patchState(store, { decidingIds: store.decidingIds().filter((id) => id !== approvalId) });

    return {
      /** First page of both lists. */
      load(): void {
        reloadAll();
      },

      /** Re-read one list from its first page (the error state's Retry). */
      reload(status: PortalApprovalStatus): void {
        loadPage(status, 1);
      },

      /** The next page of one list, appended. No-op on the last page or while loading. */
      loadMore(status: PortalApprovalStatus): void {
        const list = status === 'pending' ? store.pending() : store.decided();
        if (list.loading || list.page >= list.totalPages) return;
        loadPage(status, list.page + 1);
      },

      isDeciding(approvalId: string): boolean {
        return store.decidingIds().includes(approvalId);
      },

      decide(
        approvalId: string,
        decision: PortalApprovalDecision,
        comment: string | null,
        handlers: DecideHandlers = {},
      ): void {
        if (store.decidingIds().includes(approvalId)) return;
        patchState(store, { decidingIds: [...store.decidingIds(), approvalId] });

        api.decide(approvalId, decision, comment).subscribe({
          next: () => {
            release(approvalId);
            toast.show({ tone: 'success', message: catalog.t('appr.decisionSent') });
            handlers.onDone?.();
            reloadAll();
          },
          error: (err: unknown) => {
            release(approvalId);
            const parsed = parse(err);
            if (parsed?.status === 409) {
              toast.show({ tone: 'warning', message: catalog.t('appr.alreadyDecidedReloaded') });
              handlers.onDone?.();
              reloadAll();
            } else if (parsed?.status === 404) {
              patchList('pending', {
                rows: store.pending().rows.filter((r) => r.id !== approvalId),
              });
              toast.show({ tone: 'warning', message: catalog.t('appr.goneReloaded') });
              handlers.onDone?.();
              reloadAll();
            } else if (parsed?.status === 400 && handlers.onError) {
              handlers.onError(message(parsed, 'appr.decideFailed'));
            } else {
              toast.show({ tone: 'danger', message: message(parsed, 'appr.decideFailed') });
            }
          },
        });
      },
    };
  }),
);
