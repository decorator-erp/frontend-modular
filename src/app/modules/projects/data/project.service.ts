import { Injectable } from '@angular/core';
import { Observable } from 'rxjs';
import { map } from 'rxjs/operators';
import {
  ApprovalType,
  ConditionType,
  CreateGateConditionRequest,
  CreateProjectRequest,
  GateCondition,
  GateStatus,
  GateTrigger,
  Project,
  ProjectDetails,
  ProjectMember,
  ProjectMemberAccess,
  GateSummary,
  ProjectStage,
  ProjectStatus,
  ProjectSubTask,
  ProjectTask,
  ProjectTaskStatus,
  StageStatus,
  TaskPriority,
  TaskStatusCount,
  UpdateProjectRequest,
  WorkflowType,
} from '../model/project.model';
import type {
  BoqSnapshotResponse,
  InvoiceResponse,
  LedgerMovementResponse,
  PagedResponse,
  ProjectFinancialBlock,
  ProjectStageFinancialBlock,
  ProjectTaskFinancialBlock,
  VariationResponse,
} from '@modules/finance';
import { ApiService } from '@platform/http/api.service';
import { toProjectLevel } from '../model/project-actions';
import { handled } from '@platform/http/handled-errors';
import { PagedResult } from '@platform/types';

/**
 * Canonical project service for the workflow hub. Talks to the real backend
 * (`/api/projects`) and normalises responses defensively, like the other
 * core/http services. No mock fallback — failures surface through the error
 * interceptor.
 */
/**
 * crmp review R1-F4: a gate edit is a delete followed by a create (no update route). When the create
 * fails after the delete went through, the old gate is gone; callers tell the user so and reload.
 */
export class GateRemovedError extends Error {
  constructor(override readonly cause: unknown) {
    super('gate removed, re-create failed');
  }
}

/**
 * crmp review R2-1: a gate the frontend cannot re-create faithfully. `GateConditionResponse` carries
 * no `referencedDocumentId` (dms `Projects.Contracts/Gates/GateContracts.cs:8-11`), so a
 * DocumentApproved gate read from the list cannot be rebuilt: its create would answer 400
 * `gate_conditions.InvalidReference` (`DocumentApprovedHandler.cs:26-28`) after the delete went
 * through. `recreate` refuses such a request before deleting anything.
 */
export class GateNotRecreatableError extends Error {
  constructor() {
    super('gate cannot be re-created');
  }
}

/** True when the create body is complete enough to rebuild the gate after its delete. */
export function isRecreatable(req: CreateGateConditionRequest): boolean {
  // R3-1: a Budget gate opened by a finance variation is linked by VariationId, which the response
  // does not carry either (dms GateCondition.cs:56; FinanceVariationIntegrationEventHandlers.cs:41-77),
  // so a re-created Budget gate would lose that link. The frontend cannot tell which are linked.
  if (req.conditionType === 'Budget') return false;
  return req.conditionType !== 'DocumentApproved' || !!req.referencedDocumentId;
}

@Injectable({ providedIn: 'root' })
export class ProjectService extends ApiService {
  getAll(page = 1, pageSize = 20): Observable<PagedResult<Project>> {
    return this.get<unknown>('/projects', { pageNumber: page, pageSize }).pipe(
      map((response) => this.normalizePaged(response)),
    );
  }

  /**
   * A client's projects (008b #1): `GET /api/projects?clientId=` (crmp A-2; gap table E8, dms
   * `ProjectEndpoints.cs:26`). Was a client-side filter over the first page.
   */
  getByClient(clientId: string, pageSize = 100): Observable<Project[]> {
    return this.get<unknown>('/projects', { pageNumber: 1, pageSize, clientId }).pipe(
      map((response) => this.normalizePaged(response).items),
    );
  }

  getById(id: string): Observable<Project> {
    return this.get<unknown>(`/projects/${id}`).pipe(
      map((r) => this.normalizeProject(this.unwrap(r))),
    );
  }

  /**
   * The hub's one-shot load: `GET /api/projects/{id}/details` (ProjectEndpoints.cs:43, `project.read`)
   * → `ProjectDetailsResponse` — project + stages (with tasks, counts, gate summaries) + unstaged
   * tasks. `handled(404)`: an outsider or unknown project is the page's own not-found state, so the
   * interceptor shows no second toast.
   */
  getDetails(id: string): Observable<ProjectDetails> {
    return this.get<unknown>(`/projects/${id}/details`, undefined, { context: handled(404) }).pipe(
      map((r) => this.normalizeDetails(this.unwrap(r))),
    );
  }

