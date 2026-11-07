import type { ProjectLevel } from './project-actions';
// ============================================================================
// Project workflow domain — TypeScript mirror of the .NET backend DTOs/enums.
//
// Projects → Stages → Tasks, with a dynamic gate-condition engine. A project is
// either `Stage` (ordered stages) or `FreeStyle` (tasks without stages). Field
// names follow the backend response DTOs (camelCased by the JSON serializer).
// ============================================================================

import type {
  ProjectFinancialBlock,
  ProjectStageFinancialBlock,
  ProjectTaskFinancialBlock,
} from '@modules/finance';
import type {
  WorkspaceCrmStageBlock as CrmStageBlock,
  WorkspaceCrmTaskBlock as CrmTaskBlock,
} from '@platform/composition/task-workspace.token';

export type WorkflowType = 'Stage' | 'FreeStyle';
export type ProjectStatus = 'Draft' | 'InProgress' | 'OnHold' | 'Completed' | 'Cancelled';
// Mirrors Domain.Enums.StageStatus (Locked=1, Active=2, Completed=3, Rejected=4).
export type StageStatus = 'Locked' | 'Active' | 'Completed' | 'Rejected';
export type StageKind = 'Task' | 'Gate' | 'Approval' | 'Milestone';
// Mirrors Projects.Contracts ProjectTaskStatus (Locked=1 … PendingApproval=5, Rejected=6, Cancelled=7).
export type ProjectTaskStatus =
  'Locked' | 'Open' | 'InProgress' | 'Completed' | 'PendingApproval' | 'Rejected' | 'Cancelled';
export type TaskPriority = 'Low' | 'Medium' | 'High' | 'Urgent';
/**
 * Gate-condition kinds. Mirrors `Domain/Enums/ConditionType.cs` — modelled here as
 * a string union (the shape this repo already uses for gate DTOs), with the exact
 * backend integers supplied by `ProjectService.conditionInt()`.
 *
 * `Budget = 6` and the three CRM members (7/8/9) were added by feature 004. Every
 * exhaustive `Record<ConditionType, string>` must cover them or the gate strip
 * falls back to raw enum names.
 */
export type ConditionType =
  | 'Task'
  | 'Stage'
  | 'Approval'
  | 'ManualCheck'
  | 'Attachment'
  | 'Budget'
  | 'CrmPeriodClosed'
  | 'CrmBriefApproved'
  | 'CrmItemsResolved';
export type GateTrigger = 'Unlock' | 'Complete';
export type ApprovalType = 'ManagerApproval' | 'ClientReview';
export type ProjectMemberAccess = 'Viewer' | 'Contributor' | 'Manager';

// ---- Projects --------------------------------------------------------------

/** Mirrors ProjectResponse. */
export interface Project {
  id: string;
  /** Human-readable project code (e.g. `PRJ-001`) — returned by ProjectResponse. */
  code: string;
  name: string;
  status: ProjectStatus;
  description: string | null;
  notes: string | null;
  workflowType: WorkflowType;
  address: string;
  clientId: string;
  clientName: string;
  productOwnerId: string;
  productOwnerName: string;
  estimatedBudget: number;
  progressPercentage: number;
  startDate: string | null;
  endDate: string | null;
  actualStartDate: string | null;
  actualEndDate: string | null;
  /** ProjectResponse.StageCount — 0 until a template or a confirmed scope of work creates stages (008b #3). */
  stageCount: number;
  /** ProjectResponse.IsActive — the soft-delete flag; `true` when absent (008b #4). */
  isActive: boolean;
  /**
   * crmp A-3: the caller's effective level on this project (`ProjectResponse.MyLevel`, contract
   * §2.17.2; 1 Viewer, 2 Editor, 3 Manager). Viewer when absent, the least privilege.
   */
  myLevel: ProjectLevel;
  /** Financial block — present on enriched project responses (financial-queries spec). */
  financial?: ProjectFinancialBlock;
  /** Render-only `@for` key — synthetic when the server omitted `id`. Never send it. */
  trackKey: string;
}

/** Paged list row — the backend returns the full ProjectResponse, so this is an alias. */
export type ProjectListItem = Project;

/** Mirrors Projects.Contracts `TaskStatusCount` — only the statuses that occur are listed. */
export interface TaskStatusCount {
  status: ProjectTaskStatus;
  count: number;
}

/** Mirrors Projects.Contracts `GateSummary` — the gates owned by a stage (or project) and its tasks. */
export interface GateSummary {
  total: number;
  pending: number;
  satisfied: number;
  rejected: number;
}

