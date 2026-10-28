import { Injectable } from '@angular/core';
import { Observable } from 'rxjs';
import { map } from 'rxjs/operators';
import {
  ApprovalRequestResponse,
  ApprovalType,
  ConditionType,
  CreateProjectRequest,
  GateCondition,
  GateTrigger,
  Project,
  ProjectDetails,
  ProjectMember,
  ProjectMemberAccess,
  ProjectStage,
  ProjectStatus,
  ProjectSubTask,
  ProjectTask,
  ProjectTaskStatus,
  StageStatus,
  TaskPriority,
  UpdateProjectRequest,
  WorkflowType,
} from '../model/project.model';
import {
  BoqSnapshotResponse,
  InvoiceResponse,
  LedgerMovementResponse,
  PagedResponse,
  ProjectBudgetSummaryResponse,
  ProjectFinancialBlock,
  ProjectStageFinancialBlock,
  ProjectTaskFinancialBlock,
  VariationResponse,
} from '@modules/finance';
import { ApiService } from '@platform/http/api.service';
import { PagedResult } from '@platform/types';

/**
 * Canonical project service for the workflow hub. Talks to the real backend
 * (`/api/projects`) and normalises responses defensively, like the other
 * core/http services. No mock fallback — failures surface through the error
 * interceptor.
 */
@Injectable({ providedIn: 'root' })
export class ProjectService extends ApiService {
  getAll(page = 1, pageSize = 20): Observable<PagedResult<Project>> {
    return this.get<unknown>('/projects', { pageNumber: page, pageSize }).pipe(
      map((response) => this.normalizePaged(response)),
    );
  }

  getMine(page = 1, pageSize = 20): Observable<PagedResult<Project>> {
    return this.get<unknown>('/projects/mine', { pageNumber: page, pageSize }).pipe(
      map((response) => this.normalizePaged(response)),
    );
  }

  /** `GET /api/projects/by-client/{clientId}` — every project for one client. */
  getByClient(clientId: string, pageSize = 100): Observable<Project[]> {
    return this.get<unknown>(`/projects/by-client/${clientId}`, { pageNumber: 1, pageSize }).pipe(
      map((response) => this.normalizePaged(response).items),
    );
  }

  getById(id: string): Observable<Project> {
    return this.get<unknown>(`/projects/${id}`).pipe(
      map((r) => this.normalizeProject(this.unwrap(r))),
    );
  }

  /** The hub's one-shot load: project + stages (with tasks) + unstaged tasks. */
  getDetails(id: string): Observable<ProjectDetails> {
    return this.get<unknown>(`/projects/${id}/details`).pipe(
      map((r) => this.normalizeDetails(this.unwrap(r))),
    );
  }

  /**
   * Header budget KPI — caps + actuals rolled up at project/stage/task scope.
   * GET /api/projects/{id}/budget-summary (ProjectEndpoints.cs:GetBudgetSummaryAsync).
   */
  getBudgetSummary(id: string): Observable<ProjectBudgetSummaryResponse> {
    return this.get<unknown>(`/projects/${id}/budget-summary`).pipe(
      map((r) => this.unwrap<ProjectBudgetSummaryResponse>(r)),
    );
  }

  /**
   * The caller's pending-approval queue — ManagerApproval Complete gates they own,
   * across tasks + stages. GET /api/projects/approval-requests (perm Projects.Read).
   * Drives the dashboard's "Open actions" KPI; callers filter by `projectId`.
   */
  getApprovalRequests(): Observable<ApprovalRequestResponse[]> {
    return this.get<unknown>('/projects/approval-requests').pipe(
      map((r) => this.unwrapArray<ApprovalRequestResponse>(r)),
    );
  }

  create(req: CreateProjectRequest): Observable<string> {
    const body = {
      ...req,
      status: this.statusInt(req.status),
      workflowType: this.workflowInt(req.workflowType),
    };
    return this.post<unknown>('/projects', body).pipe(map((r) => this.unwrap<string>(r)));
  }

  update(id: string, req: UpdateProjectRequest): Observable<unknown> {
    return this.put(`/projects/${id}`, req);
  }

  remove(id: string): Observable<unknown> {
    return this.delete(`/projects/${id}`);
  }

  setStatus(id: string, status: ProjectStatus): Observable<unknown> {
    return this.put(`/projects/${id}/status`, { status: this.statusInt(status) });
  }

  activate(id: string): Observable<unknown> {
    return this.put(`/projects/${id}/activate`, {});
  }
  deactivate(id: string): Observable<unknown> {
    return this.put(`/projects/${id}/deactivate`, {});
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
      productOwnerId: this.field<string>(source, 'productOwnerId') ?? '',
      productOwnerName: this.field<string>(source, 'productOwnerName') ?? '',
      estimatedBudget: this.num(this.field(source, 'estimatedBudget')),
      progressPercentage: this.num(this.field(source, 'progressPercentage', 'progress')),
      startDate: this.field<string | null>(source, 'startDate') ?? null,
      endDate: this.field<string | null>(source, 'endDate') ?? null,
      actualStartDate: this.field<string | null>(source, 'actualStartDate') ?? null,
      actualEndDate: this.field<string | null>(source, 'actualEndDate', 'actualEndData') ?? null,
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
      progressPercent: this.num(this.field(source, 'subTaskProgressPercent', 'progressPercent')),
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
    };
  }

  normalizeGate(source: unknown): GateCondition {
    return {
      id: this.field<string>(source, 'id') ?? '',
      ownerId: this.field<string>(source, 'ownerId') ?? '',
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
      approvalType: this.mapEnumNullable<GateCondition['approvalType'] & string>(
        this.field(source, 'approvalType'),
        this.APPROVAL,
      ),
      label: this.field<string>(source, 'label') ?? '',
      isSatisfied: this.field<boolean>(source, 'isSatisfied') ?? false,
      satisfiedById: this.field<string | null>(source, 'satisfiedById') ?? null,
      satisfiedAt: this.field<string | null>(source, 'satisfiedAt') ?? null,
      satisfiedNote: this.field<string | null>(source, 'satisfiedNote') ?? null,
    };
  }

  private normalizeDetails(source: unknown): ProjectDetails {
    const projectRaw = this.field<unknown>(source, 'project') ?? source;
    const project = this.normalizeProject(projectRaw);
    const stages = (this.field<unknown[]>(source, 'stages') ?? [])
      .map((s) => this.normalizeStage(s, project.id))
      .sort((a, b) => a.order - b.order);
    const unstagedTasks = (this.field<unknown[]>(source, 'unstagedTasks') ?? []).map((t) =>
      this.normalizeTask(t, project.id),
    );
    return { project, stages, unstagedTasks };
  }

  private num(v: unknown): number {
    const n = typeof v === 'string' ? parseFloat(v) : (v as number);
    return typeof n === 'number' && !isNaN(n) ? n : 0;
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
  };
  private readonly PRIORITY: Record<number, string> = {
    1: 'Low',
    2: 'Medium',
    3: 'High',
    4: 'Urgent',
  };
  private readonly TRIGGER: Record<number, string> = { 1: 'Unlock', 2: 'Complete' };
  private readonly CONDITION: Record<number, string> = {
    1: 'Task',
    2: 'Stage',
    3: 'Approval',
    4: 'ManualCheck',
    5: 'Attachment',
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
        } as Record<string, number>
      )[v] ?? 4
    );
  }
  approvalInt(v: ApprovalType): number {
    return v === 'ClientReview' ? 2 : 1;
  }
}