  /** `POST /api/projects` → 200 `{ projectId }` (008b #2). */
  create(req: CreateProjectRequest): Observable<string> {
    const body = {
      ...req,
      workflowType: this.workflowInt(req.workflowType),
    };
    return this.post<unknown>('/projects', body).pipe(map((r) => this.unwrapId(r, 'projectId')));
  }

  update(id: string, req: UpdateProjectRequest): Observable<unknown> {
    return this.put(`/projects/${id}`, req);
  }

  /**
   * crmp P-9: `DELETE /api/projects/{id}` (ProjectEndpoints.cs:85). 409 `projects.NotDeletable` (with its
   * reason) and 403 `projects.InsufficientLevel` are shown by the caller, so the global toast skips them.
   */
  remove(id: string): Observable<unknown> {
    return this.delete(`/projects/${id}`, undefined, { context: handled(403, 409) });
  }

  /**
   * `PUT /api/projects/{id}/status?status=<int>` → 204. The backend binds `ProjectStatus status`
   * from the query string (ProjectEndpoints.cs:59-60), not the body; the enum ordinals are
   * Projects.Contracts `ProjectStatus` (Draft=1 … Cancelled=5).
   */
  setStatus(id: string, status: ProjectStatus): Observable<unknown> {
    // crmp P-9: 409 StagesOpen / TasksOpen / InvalidStatusTransition / ConcurrentUpdate are shown inline.
    return this.put(`/projects/${id}/status?status=${this.statusInt(status)}`, null, {
      context: handled(403, 409),
    });
  }

  /** `PUT /api/projects/{id}/active?isActive=true` → 204 (ProjectEndpoints.cs:67-68). */
  activate(id: string): Observable<unknown> {
    return this.put(`/projects/${id}/active?isActive=true`, null, { context: handled(403, 409) });
  }
  /** `PUT /api/projects/{id}/active?isActive=false` → 204 (ProjectEndpoints.cs:67-68). */
  deactivate(id: string): Observable<unknown> {
    return this.put(`/projects/${id}/active?isActive=false`, null, { context: handled(403, 409) });
  }

  // ---- financial query drilldowns (financial-queries spec) ----------------
  // invoices / boq-snapshots / variations are NOT under /financial/ — they sit
  // directly under the project (ProjectFinancialEndpoints.cs:43,47,51).

  getInvoices(projectId: string): Observable<InvoiceResponse[]> {
    return this.get<unknown>(`/projects/${projectId}/invoices`).pipe(
      map((r) => this.unwrapArray<InvoiceResponse>(r)),
    );
  }

  getBoqSnapshots(projectId: string): Observable<BoqSnapshotResponse[]> {
    return this.get<unknown>(`/projects/${projectId}/boq-snapshots`).pipe(
      map((r) => this.unwrapArray<BoqSnapshotResponse>(r)),
    );
  }

  getVariations(
    projectId: string,
    status?: VariationResponse['status'],
  ): Observable<VariationResponse[]> {
    return this.get<unknown>(`/projects/${projectId}/variations`, { status }).pipe(
      map((r) => this.unwrapArray<VariationResponse>(r)),
    );
  }

  /** Paged ledger movements at project scope (skip/take envelope). */
  getFinancialMovements(
    projectId: string,
    params?: {
      fromDate?: string;
      toDate?: string;
      type?: LedgerMovementResponse['type'];
      direction?: LedgerMovementResponse['direction'];
      skip?: number;
      take?: number;
    },
  ): Observable<PagedResponse<LedgerMovementResponse>> {
    return this.get<unknown>(`/projects/${projectId}/financial/movements`, params).pipe(
      map((r) => this.unwrap<PagedResponse<LedgerMovementResponse>>(r)),
    );
  }

  // ---- normalisation (public bits reused by stage/task services) ----------

  private normalizePaged(response: unknown): PagedResult<Project> {
    const value = this.unwrap<Record<string, unknown>>(response);
    const items = this.unwrapArray(this.field<unknown>(value, 'items') ?? value).map((p) =>
      this.normalizeProject(p),
    );
    return {
      items,
      totalCount: this.field<number>(value, 'totalCount') ?? items.length,
      page: this.field<number>(value, 'page', 'pageNumber') ?? 1,
      pageSize: this.field<number>(value, 'pageSize') ?? items.length,
      totalPages: this.field<number>(value, 'totalPages') ?? 1,
    };
  }

