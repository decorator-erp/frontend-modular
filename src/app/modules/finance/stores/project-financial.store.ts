import { inject } from '@angular/core';
import { patchState, signalStore, withMethods, withState } from '@ngrx/signals';
import { ProjectFinancialService } from '../data/project-financial.service';
import {
  CostCategoryRow,
  MonthlyCashRow,
  ProjectFinancialSummaryResponse,
} from '../model/project-dashboard-splits.model';

interface ProjectFinancialState {
  summary: ProjectFinancialSummaryResponse | null;
  byCategory: CostCategoryRow[];
  cashflow: MonthlyCashRow[];
  summaryLoading: boolean;
  byCategoryLoading: boolean;
  cashflowLoading: boolean;
  error: string | null;
}

const INITIAL: ProjectFinancialState = {
  summary: null,
  byCategory: [],
  cashflow: [],
  summaryLoading: false,
  byCategoryLoading: false,
  cashflowLoading: false,
  error: null,
};

/**
 * Project financial dashboard splits (summary / by-category / cashflow).
 * Feature-scoped — provide it in the summary page's `providers` so each visit
 * starts clean. Errors still flow through the global HTTP interceptor; this
 * only surfaces an inline `error` signal for the page.
 */
export const ProjectFinancialStore = signalStore(
  withState<ProjectFinancialState>(INITIAL),
  withMethods((store, api = inject(ProjectFinancialService)) => ({
    loadSummary(projectId: string): void {
      patchState(store, { summaryLoading: true, error: null });
      api.summary(projectId).subscribe({
        next: (summary) => patchState(store, { summary, summaryLoading: false }),
        error: () =>
          patchState(store, {
            summaryLoading: false,
            error: 'Could not load the financial summary.',
          }),
      });
    },

    loadByCategory(projectId: string): void {
      patchState(store, { byCategoryLoading: true });
      api.byCategory(projectId).subscribe({
        next: (byCategory) => patchState(store, { byCategory, byCategoryLoading: false }),
        error: () =>
          patchState(store, {
            byCategoryLoading: false,
            error: 'Could not load the cost breakdown.',
          }),
      });
    },

    loadCashflow(projectId: string, range?: { fromDate?: string; toDate?: string }): void {
      patchState(store, { cashflowLoading: true });
      api.cashflow(projectId, range).subscribe({
        next: (cashflow) => patchState(store, { cashflow, cashflowLoading: false }),
        error: () =>
          patchState(store, {
            cashflowLoading: false,
            error: 'Could not load the cashflow series.',
          }),
      });
    },
  })),
);
