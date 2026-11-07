import {
  ChangeDetectionStrategy,
  Component,
  OnDestroy,
  OnInit,
  computed,
  effect,
  inject,
  signal,
} from '@angular/core';
import { FormsModule } from '@angular/forms';
import { HttpErrorResponse } from '@angular/common/http';
import { NgComponentOutlet } from '@angular/common';
import { ActivatedRoute, Router, RouterLink } from '@angular/router';
import { catchError, of } from 'rxjs';
import { ProjectTaskService } from '../../data/project-task.service';
import { ProjectService } from '../../data/project.service';
import { ProjectStageService } from '../../data/project-stage.service';
import {
  ResolvedWorkspacePanel,
  TASK_WORKSPACE,
  WorkspaceHost,
  resolveWorkspacePanels,
} from '@platform/composition/task-workspace.token';
import { BreadcrumbService, BreadcrumbCrumb } from '@platform/navigation/breadcrumb.service';
import { LocaleService } from '@platform/i18n';
import { ErrorHandlerService, friendly } from '@platform/http/error-handler.service';
import { ToastService } from '@platform/feedback/toast.service';
import { ProjectTask, TaskDetails, TaskPriority } from '../../model/project.model';
import { PermissionsService } from '@platform/permissions';
import { PERM } from '@platform/permissions';
import { formatShortDate } from '@shared/ui/status';
import { EmployeeService } from '@modules/people';
import {
  ModalService,
  PeraAvatarComponent,
  PeraButtonComponent,
  PeraDateInputComponent,
  PeraEmptyComponent,
  PeraMarkdownEditorComponent,
  PeraMarkdownViewComponent,
  PeraCardComponent,
  PeraSelectComponent,
  PeraSkeletonComponent,
  PeraTextareaComponent,
  SelectOption,
} from '@ds';
import { TaskFormDialogComponent, TaskFormDialogData } from '../dialogs/task-form-dialog.component';
import { SubtasksPanelComponent } from '../task-detail/subtasks-panel.component';
import { GateConditionsPanelComponent } from '../task-detail/gate-conditions-panel.component';
import { CatalogService } from '@platform/i18n/catalog.service';
import { ProjectAccessStore } from '../../stores/project-access.store';
import { CommentsThreadComponent } from '../task-detail/comments-thread.component';
import { AttachmentsPanelComponent } from '../task-detail/attachments-panel.component';
import { TaskStatusActionsComponent } from '../task-detail/status-actions.component';
import { ActivityFeedComponent } from '../activity/activity-feed.component';
import { DmsStatusPillComponent } from '../task-detail/dms/dms-status-pill.component';
import { DmsLinkedItemsComponent } from '../task-detail/dms/dms-linked-items.component';

type ActivityView = 'comments' | 'history';

const PRIORITY_DOT: Record<string, string> = {
  Low: 'border-2 border-border-strong',
  Medium: 'border-2 border-text-muted',
  High: 'bg-text-secondary',
  Urgent: 'bg-text-primary',
};

/**
 * Task Detail page — faithful to the DMS "Task Detail" design (`DMS Task Detail.dc.html`).
 * `1fr / 340px` grid: a vertical stack of panels on the left (Description ·
 * Subtasks · Files · Linked items · Activity) and a right rail (Details · Gate
 * conditions). No top KPI strip; status + workflow actions sit in the header
 * action row. Files is a two-level folder browser; the Gate conditions rail
 * opens a full-CRUD modal. The Financials panel moved off this page to the
 * Stage Detail / finance views (see docs/DMS_TASK_DETAIL_BACKEND_GAPS.md);
 * Activity has Comments / History tabs.
 */