  normalizeProject(source: unknown): Project {
    return {
      id: this.field<string>(source, 'id', 'projectId') ?? '',
      trackKey: this.trackKeyFor(source, 'Project.id', 'id', 'projectId'),
      code: this.field<string>(source, 'code') ?? '',
      name: this.field<string>(source, 'name') ?? '',
      status: this.mapEnum<ProjectStatus>(this.field(source, 'status'), this.STATUS, 'Draft'),
      description: this.field<string | null>(source, 'description') ?? null,
      notes: this.field<string | null>(source, 'notes') ?? null,
      workflowType: this.mapEnum<WorkflowType>(
        this.field(source, 'workflowType'),
        this.WORKFLOW,
        'Stage',
      ),
      address: this.field<string>(source, 'address') ?? '',
      clientId: this.field<string>(source, 'clientId') ?? '',
      clientName: this.field<string>(source, 'clientName') ?? '',
      // ProjectResponse / ProjectDetailsProjectResponse name the owner `OwnerId` (an hr employee id)
      // and the planned dates `EstimatedStartDate` / `EstimatedEndDate` (ProjectContracts.cs:18-22,
      // 66-70). Neither carries an owner name or a budget: those stay '' / 0 and the pages show '—'.
      productOwnerId: this.field<string>(source, 'ownerId', 'productOwnerId') ?? '',
      productOwnerName: this.field<string>(source, 'productOwnerName') ?? '',
      estimatedBudget: this.num(this.field(source, 'estimatedBudget')),
      progressPercentage: this.num(this.field(source, 'progressPercentage', 'progress')),
      startDate: this.field<string | null>(source, 'estimatedStartDate', 'startDate') ?? null,
      endDate: this.field<string | null>(source, 'estimatedEndDate', 'endDate') ?? null,
      actualStartDate: this.field<string | null>(source, 'actualStartDate') ?? null,
      actualEndDate: this.field<string | null>(source, 'actualEndDate', 'actualEndData') ?? null,
      stageCount: this.num(this.field(source, 'stageCount')),
      isActive: this.field<boolean>(source, 'isActive') ?? true,
      myLevel: toProjectLevel(this.field(source, 'myLevel')),
      financial: this.field<ProjectFinancialBlock>(source, 'financial'),
    };
  }

  normalizeStage(source: unknown, projectId: string): ProjectStage {
    const rawTasks = this.field<unknown[]>(source, 'tasks') ?? [];
    return {
      id: this.field<string>(source, 'id', 'stageId') ?? '',
      projectId: this.field<string>(source, 'projectId') ?? projectId,
      stageId:
        this.field<string | null>(source, 'stageTemplateStageId') ??
        this.field<string | null>(source, 'stageId') ??
        null,
      name: this.field<string>(source, 'name') ?? '',
      description: this.field<string | null>(source, 'description') ?? null,
      order: this.num(this.field(source, 'order')),
      status: this.mapEnum<StageStatus>(this.field(source, 'status'), this.STAGE_STATUS, 'Locked'),
      kind: (this.field<string>(source, 'kind', 'stageKind') as ProjectStage['kind']) ?? undefined,
      nameAr: this.field<string | null>(source, 'nameAr', 'arabicName') ?? null,
      parallelGroup: this.field<string | null>(source, 'parallelGroup') ?? null,
      progressPercent: this.num(this.field(source, 'progressPercent', 'progressPercentage')),
      completedTasks: this.num(this.field(source, 'completedTasks')),
      totalTasks: this.num(this.field(source, 'totalTasks')),
      estimatedStartDate: this.field<string | null>(source, 'estimatedStartDate') ?? null,
      estimatedEndDate: this.field<string | null>(source, 'estimatedEndDate') ?? null,
      startedOnUtc: this.field<string | null>(source, 'startedOnUtc', 'actualStartDate') ?? null,
      completedOnUtc: this.field<string | null>(source, 'completedOnUtc', 'actualEndDate') ?? null,
      notes: this.field<string | null>(source, 'notes') ?? null,
      tasks: (Array.isArray(rawTasks) ? rawTasks : []).map((t) => this.normalizeTask(t, projectId)),
      financial: this.field<ProjectStageFinancialBlock>(source, 'financial'),
      // Feature 004 — present only on the details/with-tasks responses. Non-null ⇔ CRM
      // (FR-005); absent here (undefined) on list rows, which is a DIFFERENT state from
      // an explicit `null` and both must read as "not CRM" (see `WorkspaceHost.crm`).
      crm: this.field<ProjectStage['crm']>(source, 'crm') ?? null,
    };
  }

