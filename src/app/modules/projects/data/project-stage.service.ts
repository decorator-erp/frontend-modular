import { Injectable, inject } from '@angular/core';
import { Observable } from 'rxjs';
import { map } from 'rxjs/operators';
import {
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
import { toUtcDate } from '../model/utc-date';

/**
 * Project stages, nested under the project (crmp A-2; gap table P-20..25, P-77, E2):
 * `/api/projects/{projectId}/stages` (dms `StageEndpoints.cs:24-78`). Writes need `stages.manage` and the
 * Manager level. Activate and approve are REMOVED (P-24, P-76): Unlock and Approval gates replace them.
 * The financial drill-downs below stay on `/api/project-stages/{id}/…` (Finance owns them).
 */
@Injectable({ providedIn: 'root' })
export class ProjectStageService extends ApiService {
  private readonly projects = inject(ProjectService);

  /** 008b #24: `GET /api/projects/{projectId}/stages` → `ProjectStageResponse[]` (`stages.read`). */
  getByProject(projectId: string): Observable<ProjectStage[]> {
    return this.get<unknown>(`/projects/${projectId}/stages`).pipe(
      map((r) =>
        this.unwrapArray(r)
          .map((s) => this.projects.normalizeStage(s, projectId))
          .sort((a, b) => a.order - b.order),
      ),
    );
  }

  /** Was `GET /project-stages/{id}/details` (P-20): `GET /projects/{pid}/stages/{sid}` (StageEndpoints.cs:32). */
  getDetails(projectId: string, stageId: string): Observable<ProjectStage> {
    return this.get<unknown>(`/projects/${projectId}/stages/${stageId}`).pipe(
      map((r) => this.projects.normalizeStage(this.unwrap(r), projectId)),
    );
  }

  /** `POST /projects/{pid}/stages` (`StageRequest`, StageEndpoints.cs:41,93) → `{ stageId }`. */
  create(projectId: string, req: CreateProjectStageRequest): Observable<string> {
    return this.post<unknown>(`/projects/${projectId}/stages`, this.body(req)).pipe(
      map((r) => this.unwrapId(r, 'stageId')),
    );
  }

  /** `PUT …/stages/{sid}` (StageEndpoints.cs:52). Omitted nullable text and dates are cleared. */
  update(projectId: string, stageId: string, req: UpdateProjectStageRequest): Observable<unknown> {
    return this.put(`/projects/${projectId}/stages/${stageId}`, this.body(req));
  }

  /** `DELETE …/stages/{sid}` (StageEndpoints.cs:62): 409 `projects.stages.NotDeletable` once started. */
  remove(projectId: string, stageId: string): Observable<unknown> {
    return this.delete(`/projects/${projectId}/stages/${stageId}`);
  }

  /** Was `PUT … {notes}` (P-25): `POST …/stages/{sid}/complete`, no body (StageEndpoints.cs:70). */
  complete(projectId: string, stageId: string): Observable<unknown> {
    return this.post(`/projects/${projectId}/stages/${stageId}/complete`, {});
  }

  /** Was `PUT …/reject { note }` (P-77): `POST …/stages/{sid}/reject { reason }` (StageEndpoints.cs:78). */
  reject(projectId: string, stageId: string, reason: string): Observable<unknown> {
    return this.post(`/projects/${projectId}/stages/${stageId}/reject`, { reason });
  }

  private body(
    req: CreateProjectStageRequest | UpdateProjectStageRequest,
  ): Record<string, unknown> {
    const create = req as CreateProjectStageRequest;
    return {
      name: req.name,
      order: req.order,
      description: req.description ?? null,
      notes: req.notes ?? null,
      estimatedStartDate: toUtcDate(req.estimatedStartDate),
      estimatedEndDate: toUtcDate(req.estimatedEndDate),
      ...('templateStageId' in req ? { templateStageId: create.templateStageId ?? null } : {}),
    };
  }

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