@Component({
  selector: 'app-task-detail',
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [
    FormsModule,
    RouterLink,
    NgComponentOutlet,
    PeraEmptyComponent,
    PeraSkeletonComponent,
    PeraButtonComponent,
    PeraAvatarComponent,
    PeraDateInputComponent,
    PeraCardComponent,
    PeraSelectComponent,
    PeraTextareaComponent,
    PeraMarkdownEditorComponent,
    PeraMarkdownViewComponent,
    SubtasksPanelComponent,
    GateConditionsPanelComponent,
    CommentsThreadComponent,
    AttachmentsPanelComponent,
    TaskStatusActionsComponent,
    ActivityFeedComponent,
    DmsStatusPillComponent,
    DmsLinkedItemsComponent,
  ],
  template: `
    @if (loading()) {
      <div class="p-6">
        <pera-skeleton [height]="120" rounded="md" />
        <div class="h-3"></div>
        <pera-skeleton [height]="280" rounded="md" />
      </div>
    } @else if (failed()) {
      <div class="p-6">
        <pera-empty
          title="Couldn't load this task"
          description="It may have been removed, or you may not have access."
          [cta]="{ label: 'Back to project', action: backToProject.bind(this) }"
        />
      </div>
    } @else if (task(); as t) {
      <!-- Page container matches the Stage Detail page (.wrap2): --w-page, centered, 22/28/60 padding -->
      <div class="w-full max-w-[var(--w-page)] mx-auto pt-[var(--space-5)] px-6 pb-16">
        <div class="grid grid-cols-1 lg:grid-cols-[minmax(0,1fr)_var(--w-rail)] gap-6 items-start">
          <!-- ============ MAIN COLUMN ============ -->
          <div class="flex flex-col gap-4 min-w-0">
            <!-- head — breadcrumb → title → action row. No eyebrow (the breadcrumb
                 already carries the stage) and no KPI strip (decision D2). -->
            <div>
              <div
                class="flex items-center gap-2 text-text-muted mb-2.5 min-w-0"
                [style.fontSize]="'var(--fs-label)'"
              >
                <a
                  [routerLink]="['/projects', projectId()]"
                  class="text-text-muted hover:text-text-primary no-underline cursor-pointer truncate min-w-0"
                  >{{ projectName() || 'Project' }}</a
                >
                @if (t.projectStageId; as sid) {
                  <span class="text-border-strong">/</span>
                  <a
                    [routerLink]="['/projects', projectId(), 'stages', sid]"
                    class="text-text-muted hover:text-text-primary no-underline cursor-pointer truncate min-w-0"
                    >{{ stageName() || 'Stage' }}</a
                  >
                }
                <span class="text-border-strong">/</span>
                <span class="font-mono tabular-nums shrink-0">TASK · {{ t.order }}</span>
              </div>
              <h1
                class="m-0 font-semibold tracking-[-0.02em]"
                [style.fontSize]="'var(--fs-h1)'"
                [style.lineHeight]="'var(--lh-h1)'"
              >
                {{ t.name }}
              </h1>
              <div class="flex items-center gap-2 flex-wrap mt-4">
                <app-dms-status-pill [status]="t.status" />
                <app-task-status-actions
                  [task]="t"
                  (changed)="refresh()"
                  (deleted)="backToProject()"
                />
                <span class="fs-caption text-text-muted" data-task-summary>{{ summary() }}</span>
                @if (canManageTasks()) {
                  <button
                    type="button"
                    class="inline-flex items-center gap-1.5 px-2.5 py-1.5 border border-border bg-bg font-medium cursor-pointer hover:bg-surface-muted transition-colors"
                    [style.fontSize]="'var(--fs-caption)'"
                    (click)="editTask(t)"
                  >
                    <svg
                      width="13"
                      height="13"
                      viewBox="0 0 24 24"
                      fill="none"
                      stroke="currentColor"
                      stroke-width="1.7"
                      aria-hidden="true"
                    >
                      <path d="M12 20h9M16.5 3.5a2.1 2.1 0 0 1 3 3L7 19l-4 1 1-4z" />
                    </svg>
                    Edit task
                  </button>
                }
              </div>
            </div>

            <!-- description -->
            <pera-card padding="none" class="flex flex-col">
              <div class="flex items-center justify-between gap-3 px-5 py-3 border-b border-border">
                <div class="flex items-center gap-2.5 min-w-0">
                  <h3 class="font-medium text-sm text-text-primary truncate">Description</h3>
                </div>
                @if (canManageTasks()) {
                  <div class="flex items-center gap-2 shrink-0">
                    @if (editingDescription()) {
                      <pera-button
                        variant="ghost"
                        [disabled]="saving()"
                        (click)="cancelEditDescription()"
                        >Cancel</pera-button
                      >
                      <pera-button
                        variant="primary"
                        [loading]="saving()"
                        (click)="saveDescription()"
                        >Save</pera-button
                      >
                    } @else {
                      <button
                        type="button"
                        class="fs-label text-accent hover:underline cursor-pointer"
                        (click)="editingDescription.set(true)"
                      >
                        Edit
                      </button>
                    }
                  </div>
                }
              </div>
              <div class="px-4 py-3.5">
                @if (editingDescription()) {
                  <pera-markdown-editor
                    [ngModel]="descriptionDraft"
                    (ngModelChange)="descriptionDraft = $event; onDraftChange()"
                    [rows]="6"
                    defaultMode="edit"
                    [showModes]="false"
                    [autofocus]="true"
                    submitHint="Ctrl+Enter to save · Esc to cancel"
                    (submit)="saveDescription()"
                    (keydown.escape)="cancelEditDescription()"
                    placeholder="Add a description. Markdown supported."
                  />
                } @else if (t.description) {
                  <pera-markdown-view [markdown]="t.description" />
                } @else if (canManageTasks()) {
                  <button
                    type="button"
                    class="w-full text-start fs-body-sm text-text-muted border border-dashed border-border hover:border-text-muted hover:text-text-secondary px-3 py-2.5 cursor-text transition-colors"
                    (click)="editingDescription.set(true)"
                  >
                    Add a description…
                  </button>
                } @else {
                  <p class="m-0 fs-body-sm text-text-muted">No description.</p>
                }
              </div>
            </pera-card>

            <!-- subtasks — the GENERIC checklist. REPLACED by the CRM task workspace
                 (FR-027) when this task is CRM; never rendered alongside it. -->
            @if (!t.crm) {
              <pera-card padding="none" class="flex flex-col">
                <div class="flex items-center gap-2.5 px-5 py-3 border-b border-border">
                  <h3 class="font-medium text-sm text-text-primary truncate">Subtasks</h3>
                  <span
                    class="font-mono text-xs text-text-muted px-1.5 py-px bg-selected shrink-0"
                    >{{ doneSubs() + '/' + subCount() + ' done' }}</span
                  >
                </div>
                <app-subtasks-panel [projectId]="projectId()" [taskId]="taskId()" />
              </pera-card>
            }

            <!-- files (self-contained panel, mirrors the Stage Detail Files browser) -->
            <app-attachments-panel
              [taskId]="taskId()"
              [projectId]="projectId()"
              [stageName]="stageName()"
            />

            <!-- linked items -->
            <pera-card padding="none" class="flex flex-col">
              <div class="flex items-center gap-2.5 px-5 py-3 border-b border-border">
                <h3 class="font-medium text-sm text-text-primary truncate">Linked items</h3>
              </div>
              <app-dms-linked-items [taskId]="taskId()" />
            </pera-card>

            <!-- CRM task-main panel (feature 004) — registered via the core
                 TASK_WORKSPACE token; zero panels render when this task isn't CRM. -->
            @for (panel of taskMainPanels(); track panel.order) {
              <ng-container *ngComponentOutlet="panel.cmp; inputs: { host: workspaceHost() }" />
            }

            <!-- activity -->
            <pera-card padding="none" class="flex flex-col">
              <div class="flex border-b border-border px-4">
                @for (v of activityViews; track v.id) {
                  <button
                    type="button"
                    (click)="activityView.set(v.id)"
                    class="px-3.5 py-2.5 fs-caption font-medium cursor-pointer relative -mb-px border-b-2 transition-colors"
                    [class.text-text-primary]="activityView() === v.id"
                    [class.border-accent]="activityView() === v.id"
                    [class.text-text-secondary]="activityView() !== v.id"
                    [class.border-transparent]="activityView() !== v.id"
                  >
                    {{ v.label }}
                  </button>
                }
              </div>
              @switch (activityView()) {
                @case ('comments') {
                  <app-comments-thread [projectId]="projectId()" [taskId]="taskId()" />
                }
                @case ('history') {
                  <app-activity-feed entityName="Task" [entityId]="taskId()" [take]="100" />
                }
              }
            </pera-card>
          </div>

          <!-- ============ RIGHT RAIL ============ -->
          <div class="flex flex-col gap-3.5">
            <pera-card padding="none" class="flex flex-col">
              <div class="flex items-center gap-2.5 px-5 py-3 border-b border-border">
                <h3 class="font-medium text-sm text-text-primary truncate">Details</h3>
              </div>
              <div class="px-4 py-1">
                <div
                  class="grid grid-cols-[var(--w-column-sm)_1fr] gap-2.5 items-center py-2.5 border-b border-border-soft"
                >
                  <span class="fs-label text-text-muted">Status</span>
                  <span><app-dms-status-pill [status]="t.status" /></span>
                </div>
                <div
                  class="grid grid-cols-[var(--w-column-sm)_1fr] gap-2.5 items-center py-2.5 border-b border-border-soft"
                >
                  <span class="fs-label text-text-muted">Assignee</span>
                  @if (editingField() === 'assignee') {
                    <span class="flex items-center gap-1.5 min-w-0">
                      <pera-select
                        [options]="assigneeOptions()"
                        [ngModel]="t.assignedToId"
                        (ngModelChange)="saveAssignee($event)"
                        placeholder="Select an employee"
                        class="flex-1 min-w-0"
                      />
                      <button
                        type="button"
                        class="text-text-muted px-1 cursor-pointer"
                        (click)="cancelEditDate()"
                        aria-label="Cancel"
                      >
                        ✕
                      </button>
                    </span>
                  } @else {
                    <button
                      type="button"
                      class="flex items-center gap-2 fs-caption font-medium min-w-0 text-start disabled:cursor-default"
                      [class.cursor-pointer]="canAssign()"
                      [class.hover:underline]="canAssign()"
                      [disabled]="!canAssign()"
                      (click)="startEdit('assignee')"
                    >
                      @if (assigneeName(); as nm) {
                        <pera-avatar [name]="nm" size="xs" /><span class="truncate">{{ nm }}</span>
                      } @else {
                        <span class="text-text-muted font-normal">{{
                          canAssign() ? 'Assign…' : 'Unassigned'
                        }}</span>
                      }
                    </button>
                  }
                </div>
                <div
                  class="grid grid-cols-[var(--w-column-sm)_1fr] gap-2.5 items-center py-2.5 border-b border-border-soft"
                >
                  <span class="fs-label text-text-muted">Priority</span>
                  @if (editingField() === 'priority') {
                    <span class="flex items-center gap-1.5 min-w-0">
                      <pera-select
                        [options]="priorityOptions"
                        [ngModel]="t.priority"
                        (ngModelChange)="savePriority($event)"
                        class="flex-1 min-w-0"
                      />
                      <button
                        type="button"
                        class="text-text-muted px-1 cursor-pointer"
                        (click)="cancelEditDate()"
                        aria-label="Cancel"
                      >
                        ✕
                      </button>
                    </span>
                  } @else {
                    <button
                      type="button"
                      class="inline-flex items-center gap-2 fs-caption font-medium text-start disabled:cursor-default"
                      [class.cursor-pointer]="canManageTasks()"
                      [class.hover:underline]="canManageTasks()"
                      [disabled]="!canManageTasks()"
                      (click)="startEdit('priority')"
                    >
                      <span
                        class="w-2.5 h-2.5 rounded-full"
                        [class]="priorityDot(t.priority)"
                      ></span
                      >{{ t.priority }}
                    </button>
                  }
                </div>
                <div
                  class="grid grid-cols-[var(--w-column-sm)_1fr] gap-2.5 items-center py-2.5 border-b border-border-soft"
                >
                  <span class="fs-label text-text-muted">Weight</span>
                  <span class="fs-caption font-medium tabular-nums"
                    >{{ t.weight }}
                    <span class="font-mono fs-label text-text-muted font-normal">pts</span></span
                  >
                </div>
                @if (t.projectStageId; as sid) {
                  <div
                    class="grid grid-cols-[var(--w-column-sm)_1fr] gap-2.5 items-center py-2.5 border-b border-border-soft"
                  >
                    <span class="fs-label text-text-muted">Stage</span>
                    <a
                      [routerLink]="['/projects', projectId(), 'stages', sid]"
                      class="fs-caption font-medium text-accent hover:underline cursor-pointer truncate"
                      >{{ stageName() || 'Open stage' }}</a
                    >
                  </div>
                }

                <!-- Due date — inline-editable -->
                <div
                  class="grid grid-cols-[var(--w-column-sm)_1fr] gap-2.5 items-center py-2.5 border-b border-border-soft"
                >
                  <span class="fs-label text-text-muted">Due date</span>
                  @if (editingField() === 'due') {
                    <span class="flex items-center gap-1.5 min-w-0">
                      <pera-date-input size="sm" [(ngModel)]="dateDraft" class="flex-1 min-w-0" />
                      <button
                        type="button"
                        class="text-success px-1 cursor-pointer disabled:opacity-50"
                        [disabled]="savingDate()"
                        (click)="saveDate('due')"
                        aria-label="Save due date"
                      >
                        ✓
                      </button>
                      <button
                        type="button"
                        class="text-text-muted px-1 cursor-pointer"
                        (click)="cancelEditDate()"
                        aria-label="Cancel"
                      >
                        ✕
                      </button>
                    </span>
                  } @else {
                    <button
                      type="button"
                      class="inline-flex items-center gap-1.5 fs-caption font-medium w-max text-start disabled:cursor-default"
                      [class.text-warning]="isOverdue(t.dueDate)"
                      [class.cursor-pointer]="canManageTasks()"
                      [class.hover:underline]="canManageTasks()"
                      [disabled]="!canManageTasks()"
                      (click)="startEditDate('due', t.dueDate)"
                    >
                      <svg
                        width="12"
                        height="12"
                        viewBox="0 0 24 24"
                        fill="none"
                        stroke="currentColor"
                        stroke-width="1.7"
                        aria-hidden="true"
                      >
                        <rect x="3" y="4" width="18" height="17" />
                        <path d="M3 9h18M8 2v4M16 2v4" />
                      </svg>
                      {{
                        t.dueDate
                          ? shortDate(t.dueDate, locale.locale())
                          : canManageTasks()
                            ? 'Set due date'
                            : '—'
                      }}
                    </button>
                  }
                </div>

                <!-- Start date — editable only while the task is still Open -->
                <div
                  class="grid grid-cols-[var(--w-column-sm)_1fr] gap-2.5 items-center py-2.5 border-b border-border-soft"
                >
                  <span class="fs-label text-text-muted">Start date</span>
                  @if (editingField() === 'start') {
                    <span class="flex items-center gap-1.5 min-w-0">
                      <pera-date-input size="sm" [(ngModel)]="dateDraft" class="flex-1 min-w-0" />
                      <button
                        type="button"
                        class="text-success px-1 cursor-pointer disabled:opacity-50"
                        [disabled]="savingDate()"
                        (click)="saveDate('start')"
                        aria-label="Save start date"
                      >
                        ✓
                      </button>
                      <button
                        type="button"
                        class="text-text-muted px-1 cursor-pointer"
                        (click)="cancelEditDate()"
                        aria-label="Cancel"
                      >
                        ✕
                      </button>
                    </span>
                  } @else {
                    <button
                      type="button"
                      class="inline-flex items-center fs-caption w-max text-start disabled:cursor-default"
                      [class.font-medium]="t.estimatedStartDate"
                      [class.text-text-muted]="!t.estimatedStartDate"
                      [class.cursor-pointer]="canEditStart()"
                      [class.hover:underline]="canEditStart()"
                      [disabled]="!canEditStart()"
                      (click)="startEditDate('start', t.estimatedStartDate)"
                    >
                      {{
                        t.estimatedStartDate
                          ? shortDate(t.estimatedStartDate, locale.locale())
                          : canEditStart()
                            ? 'Set start date'
                            : '—'
                      }}
                    </button>
                  }
                </div>

                <!-- Duration — derived span between start and due dates (no backend field) -->
                <div
                  class="grid grid-cols-[var(--w-column-sm)_1fr] gap-2.5 items-center py-2.5 last:border-b-0"
                >
                  <span class="fs-label text-text-muted">Duration</span>
                  <span class="fs-caption font-medium tabular-nums">
                    @if (durationDays(); as d) {
                      {{ d }} {{ d === 1 ? 'day' : 'days' }}
                    } @else {
                      <span class="text-text-muted font-normal">—</span>
                    }
                  </span>
                </div>
              </div>
            </pera-card>

            <pera-card padding="none" class="flex flex-col">
              <div class="flex items-center justify-between gap-3 px-5 py-3 border-b border-border">
                <div class="flex items-center gap-2.5 min-w-0">
                  <h3 class="font-medium text-sm text-text-primary truncate">Gate conditions</h3>
                  <span
                    class="font-mono text-xs text-text-muted px-1.5 py-px bg-selected shrink-0"
                    >{{ gateCount() }}</span
                  >
                </div>
                @if (canAddGate()) {
                  <button
                    type="button"
                    class="inline-flex items-center gap-1.5 fs-label text-text-muted hover:text-accent transition-colors shrink-0"
                    (click)="gatePanel.openNew()"
                  >
                    <svg
                      width="12"
                      height="12"
                      viewBox="0 0 24 24"
                      fill="none"
                      stroke="currentColor"
                      stroke-width="2"
                      aria-hidden="true"
                    >
                      <path d="M12 5v14M5 12h14" />
                    </svg>
                    Add gate
                  </button>
                }
              </div>
              <app-gate-conditions-panel
                #gatePanel
                ownerKind="task"
                [ownerId]="taskId()"
                [ownerName]="t.name"
                [projectId]="projectId()"
                (changed)="refresh()"
              />
            </pera-card>

            <!-- CRM task-rail panel (feature 004) -->
            @for (panel of taskRailPanels(); track panel.order) {
              <ng-container *ngComponentOutlet="panel.cmp; inputs: { host: workspaceHost() }" />
            }

            <!-- notes — open to anyone; backend update endpoint still gates the write -->
            <pera-card padding="none" class="flex flex-col">
              <div class="flex items-center justify-between gap-3 px-5 py-3 border-b border-border">
                <div class="flex items-center gap-2.5 min-w-0">
                  <h3 class="font-medium text-sm text-text-primary truncate">Notes</h3>
                </div>
                <div class="flex items-center gap-2 shrink-0">
                  @if (editingNotes()) {
                    <pera-button
                      variant="ghost"
                      [disabled]="savingNotes()"
                      (click)="cancelEditNotes()"
                      >Cancel</pera-button
                    >
                    <pera-button variant="primary" [loading]="savingNotes()" (click)="saveNotes()"
                      >Save</pera-button
                    >
                  } @else {
                    <button
                      type="button"
                      class="fs-label text-accent hover:underline cursor-pointer"
                      (click)="editingNotes.set(true)"
                    >
                      Edit
                    </button>
                  }
                </div>
              </div>
              <div class="px-4 py-3">
                @if (editingNotes()) {
                  <pera-textarea
                    [(ngModel)]="notesDraft"
                    [rows]="5"
                    placeholder="Add a note. Anyone on the project can write here."
                    (keydown.escape)="cancelEditNotes()"
                  />
                } @else if (t.notes) {
                  <p class="m-0 fs-caption text-text-secondary whitespace-pre-wrap">
                    {{ t.notes }}
                  </p>
                } @else {
                  <button
                    type="button"
                    class="w-full text-start fs-caption text-text-muted border border-dashed border-border hover:border-text-muted hover:text-text-secondary px-3 py-2 cursor-text transition-colors"
                    (click)="editingNotes.set(true)"
                  >
                    Add a note…
                  </button>
                }
              </div>
            </pera-card>
          </div>
        </div>
      </div>
    }
  `,
  styles: [
    `
      :host {
        display: block;
        background: var(--color-bg);
        min-height: 100%;
      }
    `,
  ],
})
export class TaskDetailComponent implements OnInit, OnDestroy {
  private readonly route = inject(ActivatedRoute);
  private readonly router = inject(Router);
  private readonly tasksApi = inject(ProjectTaskService);
  private readonly projectsApi = inject(ProjectService);
  private readonly stagesApi = inject(ProjectStageService);
  private readonly breadcrumb = inject(BreadcrumbService);
  private readonly errors = inject(ErrorHandlerService);
  private readonly toast = inject(ToastService);
  private readonly perms = inject(PermissionsService);
  protected readonly access = inject(ProjectAccessStore);
  private readonly directory = inject(EmployeeService);
  private readonly modal = inject(ModalService);
  readonly locale = inject(LocaleService);

