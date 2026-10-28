import { Injectable, inject } from '@angular/core';
import { Observable } from 'rxjs';
import { map } from 'rxjs/operators';
import {
  CompleteProjectStageRequest,
  CreateProjectStageRequest,
  ProjectStage,
  UpdateProjectStageRequest,
} from '../model/project.model';
import type {
  LedgerMovementResponse,
  TaskBoqLineResponse,
  TaskInvoiceLineResponse,
  VariationResponse,
} from '@modules/finance';
import { ApiService } from '@platform/http/api.service';
import { ProjectService } from './project.service';

/** Generic, data-driven stage engine — `/api/project-stages`. */
@Injectable({ providedIn: 'root' })
export class ProjectStageService extends ApiService {
  private readonly projects = inject(ProjectService);

  getByProject(projectId: string): Observable<ProjectStage[]> {
    return this.get<unknown>(`/project-stages/by-project/${projectId}`).pipe(
      map((r) =>
        this.unwrapArray(r)
          .map((s) => this.projects.normalizeStage(s, projectId))
          .sort((a, b) => a.order - b.order),
      ),
    );
  }

  getDetails(stageId: string): Observable<ProjectStage> {
    return this.get<unknown>(`/project-stages/${stageId}/details`).pipe(
      map((r) => this.projects.normalizeStage(this.unwrap(r), '')),
    );
  }

  create(req: CreateProjectStageRequest): Observable<string> {
    return this.post<unknown>('/project-stages', req).pipe(map((r) => this.unwrap<string>(r)));
  }

  update(stageId: string, req: UpdateProjectStageRequest): Observable<unknown> {
    return this.put(`/project-stages/${stageId}`, req);
  }

  remove(stageId: string): Observable<unknown> {
    return this.delete(`/project-stages/${stageId}`);
  }

  activate(stageId: string): Observable<unknown> {
    return this.put(`/project-stages/${stageId}/activate`, {});
  }

  complete(stageId: string, req: CompleteProjectStageRequest = {}): Observable<unknown> {
    return this.put(`/project-stages/${stageId}/complete`, req);
  }

  // NOTE: no skip() — backend exposes no PUT /project-stages/{id}/skip. A "Skip
  // stage" affordance requires a backend gap ticket (CLAUDE_CODE_PROMPT.md Step 2).
  // approve()/reject() live on StageLifecycleService (@shared/api).

  // ---- financial query drilldowns (financial-queries spec) ----------------
  // All paths are /api/project-stages/{id}/... (ProjectStageFinancialEndpoints.cs).

  /** Ledger movements at stage scope. */
  getFinancialMovements(
    stageId: string,
    params?: { fromDate?: string; toDate?: string; type?: LedgerMovementResponse['type'] },
  ): Observable<LedgerMovementResponse[]> {
    return this.get<unknown>(`/project-stages/${stageId}/financial/movements`, params).pipe(
      map((r) => this.unwrapArray<LedgerMovementResponse>(r)),
    );
  }

  /**
   * Invoices touching this stage. NOTE: stages expose invoice SUMMARIES
   * (`/invoices` → InvoiceListItemResponse), not task-style invoice LINES.
   * Backend gap: no stage line-level drilldown (CLAUDE_CODE_PROMPT.md Step 2).
   */
  getInvoiceLines(stageId: string): Observable<TaskInvoiceLineResponse[]> {
    return this.get<unknown>(`/project-stages/${stageId}/invoices`).pipe(
      map((r) => this.unwrapArray<TaskInvoiceLineResponse>(r)),
    );
  }

  /**
   * BOQ snapshots for this stage. NOTE: stages expose snapshot SUMMARIES
   * (`/boq-snapshots` → BoqSnapshotSummaryResponse), not task-style BOQ LINES.
   * Backend gap: no stage line-level drilldown (CLAUDE_CODE_PROMPT.md Step 2).
   */
  getBoqLines(stageId: string, snapshotVersion?: number): Observable<TaskBoqLineResponse[]> {
    return this.get<unknown>(`/project-stages/${stageId}/boq-snapshots`, { snapshotVersion }).pipe(
      map((r) => this.unwrapArray<TaskBoqLineResponse>(r)),
    );
  }

  /** Variations raised against this stage; optionally filter by status. */
  getVariations(
    stageId: string,
    status?: VariationResponse['status'],
  ): Observable<VariationResponse[]> {
    return this.get<unknown>(`/project-stages/${stageId}/variations`, { status }).pipe(
      map((r) => this.unwrapArray<VariationResponse>(r)),
    );
  }
}