  normalizeTask(source: unknown, projectId: string): ProjectTask {
    return {
      id: this.field<string>(source, 'id', 'taskId') ?? '',
      projectId: this.field<string>(source, 'projectId') ?? projectId,
      projectStageId: this.field<string | null>(source, 'projectStageId', 'stageId') ?? null,
      stageTaskId: this.field<string | null>(source, 'stageTaskId') ?? null,
      assignedToId: this.field<string | null>(source, 'assignedToId') ?? null,
      name: this.field<string>(source, 'name') ?? '',
      description: this.field<string | null>(source, 'description') ?? null,
      order: this.num(this.field(source, 'order')),
      status: this.mapEnum<ProjectTaskStatus>(
        this.field(source, 'status'),
        this.TASK_STATUS,
        'Open',
      ),
      priority: this.mapEnum<TaskPriority>(this.field(source, 'priority'), this.PRIORITY, 'Medium'),
      weight: this.num(this.field(source, 'weight')),
      notes: this.field<string | null>(source, 'notes') ?? null,
      estimatedStartDate: this.field<string | null>(source, 'estimatedStartDate') ?? null,
      startedOnUtc: this.field<string | null>(source, 'startedOnUtc', 'actualStartDate') ?? null,
      completedOnUtc: this.field<string | null>(source, 'completedOnUtc', 'actualEndDate') ?? null,
      dueDate: this.field<string | null>(source, 'dueDate') ?? null,
      progressPercent: this.numOrNull(
        this.field(source, 'subTaskProgressPercent', 'progressPercent'),
      ),
      financial: this.field<ProjectTaskFinancialBlock>(source, 'financial'),
      // Feature 004 — present only on ProjectTaskDetailsResponse. See the stage note above.
      crm: this.field<ProjectTask['crm']>(source, 'crm') ?? null,
    };
  }

  normalizeSubTask(source: unknown, taskId: string): ProjectSubTask {
    return {
      id: this.field<string>(source, 'id') ?? '',
      projectTaskId: this.field<string>(source, 'projectTaskId') ?? taskId,
      title: this.field<string>(source, 'title', 'name') ?? '',
      description: this.field<string>(source, 'description') ?? null,
      order: this.num(this.field(source, 'order')),
      isRequired: this.field<boolean>(source, 'isRequired') ?? false,
      isDone: this.field<boolean>(source, 'isDone') ?? false,
    };
  }

  private readonly MEMBER_ACCESS: Record<number, string> = {
    1: 'Viewer',
    2: 'Contributor',
    3: 'Manager',
  };
  accessInt(v: ProjectMemberAccess): number {
    return v === 'Manager' ? 3 : v === 'Contributor' ? 2 : 1;
  }

  normalizeMember(source: unknown, projectId: string): ProjectMember {
    return {
      id: this.field<string>(source, 'id') ?? '',
      projectId: this.field<string>(source, 'projectId') ?? projectId,
      employeeId: this.field<string>(source, 'employeeId') ?? '',
      access: this.mapEnum<ProjectMemberAccess>(
        this.field(source, 'access'),
        this.MEMBER_ACCESS,
        'Viewer',
      ),
      canManage: this.field<boolean>(source, 'canManage') ?? false,
      canExecuteTasks: this.field<boolean>(source, 'canExecuteTasks') ?? false,
      employeeName: this.field<string | null>(source, 'employeeName') ?? null,
      addedAtUtc: this.field<string | null>(source, 'addedAtUtc') ?? null,
    };
  }