  /**
   * crmp P-3: task edits need `stage_tasks.manage` AND the Manager level AND an open project; assigning
   * needs `stage_tasks.assign` at Manager (contract §2.17.2). Read through the shared ProjectAccessStore.
   */
  readonly canManageTasks = computed(() => this.access.can(this.projectId(), 'task.update'));
  readonly canAssign = computed(() => this.access.can(this.projectId(), 'task.assign'));
  readonly canAddGate = computed(() => this.access.can(this.projectId(), 'taskGate.create'));
  /** Planned start is editable whenever the caller can manage tasks (backend accepts it on update). */
  /**
   * crmp review R1-F8: the planned start is read-only. The task PUT (`TaskRequest`, dms
   * `TaskEndpoints.cs:228`) has no start-date field, so an edit would toast success and save nothing.
   */
  readonly canEditStart = computed(() => false);

  readonly loading = signal(true);
  readonly failed = signal(false);
  readonly details = signal<TaskDetails | null>(null);
  readonly saving = signal(false);
  readonly editingDescription = signal(false);
  /** Which detail field (if any) is in inline-edit mode. */
  readonly editingField = signal<'due' | 'start' | 'assignee' | 'priority' | null>(null);
  readonly savingDate = signal(false);
  /** yyyy-MM-dd draft bound to the inline date input. */
  dateDraft = '';
  readonly projectName = signal('');
  readonly stageName = signal('');
  private readonly employeeNames = signal<Map<string, string>>(new Map());

