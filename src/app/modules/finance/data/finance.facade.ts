import { Injectable, inject } from '@angular/core';
import { Observable, forkJoin, of } from 'rxjs';
import { catchError, map } from 'rxjs/operators';

import { BudgetLineService } from './budget-line.service';
import { LedgerEntryService } from './ledger-entry.service';
import { VariationService } from './variation.service';
import { BoqSnapshotService } from './boq-snapshot.service';
import { ProjectFinancialDashboardService } from './project-financial-dashboard.service';

import type {
  BoqSnapshotResponse,
  BudgetLineResponse,
  LedgerEntryResponse,
  ProjectFinancialDashboardResponse,
  VariationResponse,
} from '../model';

/** Composed view of the finance data a Stage Detail page needs. */
export interface StageFinanceBundle {
  budgetLines: BudgetLineResponse[];
  ledgerEntries: LedgerEntryResponse[];
  variations: VariationResponse[];
  latestBoq: BoqSnapshotResponse | null;
}

/** Composed view of the finance data a Task Detail page needs. */
export interface TaskFinanceBundle {
  budgetLines: BudgetLineResponse[];
  ledgerEntries: LedgerEntryResponse[];
  variations: VariationResponse[];
  /** BOQ lines from the latest snapshot that belong to this task. */
  boqLines: NonNullable<BoqSnapshotResponse['lines']>;
  latestBoq: BoqSnapshotResponse | null;
}

/**
 * Cross-resource finance reads, composed for the screens that need them.
 *
 * Mirrors the breakdown in `FEATURE_PROMPT_FINANCE.md` Phase F2:
 *   - `getProjectDashboard` is a single backend call (`§7`).
 *   - `getStageFinanceBundle` and `getTaskFinanceBundle` `forkJoin` what the
 *     server exposes today; client-side filtering is used where the API
 *     lacks a tighter query (the doc is the contract).
 */
@Injectable({ providedIn: 'root' })
export class FinanceFacade {
  private readonly budget = inject(BudgetLineService);
  private readonly ledger = inject(LedgerEntryService);
  private readonly variations = inject(VariationService);
  private readonly boq = inject(BoqSnapshotService);
  private readonly dashboard = inject(ProjectFinancialDashboardService);

  getProjectDashboard(projectId: string): Observable<ProjectFinancialDashboardResponse> {
    return this.dashboard.forProject(projectId);
  }

  getStageFinanceBundle(projectId: string, stageId: string): Observable<StageFinanceBundle> {
    return forkJoin({
      budgetLines: this.budget.getByProject(projectId).pipe(
        map((lines) => lines.filter((l) => l.projectStageId === stageId)),
        catchError(() => of([] as BudgetLineResponse[])),
      ),
      ledgerEntries: this.ledger.getByProject(projectId, { stageId, pageSize: 200 }).pipe(
        map((paged) => paged.items),
        catchError(() => of([] as LedgerEntryResponse[])),
      ),
      variations: this.variations
        .getByStage(stageId)
        .pipe(catchError(() => of([] as VariationResponse[]))),
      latestBoq: this.boq
        .getLatest(projectId)
        .pipe(catchError(() => of(null as BoqSnapshotResponse | null))),
    });
  }

  getTaskFinanceBundle(projectId: string, taskId: string): Observable<TaskFinanceBundle> {
    return forkJoin({
      budgetLines: this.budget
        .getByProject(projectId)
        .pipe(catchError(() => of([] as BudgetLineResponse[]))),
      ledgerEntries: this.ledger.getByProject(projectId, { taskId, pageSize: 200 }).pipe(
        map((paged) => paged.items),
        catchError(() => of([] as LedgerEntryResponse[])),
      ),
      variations: this.variations
        .getByTask(taskId)
        .pipe(catchError(() => of([] as VariationResponse[]))),
      latestBoq: this.boq
        .getLatest(projectId)
        .pipe(catchError(() => of(null as BoqSnapshotResponse | null))),
    }).pipe(
      map(({ budgetLines, ledgerEntries, variations, latestBoq }) => ({
        // Filter budget lines to the ones linked to this task. The
        // `BudgetLineResponse` doesn't carry a task id, so the link is by way
        // of ledger entries — caller decides what to highlight.
        budgetLines,
        ledgerEntries,
        variations,
        boqLines: (latestBoq?.lines ?? []).filter((l) => l.projectTaskId === taskId),
        latestBoq,
      })),
    );
  }
}
