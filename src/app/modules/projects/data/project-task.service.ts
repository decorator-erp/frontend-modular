import { handled } from '@platform/http/handled-errors';
import { Injectable, inject } from '@angular/core';
import { Observable } from 'rxjs';
import { map } from 'rxjs/operators';
import {
  CreateProjectTaskRequest,
  ProjectTask,
  ProjectTaskStatus,
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
import { toUtcDate } from '../model/utc-date';

/** Tasks — `/api/project-tasks`. */
/**
 * crmp review R-P2-F6: the task actions show their own 403/409 message (and re-read the access), so
 * the global error toast is told to skip those statuses.
 */
const TRANSITION = { context: handled(403, 409) };

/** Filters and the opt-in page of `GET /projects/{projectId}/tasks` (dms `TaskEndpoints.cs:23`). */
export interface ProjectTaskQuery {
  stageId?: string | null;
  assigneeId?: string | null;
  status?: ProjectTaskStatus | null;
  pageNumber?: number;
  pageSize?: number;
}

/**
 * Project tasks, nested under the project (crmp A-2; gap table P-36..44, P-105, E3):
 * `/api/projects/{projectId}/tasks` (dms `TaskEndpoints.cs:23-123`). Lifecycle transitions are POSTs.
 * The list is unbounded unless a page is asked for (contract §1.6).
 */
@Injectable({ providedIn: 'root' })
export class ProjectTaskService extends ApiService {
  private readonly projects = inject(ProjectService);

  getByProject(projectId: string, query: ProjectTaskQuery = {}): Observable<ProjectTask[]> {
    const params: Record<string, unknown> = {};
    if (query.stageId) params['stageId'] = query.stageId;
    if (query.assigneeId) params['assigneeId'] = query.assigneeId;
    if (query.status) params['status'] = this.projects.taskStatusInt(query.status);
    if (query.pageNumber) params['pageNumber'] = query.pageNumber;
    if (query.pageSize) params['pageSize'] = query.pageSize;
    return this.get<unknown>(
      `/projects/${projectId}/tasks`,
      Object.keys(params).length ? params : undefined,
    ).pipe(
      map((r) =>
        this.unwrapArray(r)
          .map((t) => this.projects.normalizeTask(t, projectId))
          .sort((a, b) => a.order - b.order),
      ),
    );
  }

  /** Was `GET /project-tasks/by-stage/{id}` (P-37): now `?stageId=`. */
  getByStage(projectId: string, stageId: string): Observable<ProjectTask[]> {
    return this.getByProject(projectId, { stageId });
  }

  /**
   * `GET …/tasks/{taskId}/details` → `{ task, subTasks, subTasksCount, commentsCount, gates }`
   * (TaskEndpoints.cs:64; `ProjectTaskDetailsResponse`). The gates come as a summary, not a list.
   */
  getDetails(projectId: string, taskId: string): Observable<TaskDetails> {
    return this.get<unknown>(`/projects/${projectId}/tasks/${taskId}/details`).pipe(
      map((r) => {
        const src = this.unwrap(r);
        const subTasks = (this.field<unknown[]>(src, 'subTasks') ?? []).map((s) =>
          this.projects.normalizeSubTask(s, taskId),
        );
        return {
          task: this.projects.normalizeTask(this.field(src, 'task') ?? src, projectId),
          subTasks,
          subTasksCount: this.field<number>(src, 'subTasksCount') ?? subTasks.length,
          commentsCount: this.field<number>(src, 'commentsCount') ?? 0,
          gates: this.projects.normalizeGateSummary(this.field(src, 'gates')),
        } satisfies TaskDetails;
      }),
    );
  }

  /** `POST /projects/{pid}/tasks` (`TaskRequest`, TaskEndpoints.cs:35,228) → `{ taskId }`. */
  create(projectId: string, req: CreateProjectTaskRequest): Observable<string> {
    return this.post<unknown>(`/projects/${projectId}/tasks`, this.body(req)).pipe(
      map((r) => this.unwrapId(r, 'taskId')),
    );
  }

  /** `PUT …/tasks/{taskId}` (TaskEndpoints.cs:46). Omitted nullable text and dates are cleared. */
  update(projectId: string, taskId: string, req: UpdateProjectTaskRequest): Observable<unknown> {
    return this.put(`/projects/${projectId}/tasks/${taskId}`, this.body(req));
  }

  remove(projectId: string, taskId: string): Observable<unknown> {
    return this.delete(`/projects/${projectId}/tasks/${taskId}`, undefined, TRANSITION);
  }

  /** `POST …/assign { employeeId }` (was `PUT … { assignedToId }`, P-42). */
  assign(projectId: string, taskId: string, employeeId: string): Observable<unknown> {
    return this.post(`/projects/${projectId}/tasks/${taskId}/assign`, { employeeId });
  }

  start(projectId: string, taskId: string): Observable<unknown> {
    return this.post(`/projects/${projectId}/tasks/${taskId}/start`, {}, TRANSITION);
  }

  complete(projectId: string, taskId: string): Observable<unknown> {
    return this.post(`/projects/${projectId}/tasks/${taskId}/complete`, {}, TRANSITION);
  }

  cancel(projectId: string, taskId: string): Observable<unknown> {
    return this.post(`/projects/${projectId}/tasks/${taskId}/cancel`, {}, TRANSITION);
  }

  /** `POST …/reject { reason }` (was `PUT … { note }`, P-105). */
  reject(projectId: string, taskId: string, reason: string): Observable<unknown> {
    return this.post(`/projects/${projectId}/tasks/${taskId}/reject`, { reason }, TRANSITION);
  }

  reopen(projectId: string, taskId: string): Observable<unknown> {
    return this.post(`/projects/${projectId}/tasks/${taskId}/reopen`, {}, TRANSITION);
  }

  private body(req: CreateProjectTaskRequest | UpdateProjectTaskRequest): Record<string, unknown> {
    const create = req as CreateProjectTaskRequest;
    return {
      ...('projectStageId' in req ? { projectStageId: create.projectStageId ?? null } : {}),
      ...('assignedToId' in req ? { assignedToId: create.assignedToId ?? null } : {}),
      name: req.name,
      description: req.description ?? null,
      notes: req.notes ?? null,
      priority: this.projects.priorityInt(req.priority),
      weight: req.weight,
      order: req.order,
      dueDate: toUtcDate(req.dueDate),
    };
  }

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