  readonly projectId = signal('');
  readonly taskId = signal('');
  readonly activityView = signal<ActivityView>('comments');

  readonly activityViews: { id: ActivityView; label: string }[] = [
    { id: 'comments', label: 'Comments' },
    { id: 'history', label: 'History' },
  ];

  readonly task = computed(() => this.details()?.task ?? null);
  readonly subCount = computed(() => this.details()?.subTasks.length ?? 0);
  readonly doneSubs = computed(() => this.details()?.subTasks.filter((s) => s.isDone).length ?? 0);
  /** crmp P-3: the details' sub-task, comment and gate summaries (`ProjectTaskDetailsResponse`). */
  readonly summary = computed(() => {
    const d = this.details();
    if (!d) return '';
    return this.catalog.t('pt.summary', {
      done: d.subTasks.filter((x) => x.isDone).length,
      total: d.subTasksCount,
      comments: d.commentsCount,
      gates: `${d.gates.satisfied}/${d.gates.total}`,
    });
  });
  protected readonly catalog = inject(CatalogService);

  readonly gateCount = computed(() => {
    const gates = this.details()?.gates;
    return `${gates?.satisfied ?? 0}/${gates?.total ?? 0}`;
  });
  readonly assigneeName = computed(() => {
    const id = this.task()?.assignedToId;
    return id ? (this.employeeNames().get(id) ?? null) : null;
  });
  /** Employee directory → assignee select options. */
  readonly assigneeOptions = computed<SelectOption[]>(() =>
    [...this.employeeNames().entries()].map(([value, label]) => ({ value, label })),
  );
  readonly priorityOptions: SelectOption[] = [
    { value: 'Low', label: 'Low' },
    { value: 'Medium', label: 'Medium' },
    { value: 'High', label: 'High' },
    { value: 'Urgent', label: 'Urgent' },
  ];
  /** Planned span between start and due dates (inclusive day count). Derived — no backend field. */
  readonly durationDays = computed<number | null>(() => {
    const t = this.task();
    if (!t?.estimatedStartDate || !t.dueDate) return null;
    const s = Date.parse(t.estimatedStartDate);
    const e = Date.parse(t.dueDate);
    if (Number.isNaN(s) || Number.isNaN(e) || e < s) return null;
    return Math.round((e - s) / 86_400_000) + 1;
  });

