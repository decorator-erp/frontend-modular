import { Injectable, inject } from '@angular/core';
import { Observable } from 'rxjs';
import { map } from 'rxjs/operators';
import {
  CreateProjectTaskRequest,
  ProjectTask,
  TaskDetails,
  UpdateProjectTaskRequest,
} from '../model/project.model';
import type {
  LedgerMovementResponse,
  TaskBoqLineResponse,
  TaskInvoiceLineResponse,
  VariationResponse,
} from '@modules/finance';
import { ApiService } from '@platform/http/api.service';
import { ProjectService } from './project.service';

/** Tasks — `/api/project-tasks`. */
@Injectable({ providedIn: 'root' })
export class ProjectTaskService extends ApiService {
  private readonly projects = inject(ProjectService);

  getByProject(projectId: string): Observable<ProjectTask[]> {
    return this.get<unknown>(`/project-tasks/by-project/${projectId}`).pipe(
      map((r) =>
        this.unwrapArray(r)
          .map((t) => this.projects.normalizeTask(t, projectId))
          .sort((a, b) => a.order - b.order),
      ),
    );
  }

  getByStage(stageId: string): Observable<ProjectTask[]> {
    return this.get<unknown>(`/project-tasks/by-stage/${stageId}`).pipe(
      map((r) =>
        this.unwrapArray(r)
          .map((t) => this.projects.normalizeTask(t, ''))
          .sort((a, b) => a.order - b.order),
      ),
    );
  }

  getDetails(taskId: string): Observable<TaskDetails> {
    return this.get<unknown>(`/project-tasks/${taskId}/details`).pipe(
      map((r) => {
        const src = this.unwrap(r);
        return {
          task: this.projects.normalizeTask(src, ''),
          subTasks: (this.field<unknown[]>(src, 'subTasks') ?? []).map((s) =>
            this.projects.normalizeSubTask(s, taskId),
          ),
          gateConditions: (this.field<unknown[]>(src, 'gateConditions') ?? []).map((c) =>
            this.projects.normalizeGate(c),
          ),
        } as TaskDetails;
      }),
    );
  }

  create(req: CreateProjectTaskRequest): Observable<string> {
    const body = { ...req, priority: this.projects.priorityInt(req.priority) };
    return this.post<unknown>('/project-tasks', body).pipe(map((r) => this.unwrap<string>(r)));
  }

  update(taskId: string, req: UpdateProjectTaskRequest): Observable<unknown> {
    const body = { ...req, priority: this.projects.priorityInt(req.priority) };
    return this.put(`/project-tasks/${taskId}`, body);
  }

  remove(taskId: string): Observable<unknown> {
    return this.delete(`/project-tasks/${taskId}`);
  }

  assign(taskId: string, assignedToId: string): Observable<unknown> {
    return this.put(`/project-tasks/${taskId}/assign`, { assignedToId });
  }

  start(taskId: string, assignedToId?: string): Observable<unknown> {
    return this.put(`/project-tasks/${taskId}/start`, { assignedToId: assignedToId ?? null });
  }

  complete(taskId: string): Observable<unknown> {
    return this.put(`/project-tasks/${taskId}/complete`, {});
  }

  // NOTE: no cancel() — backend exposes no PUT /project-tasks/{id}/cancel. The
  // legal terminal transition is reject() (TaskLifecycleService.reject), per the
  // Jira-style state machine (CLAUDE_CODE_PROMPT.md Step 3).

  // ---- financial query drilldowns (financial-queries spec) ----------------
  // All paths are /api/project-tasks/{id}/... (ProjectTaskFinancialEndpoints.cs).

  /** Ledger movements at task scope. */
  getFinancialMovements(
    taskId: string,
    params?: { fromDate?: string; toDate?: string; type?: LedgerMovementResponse['type'] },
  ): Observable<LedgerMovementResponse[]> {
    return this.get<unknown>(`/project-tasks/${taskId}/financial/movements`, params).pipe(
      map((r) => this.unwrapArray<LedgerMovementResponse>(r)),
    );
  }

  /** Denormalised invoice lines touching this task. */
  getInvoiceLines(taskId: string): Observable<TaskInvoiceLineResponse[]> {
    return this.get<unknown>(`/project-tasks/${taskId}/invoice-lines`).pipe(
      map((r) => this.unwrapArray<TaskInvoiceLineResponse>(r)),
    );
  }

  /** BOQ snapshot lines for this task; optionally pin a snapshot version. */
  getBoqLines(taskId: string, snapshotVersion?: number): Observable<TaskBoqLineResponse[]> {
    return this.get<unknown>(`/project-tasks/${taskId}/boq-lines`, { snapshotVersion }).pipe(
      map((r) => this.unwrapArray<TaskBoqLineResponse>(r)),
    );
  }

  /** Variations raised against this task; optionally filter by status. */
  getVariations(
    taskId: string,
    status?: VariationResponse['status'],
  ): Observable<VariationResponse[]> {
    return this.get<unknown>(`/project-tasks/${taskId}/variations`, { status }).pipe(
      map((r) => this.unwrapArray<VariationResponse>(r)),
    );
  }
}