/**
 * Mirrors ProjectDetailsResponse (`GET /api/projects/{id}/details`) — the hub's one-shot load.
 * `taskCounts` counts every task of the project by status; `gates` summarises every gate.
 */
export interface ProjectDetails {
  /**
   * The caller's level, at the top of `ProjectDetailsResponse` (not inside `project`, whose
   * `ProjectDetailsProjectResponse` has none). The normalizer copies it onto `project.myLevel` too.
   */
  myLevel: ProjectLevel;
  project: Project;
  stages: ProjectStage[];
  unstagedTasks: ProjectTask[];
  taskCounts: TaskStatusCount[];
  gates: GateSummary;
}

// ---- Stages ----------------------------------------------------------------

/** Mirrors ProjectStageWithTasksResponse / ProjectStageResponse (superset). */
export interface ProjectStage {
  id: string;
  projectId: string;
  stageId: string | null; // template stage id, if seeded from a StageTemplate
  name: string;
  description: string | null;
  order: number;
  status: StageStatus;
  kind?: StageKind;
  nameAr?: string | null;
  parallelGroup?: string | null;
  progressPercent: number;
  completedTasks: number;
  totalTasks: number;
  /** Planned start (EstimatedStartDate) — user-settable while editing the stage. */
  estimatedStartDate: string | null;
  /** Planned target/end (EstimatedEndDate) — user-settable while editing the stage. */
  estimatedEndDate: string | null;
  /** Actual start (ActualStartDate) — stamped on activate. */
  startedOnUtc: string | null;
  /** Actual completion (ActualEndDate) — stamped on complete. */
  completedOnUtc: string | null;
  notes: string | null;
  tasks: ProjectTask[]; // present on the with-tasks/details responses
  /** Financial block — present on enriched stage responses (financial-queries spec). */
  financial?: ProjectStageFinancialBlock;
  /**
   * The CRM block (feature 004) — present ONLY on the details responses
   * (`ProjectStageResponse` / `ProjectStageWithTasksResponse`), absent from
   * `ProjectStageListResponse`. **Non-null ⇔ this stage is CRM (FR-005)** — never
   * re-derive CRM-ness from a name, a status, or any other signal.
   */
  crm?: CrmStageBlock | null;
  /** The stage's task counts by status — present only on the project details response. */
  taskCounts?: TaskStatusCount[];
  /** The stage's gate summary (stage- and task-owned) — present only on the project details response. */
  gates?: GateSummary;
}

// ---- Tasks -----------------------------------------------------------------

/** Mirrors ProjectTaskResponse / ProjectTaskListResponse (superset). */
export interface ProjectTask {
  id: string;
  projectId: string;
  projectStageId: string | null;
  stageTaskId: string | null;
  assignedToId: string | null;
  name: string;
  description: string | null;
  order: number;
  status: ProjectTaskStatus;
  priority: TaskPriority;
  weight: number;
  notes: string | null;
  /** Planned start (estimatedStartDate). Editable while the task is still Open. */
  estimatedStartDate: string | null;
  startedOnUtc: string | null;
  completedOnUtc: string | null;
  dueDate: string | null;
  /**
   * Cached sub-task progress, used as the task progress bar. `null` when the response carries
   * none — `ProjectTaskResponse` has no progress field, so the UI shows a dash, never a fake 0%.
   */
  progressPercent: number | null;
  /** Financial block — present on enriched task responses + by-stage rows (financial-queries spec). */
  financial?: ProjectTaskFinancialBlock;
  /**
   * The CRM block (feature 004) — present ONLY on `ProjectTaskDetailsResponse`, absent
   * from `ProjectTaskResponse` / `ProjectTaskListResponse`. Non-null iff the task has its
   * own CRM entries/items (`entryTotal + itemTotal > 0`) — the task's `briefStatus` is
   * pulled from the STAGE's brief, since the task workspace composes the stage's head
   * with the task's own entries, never a task-level brief.
   */
  crm?: CrmTaskBlock | null;
}

export interface ProjectSubTask {
  id: string;
  projectTaskId: string;
  title: string;
  order: number;
  isRequired: boolean;
  isDone: boolean;
}

// ---- Gate conditions -------------------------------------------------------

/** Mirrors StageGateConditionResponse / TaskGateConditionResponse. */
export interface GateCondition {
  id: string;
  ownerId: string; // the stage id (stage gate) or task id (task gate)
  conditionType: ConditionType;
  trigger: GateTrigger;
  referencedTaskId: string | null;
  referencedStageId: string | null;
  approvalType: ApprovalType | null;
  label: string;
  /** crmp A-2: the backend's GateStatus (1 Pending, 2 Satisfied, 3 Rejected). */
  status: GateStatus;
  isSatisfied: boolean;
  /** The approval an Approval gate waits on (null otherwise). */
  approvalId: string | null;
  satisfiedById: string | null;
  satisfiedAt: string | null;
  satisfiedNote: string | null;
}