  normalizeGate(source: unknown): GateCondition {
    return {
      id: this.field<string>(source, 'id') ?? '',
      ownerId: this.field<string>(source, 'ownerId', 'projectStageId', 'projectTaskId') ?? '',
      conditionType: this.mapEnum<GateCondition['conditionType']>(
        this.field(source, 'conditionType'),
        this.CONDITION,
        'ManualCheck',
      ),
      trigger: this.mapEnum<GateCondition['trigger']>(
        this.field(source, 'trigger'),
        this.TRIGGER,
        'Unlock',
      ),
      referencedTaskId: this.field<string | null>(source, 'referencedTaskId') ?? null,
      referencedStageId: this.field<string | null>(source, 'referencedStageId') ?? null,
      referencedDocumentId: this.field<string | null>(source, 'referencedDocumentId') ?? null,
      approvalType: this.mapEnumNullable<GateCondition['approvalType'] & string>(
        this.field(source, 'approvalType'),
        this.APPROVAL,
      ),
      label: this.field<string>(source, 'label') ?? '',
      // crmp A-2: GateConditionResponse carries `status` (1 Pending, 2 Satisfied, 3 Rejected), not
      // isSatisfied (gap table P-71/98; dms Projects.Contracts/Gates/GateContracts.cs:8).
      status: this.mapEnum<GateStatus>(this.field(source, 'status'), this.GATE_STATUS, 'Pending'),
      isSatisfied:
        this.field<boolean>(source, 'isSatisfied') ??
        this.mapEnum<GateStatus>(this.field(source, 'status'), this.GATE_STATUS, 'Pending') ===
          'Satisfied',
      approvalId: this.field<string | null>(source, 'approvalId') ?? null,
      satisfiedById: this.field<string | null>(source, 'satisfiedById') ?? null,
      satisfiedAt: this.field<string | null>(source, 'satisfiedAt') ?? null,
      satisfiedNote: this.field<string | null>(source, 'satisfiedNote') ?? null,
    };
  }

  /**
   * `ProjectDetailsResponse` (Projects.Contracts/Projects/ProjectContracts.cs:57-85):
   * `{ project, stages[{ …, tasks, taskCounts, gates }], unstagedTasks, taskCounts, gates }`.
   * Enums arrive as ints and map through the read maps below.
   */
  private normalizeDetails(source: unknown): ProjectDetails {
    const project = this.normalizeProject(this.field<unknown>(source, 'project') ?? source);
    const stages = (this.field<unknown[]>(source, 'stages') ?? [])
      .map((s) => ({
        ...this.normalizeStage(s, project.id),
        taskCounts: this.normalizeTaskCounts(this.field(s, 'taskCounts')),
        gates: this.normalizeGateSummary(this.field(s, 'gates')),
      }))
      .sort((a, b) => a.order - b.order);
    const unstagedTasks = (this.field<unknown[]>(source, 'unstagedTasks') ?? []).map((t) =>
      this.normalizeTask(t, project.id),
    );
    const myLevel = toProjectLevel(this.field(source, 'myLevel'));
    return {
      myLevel,
      project: { ...project, myLevel },
      stages,
      unstagedTasks,
      taskCounts: this.normalizeTaskCounts(this.field(source, 'taskCounts')),
      gates: this.normalizeGateSummary(this.field(source, 'gates')),
    };
  }

  private normalizeTaskCounts(source: unknown): TaskStatusCount[] {
    return (Array.isArray(source) ? source : []).map((c: unknown) => ({
      status: this.mapEnum<ProjectTaskStatus>(this.field(c, 'status'), this.TASK_STATUS, 'Open'),
      count: this.num(this.field(c, 'count')),
    }));
  }

  normalizeGateSummary(source: unknown): GateSummary {
    return {
      total: this.num(this.field(source, 'total')),
      pending: this.num(this.field(source, 'pending')),
      satisfied: this.num(this.field(source, 'satisfied')),
      rejected: this.num(this.field(source, 'rejected')),
    };
  }

  private num(v: unknown): number {
    const n = typeof v === 'string' ? parseFloat(v) : (v as number);
    return typeof n === 'number' && !isNaN(n) ? n : 0;
  }

  /** Like `num`, but an absent or unparseable value stays `null` instead of reading as 0. */
  private numOrNull(v: unknown): number | null {
    if (v === null || v === undefined || v === '') return null;
    const n = typeof v === 'string' ? parseFloat(v) : (v as number);
    return typeof n === 'number' && !isNaN(n) ? n : null;
  }