  readonly shortDate = formatShortDate;
  protected readonly priorityDot = (p: string): string => PRIORITY_DOT[p] ?? PRIORITY_DOT['Low'];

  descriptionDraft = '';
  readonly descriptionDirty = signal(false);
  /** Notes are open to anyone on the project (the backend write still requires manage-tasks). */
  readonly editingNotes = signal(false);
  readonly savingNotes = signal(false);
  notesDraft = '';
  private seededTaskId: string | null = null;

  // ---- CRM workspace registry (feature 004) — core TASK_WORKSPACE token only.
  // This file never imports `features/crm`; it does not know CRM exists (FR-006, SC-008).
  private readonly workspacePanels = inject(TASK_WORKSPACE, { optional: true }) ?? [];
  protected readonly workspaceHost = computed<WorkspaceHost>(() => ({
    kind: 'task',
    id: this.taskId(),
    projectId: this.projectId(),
    crm: this.task()?.crm ?? null,
  }));
  readonly taskMainPanels = signal<readonly ResolvedWorkspacePanel[]>([]);
  readonly taskRailPanels = signal<readonly ResolvedWorkspacePanel[]>([]);

  constructor() {
    effect(() => {
      const task = this.task();
      const id = task?.id ?? null;
      // Only (re)seed the draft when a different task loads. An unrelated details
      // refresh (e.g. a status action calling refresh()) re-sets the same task —
      // reseeding then would silently discard the user's unsaved edits.
      if (id === this.seededTaskId) return;
      this.seededTaskId = id;
      this.descriptionDraft = task?.description ?? '';
      this.descriptionDirty.set(false);
      this.editingDescription.set(false);
      this.notesDraft = task?.notes ?? '';
      this.editingNotes.set(false);
    });

    effect(() => {
      const host = this.workspaceHost();
      resolveWorkspacePanels(this.workspacePanels, 'task-main', host).then((p) =>
        this.taskMainPanels.set(p),
      );
      resolveWorkspacePanels(this.workspacePanels, 'task-rail', host).then((p) =>
        this.taskRailPanels.set(p),
      );
    });
  }