// ---- Members ---------------------------------------------------------------

export interface ProjectMember {
  id: string;
  projectId: string;
  employeeId: string;
  access: ProjectMemberAccess;
  canManage: boolean;
  canExecuteTasks: boolean;
  /** Resolved client-side (response only exposes employeeId — docs §9.5). */
  employeeName?: string | null;
  /** crmp P-1: `ProjectMemberResponse.AddedAtUtc` (dms `MemberContracts.cs:7`). */
  addedAtUtc?: string | null;
}

export interface TaskComment {
  id: string;
  taskId: string;
  employeeId: string;
  content: string;
  createdAtUtc: string;
  updatedAtUtc: string | null;
  employeeName?: string | null;
}

export interface TaskAttachment {
  id: string;
  taskId: string;
  ruleId: string | null;
  fileName: string;
  contentType: string;
  fileSizeBytes: number;
  uploadedById: string;
  uploadedOnUtc: string;
}

// ---- Request payloads ------------------------------------------------------

/** Mirrors CreateProjectCommand (008b #2). The server sets the status; there is no budget field. */
export interface CreateProjectRequest {
  /** Required, ≤ 50 chars (CreateProjectCommandValidator). */
  code: string;
  name: string;
  address: string;
  clientId: string;
  workflowType: WorkflowType;
  stageTemplateId?: string | null;
  notes?: string | null;
  description?: string | null;
  estimatedStartDate?: string | null;
  estimatedEndDate?: string | null;
}
export interface UpdateProjectRequest {
  name: string;
  description?: string | null;
  notes?: string | null;
}
export interface UpdateProjectStatusRequest {
  status: ProjectStatus;
}

/** `StageRequest` (dms `StageEndpoints.cs:93`); the project is in the route. */
export interface CreateProjectStageRequest {
  name: string;
  order: number;
  /** The template stage to copy from (P-2: "optionally from a template stage"). */
  templateStageId?: string | null;
  description?: string | null;
  notes?: string | null;
  estimatedStartDate?: string | null;
  estimatedEndDate?: string | null;
}
export interface UpdateProjectStageRequest {
  name: string;
  order: number;
  description?: string | null;
  notes?: string | null;
  estimatedStartDate?: string | null;
  estimatedEndDate?: string | null;
}

/** `TaskRequest` (dms `TaskEndpoints.cs:228`); the project is in the route. */
export interface CreateProjectTaskRequest {
  name: string;
  order: number;
  weight: number;
  priority: TaskPriority;
  projectStageId?: string | null;
  assignedToId?: string | null;
  dueDate?: string | null;
  description?: string | null;
  notes?: string | null;
}
export interface UpdateProjectTaskRequest {
  name: string;
  order: number;
  weight: number;
  priority: TaskPriority;
  dueDate?: string | null;
  description?: string | null;
  notes?: string | null;
}

export type GateStatus = 'Pending' | 'Satisfied' | 'Rejected';

/** Gate create body (dms `GateEndpoints.cs:78`); the stage or task is in the route. */
export interface CreateGateConditionRequest {
  conditionType: ConditionType;
  trigger: GateTrigger;
  label: string;
  referencedTaskId?: string | null;
  referencedStageId?: string | null;
  approvalType?: ApprovalType | null;
}
export interface SatisfyGateConditionRequest {
  note?: string | null;
}

/** `SubTaskRequest` (dms `TaskEndpoints.cs:232`); the task id is in the route. */
export interface CreateProjectSubTaskRequest {
  title: string;
  description?: string | null;
  order: number;
  isRequired: boolean;
}
export interface UpdateProjectSubTaskRequest {
  title: string;
  description?: string | null;
  order: number;
  isRequired: boolean;
}

/** Mirrors ProjectTaskDetailsResponse — task + its subtasks + its gate conditions. */
/** `ProjectTaskDetailsResponse` (dms `Projects.Contracts/Tasks/TaskContracts.cs:57`). */
export interface TaskDetails {
  task: ProjectTask;
  subTasks: ProjectSubTask[];
  subTasksCount: number;
  commentsCount: number;
  /** Gate counts; the list itself is `GET …/tasks/{taskId}/gates`. */
  gates: GateSummary;
}

export interface AddProjectMemberRequest {
  projectId: string;
  employeeId: string;
  access: ProjectMemberAccess;
}
export interface ChangeProjectMemberAccessRequest {
  access: ProjectMemberAccess;
}

export interface AssignTaskRequest {
  assignedToId: string;
}