  // ---- enum normalisation (backend mixes int + string — see docs §9.1) ----
  private readonly WORKFLOW: Record<number, string> = { 1: 'Stage', 2: 'FreeStyle' };
  private readonly STATUS: Record<number, string> = {
    1: 'Draft',
    2: 'InProgress',
    3: 'OnHold',
    4: 'Completed',
    5: 'Cancelled',
  };
  private readonly STAGE_STATUS: Record<number, string> = {
    1: 'Locked',
    2: 'Active',
    3: 'Completed',
    4: 'Rejected',
  };
  private readonly TASK_STATUS: Record<number, string> = {
    1: 'Locked',
    2: 'Open',
    3: 'InProgress',
    4: 'Completed',
    5: 'PendingApproval',
    6: 'Rejected',
    7: 'Cancelled',
  };
  private readonly PRIORITY: Record<number, string> = {
    1: 'Low',
    2: 'Medium',
    3: 'High',
    4: 'Urgent',
  };
  private readonly TRIGGER: Record<number, string> = { 1: 'Unlock', 2: 'Complete' };
  private readonly GATE_STATUS: Record<number, string> = {
    1: 'Pending',
    2: 'Satisfied',
    3: 'Rejected',
  };
  private readonly CONDITION: Record<number, string> = {
    1: 'Task',
    2: 'Stage',
    3: 'Approval',
    4: 'ManualCheck',
    5: 'Attachment',
    6: 'Budget',
    7: 'CrmPeriodClosed',
    8: 'CrmBriefApproved',
    9: 'CrmItemsResolved',
    10: 'DocumentApproved',
  };
  private readonly APPROVAL: Record<number, string> = { 1: 'ManagerApproval', 2: 'ClientReview' };

  /** Accept an enum value as either its integer or its string name. */
  private mapEnum<T extends string>(v: unknown, byInt: Record<number, string>, fallback: T): T {
    if (typeof v === 'number') return (byInt[v] as T) ?? fallback;
    if (typeof v === 'string' && v !== '') {
      const n = Number(v);
      if (!isNaN(n) && byInt[n]) return byInt[n] as T;
      return v as T;
    }
    return fallback;
  }
  private mapEnumNullable<T extends string>(v: unknown, byInt: Record<number, string>): T | null {
    if (v === null || v === undefined || v === '') return null;
    if (typeof v === 'number') return (byInt[v] as T) ?? null;
    const n = Number(v);
    if (typeof v === 'string' && !isNaN(n) && byInt[n]) return byInt[n] as T;
    return v as T;
  }

  // ---- string → integer codes for WRITE payloads (no string-enum converter) -
  workflowInt(v: WorkflowType): number {
    return v === 'FreeStyle' ? 2 : 1;
  }
  statusInt(v: ProjectStatus): number {
    return (
      (
        { Draft: 1, InProgress: 2, OnHold: 3, Completed: 4, Cancelled: 5 } as Record<string, number>
      )[v] ?? 1
    );
  }
  /** `ProjectTaskStatus` (dms `Projects.Contracts/Enums.cs`) for the task list's `status` filter. */
  taskStatusInt(v: ProjectTaskStatus): number {
    const byName: Record<string, number> = {
      Locked: 1,
      Open: 2,
      InProgress: 3,
      Completed: 4,
      PendingApproval: 5,
      Rejected: 6,
      Cancelled: 7,
    };
    return byName[v] ?? 2;
  }
  priorityInt(v: TaskPriority): number {
    return ({ Low: 1, Medium: 2, High: 3, Urgent: 4 } as Record<string, number>)[v] ?? 2;
  }
  triggerInt(v: GateTrigger): number {
    return v === 'Complete' ? 2 : 1;
  }
  conditionInt(v: ConditionType): number {
    return (
      (
        {
          Task: 1,
          Stage: 2,
          Approval: 3,
          ManualCheck: 4,
          Attachment: 5,
          Budget: 6,
          CrmPeriodClosed: 7,
          CrmBriefApproved: 8,
          CrmItemsResolved: 9,
          DocumentApproved: 10,
        } as Record<string, number>
      )[v] ?? 4
    );
  }
  approvalInt(v: ApprovalType): number {
    return v === 'ClientReview' ? 2 : 1;
  }

  /** `CreateGateRequest` (dms `GateEndpoints.cs:78`): enums as ints; the owner is in the route. */
  gateBody(req: CreateGateConditionRequest): Record<string, unknown> {
    return {
      conditionType: this.conditionInt(req.conditionType),
      trigger: this.triggerInt(req.trigger),
      label: req.label,
      referencedTaskId: req.referencedTaskId ?? null,
      referencedStageId: req.referencedStageId ?? null,
      referencedDocumentId: req.referencedDocumentId ?? null,
      approvalType: req.approvalType ? this.approvalInt(req.approvalType) : null,
    };
  }
}