  ngOnInit(): void {
    // Legacy route uses `:id`; the gated DMS route uses `:projectId`. Accept either.
    const pm = this.route.snapshot.paramMap;
    this.projectId.set(pm.get('id') ?? pm.get('projectId') ?? '');
    this.access.ensure(this.projectId());
    this.taskId.set(pm.get('taskId') ?? '');
    this.load();
    this.directory
      .listPaged({ page: 1, pageSize: 500 })
      .pipe(catchError(() => of(null)))
      .subscribe((paged) => {
        if (paged) this.employeeNames.set(new Map(paged.items.map((e) => [e.id, e.fullName])));
      });
    // Breadcrumb: project name now; stage name follows once the task loads.
    this.syncBreadcrumb();
    this.projectsApi
      .getById(this.projectId())
      .pipe(catchError(() => of(null)))
      .subscribe((p) => {
        if (p) {
          this.projectName.set(p.name);
          this.syncBreadcrumb();
        }
      });
  }

  ngOnDestroy(): void {
    this.breadcrumb.clear();
  }

  load(): void {
    this.loading.set(true);
    this.failed.set(false);
    this.tasksApi.getDetails(this.projectId(), this.taskId()).subscribe({
      next: (details) => {
        this.details.set(details);
        this.loading.set(false);
        this.syncBreadcrumb();
        const sid = details.task.projectStageId;
        if (sid && !this.stageName()) {
          this.stagesApi
            .getDetails(this.projectId(), sid)
            .pipe(catchError(() => of(null)))
            .subscribe((s) => {
              if (s) {
                this.stageName.set(s.name);
                this.syncBreadcrumb();
              }
            });
        }
      },
      error: () => {
        this.loading.set(false);
        this.failed.set(true);
      },
    });
  }

  /** DMS / Project / Stage / Task — fed to the app-shell topbar breadcrumb. */
  private syncBreadcrumb(): void {
    const t = this.task();
    const crumbs: BreadcrumbCrumb[] = [
      { label: 'DMS', route: '/projects' },
      { label: this.projectName() || 'Project', route: `/projects/${this.projectId()}` },
    ];
    if (t?.projectStageId) {
      crumbs.push({
        label: this.stageName() || 'Stage',
        route: `/projects/${this.projectId()}/stages/${t.projectStageId}`,
      });
    }
    if (t) crumbs.push({ label: `TASK · ${t.order}` });
    this.breadcrumb.set(crumbs);
  }

  isOverdue(due: string | null): boolean {
    if (!due || this.task()?.status === 'Completed') return false;
    const ms = Date.parse(due);
    return !Number.isNaN(ms) && ms < Date.now();
  }

  startEditDate(field: 'due' | 'start', current: string | null): void {
    if (field === 'due' && !this.canManageTasks()) return;
    if (field === 'start' && !this.canEditStart()) return;
    this.dateDraft = current ? current.slice(0, 10) : '';
    this.editingField.set(field);
  }

  cancelEditDate(): void {
    this.editingField.set(null);
  }

  /** Enter inline-edit for a select-backed field (assignee / priority). */
  startEdit(field: 'assignee' | 'priority'): void {
    if (field === 'assignee' ? !this.canAssign() : !this.canManageTasks()) return;
    this.editingField.set(field);
  }

  /** Reassign the task (`POST /projects/{pid}/tasks/{id}/assign`); no-op if unchanged. */
  saveAssignee(assignedToId: string | null): void {
    const t = this.task();
    if (!t || !assignedToId || assignedToId === t.assignedToId) {
      this.editingField.set(null);
      return;
    }
    this.tasksApi.assign(this.projectId(), t.id, assignedToId).subscribe({
      next: () => {
        this.editingField.set(null);
        this.details.update((d) =>
          d ? { ...d, task: { ...d.task, assignedToId } as ProjectTask } : d,
        );
        this.toast.show({ tone: 'success', message: 'Assignee updated' });
      },
      error: (err: HttpErrorResponse) =>
        this.toast.show({ tone: 'danger', message: friendly(this.errors.parse(err)) }),
    });
  }

  /** Change the task priority (PUT /project-tasks/{id}); no-op if unchanged. */
  savePriority(priority: TaskPriority): void {
    const t = this.task();
    if (!t || priority === t.priority) {
      this.editingField.set(null);
      return;
    }
    this.tasksApi
      .update(this.projectId(), t.id, {
        name: t.name,
        order: t.order,
        weight: t.weight,
        priority,
        dueDate: t.dueDate,
        description: t.description,
        notes: t.notes,
      })
      .subscribe({
        next: () => {
          this.editingField.set(null);
          this.details.update((d) =>
            d ? { ...d, task: { ...d.task, priority } as ProjectTask } : d,
          );
          this.toast.show({ tone: 'success', message: 'Priority updated' });
        },
        error: (err: HttpErrorResponse) =>
          this.toast.show({ tone: 'danger', message: friendly(this.errors.parse(err)) }),
      });
  }

  saveDate(field: 'due' | 'start'): void {
    const t = this.task();
    if (!t || this.savingDate()) return;
    this.savingDate.set(true);
    const value = this.dateDraft || null;
    const patch = field === 'due' ? { dueDate: value } : { estimatedStartDate: value };
    this.tasksApi
      .update(this.projectId(), t.id, {
        name: t.name,
        order: t.order,
        weight: t.weight,
        priority: t.priority,
        dueDate: t.dueDate,
        description: t.description,
        notes: t.notes,
        ...patch,
      })
      .subscribe({
        next: () => {
          this.savingDate.set(false);
          this.editingField.set(null);
          const key = field === 'due' ? 'dueDate' : 'estimatedStartDate';
          this.details.update((d) =>
            d ? { ...d, task: { ...d.task, [key]: value } as ProjectTask } : d,
          );
          this.toast.show({
            tone: 'success',
            message: field === 'due' ? 'Due date saved' : 'Start date saved',
          });
        },
        error: (err: HttpErrorResponse) => {
          this.savingDate.set(false);
          this.toast.show({ tone: 'danger', message: friendly(this.errors.parse(err)) });
        },
      });
  }

  refresh(): void {
    this.tasksApi
      .getDetails(this.projectId(), this.taskId())
      .subscribe((details) => this.details.set(details));
  }

  /** Edit task — open the DMS Forms task dialog seeded from the current task. */
  async editTask(t: ProjectTask): Promise<void> {
    const data: TaskFormDialogData = {
      mode: 'edit',
      projectId: this.projectId(),
      taskId: t.id,
      initial: {
        name: t.name,
        order: t.order,
        weight: t.weight,
        priority: t.priority,
        estimatedStartDate: t.estimatedStartDate,
        dueDate: t.dueDate,
        description: t.description,
        notes: t.notes,
      },
    };
    const saved = await this.modal
      .open<boolean>(TaskFormDialogComponent, { size: 'lg', data })
      .afterClosed();
    if (saved) this.refresh();
  }

  onDraftChange(): void {
    this.descriptionDirty.set((this.descriptionDraft || '') !== (this.task()?.description || ''));
  }

  cancelEditDescription(): void {
    this.descriptionDraft = this.task()?.description ?? '';
    this.descriptionDirty.set(false);
    this.editingDescription.set(false);
  }

  saveDescription(): void {
    const t = this.task();
    if (!t || this.saving() || !this.canManageTasks()) return;
    this.saving.set(true);
    const draft = this.descriptionDraft;
    this.tasksApi
      .update(this.projectId(), t.id, {
        name: t.name,
        order: t.order,
        weight: t.weight,
        priority: t.priority,
        dueDate: t.dueDate,
        description: draft || null,
        notes: t.notes,
      })
      .subscribe({
        next: () => {
          this.saving.set(false);
          this.details.update((d) =>
            d ? { ...d, task: { ...d.task, description: draft || null } as ProjectTask } : d,
          );
          this.descriptionDirty.set(false);
          this.editingDescription.set(false);
          this.toast.show({ tone: 'success', message: 'Description saved' });
        },
        error: (err: HttpErrorResponse) => {
          this.saving.set(false);
          this.toast.show({ tone: 'danger', message: friendly(this.errors.parse(err)) });
        },
      });
  }

  cancelEditNotes(): void {
    this.notesDraft = this.task()?.notes ?? '';
    this.editingNotes.set(false);
  }

  /**
   * Save the notes. Intentionally NOT gated on manage-tasks — notes are a shared
   * scratchpad anyone on the project can write to. The backend PUT still enforces
   * `project.manage_tasks`; a caller without it gets a friendly permission toast.
   */
  saveNotes(): void {
    const t = this.task();
    if (!t || this.savingNotes()) return;
    this.savingNotes.set(true);
    const draft = this.notesDraft.trim() || null;
    this.tasksApi
      .update(this.projectId(), t.id, {
        name: t.name,
        order: t.order,
        weight: t.weight,
        priority: t.priority,
        dueDate: t.dueDate,
        description: t.description,
        notes: draft,
      })
      .subscribe({
        next: () => {
          this.savingNotes.set(false);
          this.editingNotes.set(false);
          this.details.update((d) =>
            d ? { ...d, task: { ...d.task, notes: draft } as ProjectTask } : d,
          );
          this.toast.show({ tone: 'success', message: 'Notes saved' });
        },
        error: (err: HttpErrorResponse) => {
          this.savingNotes.set(false);
          this.toast.show({ tone: 'danger', message: friendly(this.errors.parse(err)) });
        },
      });
  }

  backToProject(): void {
    void this.router.navigate(['/projects', this.projectId()]);
  }
}
