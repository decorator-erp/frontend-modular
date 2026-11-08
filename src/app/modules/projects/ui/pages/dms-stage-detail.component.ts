import {
  ChangeDetectionStrategy,
  Component,
  DestroyRef,
  OnDestroy,
  OnInit,
  computed,
  effect,
  inject,
  signal,
} from '@angular/core';
import { takeUntilDestroyed } from '@angular/core/rxjs-interop';
import { FormsModule } from '@angular/forms';
import { HttpErrorResponse } from '@angular/common/http';
import { NgComponentOutlet } from '@angular/common';
import { ActivatedRoute, Router, RouterLink } from '@angular/router';
import {
  ResolvedWorkspacePanel,
  TASK_WORKSPACE,
  WorkspaceHost,
  resolveWorkspacePanels,
} from '@platform/composition/task-workspace.token';
import { Observable, catchError, of } from 'rxjs';
import { ProjectStageService } from '../../data/project-stage.service';
import { ProjectClosedBannerComponent } from '../shared/project-closed-banner.component';
import { ProjectGrantBannerComponent } from '../shared/project-grant-banner.component';
import { claimCheck, isGrantAccess } from '../../model/project-access';
import { ProjectAccessStore } from '../../stores/project-access.store';
import type { ProjectAction } from '../../model/project-actions';
import { StageGateConditionService } from '../../data/stage-gate-condition.service';
import { ProjectService } from '../../data/project.service';
import { StageTeamsService } from '../../data/stage-teams.service';
import { BreadcrumbService, BreadcrumbCrumb } from '@platform/navigation/breadcrumb.service';
import { ErrorHandlerService, friendly } from '@platform/http/error-handler.service';
import { ToastService } from '@platform/feedback/toast.service';
import {
  ApprovalType,
  GateCondition,
  ProjectStage,
  UpdateProjectStageRequest,
} from '../../model/project.model';
import { PERM } from '@platform/permissions';
import { CanDirective } from '@platform/permissions';
import { PermissionsService } from '@platform/permissions';
import { EmployeeService } from '@modules/people';
import {
  ConfirmService,
  ModalService,
  PeraEmptyComponent,
  PeraMarkdownEditorComponent,
  PeraMarkdownViewComponent,
  PeraSkeletonComponent,
  SelectOption,
} from '@ds';
import { ActivityFeedComponent } from '../activity/activity-feed.component';
import {
  StageNoteModalComponent,
  StageNoteModalData,
} from '../stage-detail/panels/stage-actions.component';
import { TaskFormDialogComponent, TaskFormDialogData } from '../dialogs/task-form-dialog.component';
import {
  StageFormDialogComponent,
  StageFormDialogData,
} from '../dialogs/stage-form-dialog.component';
import { bt, CODE_C, HLK, PNL, PNL_H, PNL_H_T } from '../stage-detail/dms/dms-stage-chrome';
import { DmsStageStatusPillComponent } from '../stage-detail/dms/dms-stage-status-pill.component';
import { DmsStageStepperComponent } from '../stage-detail/dms/dms-stage-stepper.component';
import {
  DmsStageProgressComponent,
  RollupStatus,
} from '../stage-detail/dms/dms-stage-progress.component';
import { DmsStageTasksComponent } from '../stage-detail/dms/dms-stage-tasks.component';
import { DmsStageFilesComponent } from '../stage-detail/dms/dms-stage-files.component';
import { DmsStageInfoComponent } from '../stage-detail/dms/dms-stage-info.component';
import { DmsStageDependenciesComponent } from '../stage-detail/dms/dms-stage-dependencies.component';
import { DmsStageTeamComponent } from '../stage-detail/dms/dms-stage-team.component';
import {
  StageGatesModalComponent,
  StageGatesModalData,
} from '../stage-detail/dms/stage-gates-modal.component';
import {
  DocumentationModalComponent,
  DocumentationModalData,
} from '../task-detail/documentation-modal.component';

type TaskFilter = 'all' | RollupStatus;

/**
 * DMS Stage Detail page — a faithful rebuild of `DMS Stage Detail.dc.html`.
 *
 * **De-ported in Batch 4b, together with its eight `dms-stage-*` children.** The
 * ~870-line ported `<style>` block and `ViewEncapsulation.None` are gone; the
 * shared vocabulary (`.pnl`, `.bt`, `.dms-st`, `.av`, `.pri`, `.code-c`) now
 * lives in `dms-stage-chrome.ts` as Tailwind recipes that each component imports
 * for itself. `1fr / 21rem` grid: the left
 * column stacks the header, stepper, blocking callout, progress rollup, tasks
 * table, financial rollup and activity; the right rail carries the Details info
 * card, the gate-to-advance list and the team stack.
 *
 * Authorization is permission-based on the real backend claims: the route gates
 * on `Projects.Read`, read panels render for any project reader, and the write
 * affordances are gated per-action (`Projects.ManageStages` for lifecycle + gate
 * CRUD, `ManageTasks` for Add task, `ManageDocuments` for upload, `Finance.Read`
 * for the finance link, `Activities.Read` for the feed).
 */
@Component({
  selector: 'app-dms-stage-detail',
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [
    ProjectClosedBannerComponent,
    ProjectGrantBannerComponent,
    RouterLink,
    FormsModule,
    NgComponentOutlet,
    CanDirective,
    PeraSkeletonComponent,
    PeraEmptyComponent,
    PeraMarkdownEditorComponent,
    PeraMarkdownViewComponent,
    ActivityFeedComponent,
    DmsStageStatusPillComponent,
    DmsStageStepperComponent,
    DmsStageProgressComponent,
    DmsStageTasksComponent,
    DmsStageFilesComponent,
    DmsStageInfoComponent,
    DmsStageDependenciesComponent,
    DmsStageTeamComponent,
  ],
  template: `
    <!-- crmp P-9: a closed project's work is read-only (projects.Closed); every write is hidden. -->
    @if (access.project(projectId())(); as closedCheck) {
      <div class="px-6 pt-4 flex flex-col gap-3">
        <app-project-closed-banner [project]="closedCheck" />
        <app-project-grant-banner [access]="closedCheck.myAccess" [stages]="stages()" />
      </div>
    }
    @if (loading()) {
      <div class="p-6">
        <pera-skeleton [height]="120" rounded="md" />
        <div class="h-3"></div>
        <pera-skeleton [height]="320" rounded="md" />
      </div>
    } @else if (failed()) {
      <div class="p-6">
        <pera-empty
          title="Couldn't load this stage"
          description="It may have been removed, or you may not have access."
          [cta]="{ label: 'Back to project', action: backToProject.bind(this) }"
        />
      </div>
    } @else if (stage(); as s) {
      <div class="font-sans text-text-primary antialiased">
        <div class="max-w-[80rem] mx-auto px-7 pt-6 pb-14">
          <div class="grid grid-cols-1 lg:grid-cols-[minmax(0,1fr)_21rem] gap-6 items-start">
            <!-- ============ MAIN COLUMN ============ -->
            <div class="min-w-0 flex flex-col gap-4">
              <!-- head — breadcrumb → eyebrow → title → Arabic subtitle → action row -->
              <div>
                <div
                  class="flex items-center gap-2 mb-3 text-text-muted"
                  [style.fontSize]="'var(--fs-label)'"
                >
                  <a
                    class="text-text-muted no-underline hover:text-text-primary hover:underline"
                    [routerLink]="['/projects', projectId()]"
                    >{{ projectName() || 'Project' }}</a
                  >
                  · <span>Stage workflow</span>
                </div>
                <div
                  class="mb-2 font-semibold uppercase tracking-[0.08em] text-accent"
                  [style.fontSize]="'var(--fs-label)'"
                >
                  Stage {{ pad(s.order) }} of {{ pad(stageCount() || s.order) }}
                </div>
                <h1
                  class="m-0 font-semibold tracking-[-0.02em]"
                  [style.fontSize]="'var(--fs-h1)'"
                  [style.lineHeight]="'var(--lh-h1)'"
                >
                  {{ s.name }}
                </h1>
                @if (s.nameAr) {
                  <div
                    dir="rtl"
                    class="mt-1 text-text-muted"
                    [style.fontFamily]="'var(--arabic)'"
                    [style.fontSize]="'var(--fs-body)'"
                  >
                    {{ s.nameAr }}
                  </div>
                }

                <div class="mt-5 flex flex-wrap items-center gap-3">
                  <app-dms-stage-status-pill [status]="s.status" [lg]="true" />

                  @if (s.status === 'Locked') {
                    <span
                      class="inline-flex items-center gap-2 border border-border bg-surface-muted px-3 py-1.5 text-text-muted"
                      [style.fontSize]="'var(--fs-label)'"
                    >
                      <svg
                        width="12"
                        height="12"
                        viewBox="0 0 24 24"
                        fill="none"
                        stroke="currentColor"
                        stroke-width="1.7"
                      >
                        <rect x="5" y="11" width="14" height="10" />
                        <path d="M8 11V7a4 4 0 0 1 8 0v4" />
                      </svg>
                      Locked — a prior stage must complete first
                    </span>
                  }

                  @if (stageCan('stage.complete') || stageCan('stage.reject')) {
                    @switch (s.status) {
                      @case ('Active') {
                        <button
                          type="button"
                          [class]="BT_PRI_SM"
                          [disabled]="busy() || submitBlocked()"
                          (click)="complete()"
                          [hidden]="!stageCan('stage.complete')"
                        >
                          <svg
                            width="12"
                            height="12"
                            viewBox="0 0 24 24"
                            fill="none"
                            stroke="currentColor"
                            stroke-width="2"
                          >
                            <path d="M22 2 11 13M22 2l-7 20-4-9-9-4Z" />
                          </svg>
                          Submit for approval
                        </button>
                        <button
                          type="button"
                          [class]="BT_DGR_SM"
                          [disabled]="busy()"
                          (click)="reject()"
                          [hidden]="!stageCan('stage.reject')"
                        >
                          Send back
                        </button>
                        @if (submitBlocked()) {
                          <span
                            class="inline-flex items-center gap-2 border border-danger bg-danger-soft px-3 py-1.5 text-danger"
                            [style.fontSize]="'var(--fs-label)'"
                            >Resolve blocking tasks to submit</span
                          >
                        }
                      }
                    }
                  }

                  <div class="ms-auto flex items-center gap-3">
                    @if (stageCan('stage.update')) {
                      <button type="button" [class]="BT_SEC_SM" (click)="editStage()">
                        <svg
                          width="13"
                          height="13"
                          viewBox="0 0 24 24"
                          fill="none"
                          stroke="currentColor"
                          stroke-width="1.7"
                        >
                          <path d="M12 20h9M16.5 3.5a2.1 2.1 0 0 1 3 3L7 19l-4 1 1-4z" />
                        </svg>
                        Edit stage
                      </button>
                    }
                    @if (stageCan('task.create')) {
                      <button type="button" [class]="BT_GH_SM" (click)="addTask()">
                        <svg
                          width="13"
                          height="13"
                          viewBox="0 0 24 24"
                          fill="none"
                          stroke="currentColor"
                          stroke-width="1.7"
                        >
                          <path d="M12 5v14M5 12h14" />
                        </svg>
                        Add task
                      </button>
                    }
                    <button type="button" [class]="BT_SEC_SM" (click)="openDocs()">
                      <svg
                        width="13"
                        height="13"
                        viewBox="0 0 24 24"
                        fill="none"
                        stroke="currentColor"
                        stroke-width="1.7"
                      >
                        <path d="M3 7h6l2 2h10v9a2 2 0 0 1-2 2H3z" />
                      </svg>
                      Documentation
                    </button>
                    @if (stageCan('stage.delete')) {
                      <button
                        type="button"
                        [class]="BT_SEC_SM"
                        [disabled]="busy()"
                        (click)="remove()"
                        title="Delete stage"
                      >
                        <svg
                          width="13"
                          height="13"
                          viewBox="0 0 24 24"
                          fill="none"
                          stroke="currentColor"
                          stroke-width="1.7"
                        >
                          <path d="M3 6h18M8 6V4h8v2M19 6l-1 14H6L5 6" />
                        </svg>
                      </button>
                    }
                  </div>
                </div>
              </div>

              <!-- stepper -->
              @if (readable()) {
                @if (stages().length) {
                  <app-dms-stage-stepper
                    [stages]="visibleStages()"
                    [currentStageId]="s.id"
                    [projectId]="projectId()"
                  />
                }
              }

              <!-- description -->
              @if (readable()) {
                <div [class]="PNL">
                  <div [class]="PNL_H">
                    <div [class]="PNL_H_T">Description</div>
                    @if (canEditStage()) {
                      @if (editingDescription()) {
                        <span class="inline-flex gap-3.5 items-center">
                          <button
                            type="button"
                            [class]="HLK"
                            [disabled]="savingDesc()"
                            (click)="cancelEditDescription()"
                          >
                            Cancel
                          </button>
                          <button
                            type="button"
                            [class]="HLK_PRI"
                            [disabled]="savingDesc()"
                            (click)="saveDescription()"
                          >
                            Save
                          </button>
                        </span>
                      } @else {
                        <button type="button" [class]="HLK_PRI" (click)="startEditDescription()">
                          Edit
                        </button>
                      }
                    }
                  </div>
                  <div class="px-4 py-3.5">
                    @if (editingDescription()) {
                      <pera-markdown-editor
                        [ngModel]="descriptionDraft"
                        (ngModelChange)="descriptionDraft = $event"
                        [rows]="6"
                        defaultMode="edit"
                        [showModes]="false"
                        [autofocus]="true"
                        submitHint="Ctrl+Enter to save"
                        (submit)="saveDescription()"
                        placeholder="Add a description. Markdown supported."
                      />
                    } @else if (s.description) {
                      <pera-markdown-view [markdown]="s.description" />
                    } @else if (canEditStage()) {
                      <button
                        type="button"
                        class="w-full text-start fs-body-sm text-text-muted border border-dashed border-border-strong bg-transparent px-3 py-2.5 cursor-text font-[inherit] transition-colors hover:border-text-muted hover:text-text-secondary"
                        (click)="startEditDescription()"
                      >
                        Add a description…
                      </button>
                    } @else {
                      <p class="m-0 fs-body-sm text-text-muted">No description.</p>
                    }
                  </div>
                </div>
              }

              <!-- blocking callout -->
              @if (submitBlocked()) {
                <div class="flex gap-3 px-4 py-3.5 bg-danger-soft border border-danger items-start">
                  <span class="text-danger shrink-0 mt-px"
                    ><svg
                      width="17"
                      height="17"
                      viewBox="0 0 24 24"
                      fill="none"
                      stroke="currentColor"
                      stroke-width="1.8"
                    >
                      <path
                        d="M12 9v4M12 17h.01M10.3 3.9 1.8 18a2 2 0 0 0 1.7 3h17a2 2 0 0 0 1.7-3L13.7 3.9a2 2 0 0 0-3.4 0Z"
                      /></svg
                  ></span>
                  <div class="bt2">
                    <b>This stage can't be submitted yet.</b>
                    {{ rejCount() }} task{{ rejCount() === 1 ? '' : 's' }} rejected and
                    {{ pendCount() }} pending approval must be resolved before the stage can be sent
                    for sign-off.
                    <span class="sm">Stage rule · all tasks must reach Completed</span>
                  </div>
                </div>
              }

              <!-- progress rollup -->
              @if (readable()) {
                <app-dms-stage-progress
                  [tasks]="tasks()"
                  [filter]="filter()"
                  (filterPick)="setFilter($event)"
                />
              }

              <!-- tasks -->
              @if (readable()) {
                <app-dms-stage-tasks
                  [tasks]="tasks()"
                  [filter]="filter()"
                  [assigneeNames]="employeeNames()"
                  (filterChange)="filter.set($event)"
                />
              }

              <!-- files -->
              @if (readable()) {
                <app-dms-stage-files
                  [stageId]="s.id"
                  [projectId]="projectId()"
                  [stageOrder]="s.order"
                  [stageName]="s.name"
                />
              }

              <!-- CRM stage-main panels (feature 004) — registered via the core
                   TASK_WORKSPACE token; zero panels render when this stage isn't CRM. -->
              @for (panel of stageMainPanels(); track panel.order) {
                <ng-container *ngComponentOutlet="panel.cmp; inputs: { host: workspaceHost() }" />
              }

              <!-- activity -->
              <ng-container *peraCan="activitiesRead">
                <div [class]="PNL">
                  <div [class]="PNL_H"><div class="t">Stage activity</div></div>
                  <app-activity-feed entityName="Stage" [entityId]="s.id" [take]="100" />
                </div>
              </ng-container>
            </div>

            <!-- ============ RIGHT RAIL ============ -->
            <div class="flex flex-col gap-3.5">
              @if (readable()) {
                <app-dms-stage-info
                  [stage]="s"
                  [stageCount]="stageCount()"
                  [totalWeight]="totalWeight()"
                  [ownerName]="ownerName()"
                  [canManage]="canEditStage()"
                  [ownerId]="ownerId()"
                  [employeeOptions]="employeeOptions()"
                  (saveStartDate)="onSaveStartDate($event)"
                  (saveTargetDate)="onSaveTargetDate($event)"
                  (saveOwner)="onSaveOwner($event)"
                />
              }

              <!-- Gate to advance — opens the gate checklist in a floating window. -->
              @if (readable()) {
                <button
                  data-rail-link
                  type="button"
                  class="flex items-center justify-between gap-2.5 w-full px-4 py-3 border border-border bg-surface font-[inherit] fs-caption font-medium text-text-muted text-start cursor-pointer transition-colors hover:bg-hover"
                  (click)="openGates()"
                >
                  <span class="inline-flex items-center gap-2 text-accent">
                    <svg
                      width="14"
                      height="14"
                      viewBox="0 0 24 24"
                      fill="none"
                      stroke="currentColor"
                      stroke-width="1.7"
                    >
                      <path
                        d="M9 11l3 3L22 4M21 12v7a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h11"
                      />
                    </svg>
                    Gate to advance
                    <span
                      class="fs-label font-semibold tabular-nums border px-1.5 py-px"
                      [class.text-danger]="submitBlocked()"
                      [class.border-danger]="submitBlocked()"
                      [class.text-text-muted]="!submitBlocked()"
                      [class.border-border]="!submitBlocked()"
                      >{{ gateSatisfied() }}/{{ gateTotal() }}</span
                    >
                  </span>
                  <svg
                    width="14"
                    height="14"
                    viewBox="0 0 24 24"
                    fill="none"
                    stroke="currentColor"
                    stroke-width="1.7"
                  >
                    <path d="M9 6l6 6-6 6" />
                  </svg>
                </button>
              }

              @if (readable()) {
                <app-dms-stage-dependencies
                  [stages]="stages()"
                  [currentStageId]="s.id"
                  [projectId]="projectId()"
                />
              }

              @if (readable()) {
                <app-dms-stage-team [projectId]="projectId()" [stageId]="s.id" />
              }

              <!-- CRM stage-rail panels (feature 004) -->
              @for (panel of stageRailPanels(); track panel.order) {
                <ng-container *ngComponentOutlet="panel.cmp; inputs: { host: workspaceHost() }" />
              }

              @if (s.notes) {
                <div [class]="PNL">
                  <div [class]="PNL_H"><div class="t">Notes</div></div>
                  <div class="px-4 py-3">
                    <p
                      class="m-0 whitespace-pre-wrap fs-caption leading-relaxed text-text-secondary"
                    >
                      {{ s.notes }}
                    </p>
                  </div>
                </div>
              }

              <div [class]="CODE_C" class="px-1 py-0.5 leading-relaxed">
                @if (s.startedOnUtc) {
                  Opened {{ longDate(s.startedOnUtc) }}<br />
                }
                {{ s.totalTasks }} task{{ s.totalTasks === 1 ? '' : 's' }} ·
                {{ s.completedTasks }} done
              </div>
            </div>
          </div>
        </div>
      </div>
    }
  `,
})
export class DmsStageDetailComponent implements OnInit, OnDestroy {
  // Chrome recipes shared with the eight children (Batch 4b de-port).
  protected readonly PNL = PNL;
  protected readonly PNL_H = PNL_H;
  protected readonly PNL_H_T = PNL_H_T;
  protected readonly CODE_C = CODE_C;
  protected readonly HLK = HLK;
  protected readonly HLK_PRI = `${HLK} text-accent`;
  protected readonly BT_PRI_SM = bt('pri', true);
  protected readonly BT_SEC_SM = bt('sec', true);
  protected readonly BT_GH_SM = bt('gh', true);
  protected readonly BT_DGR_SM = bt('dgr', true);
  protected readonly BT_OK_SM = bt('ok', true);

  private readonly route = inject(ActivatedRoute);
  private readonly router = inject(Router);
  private readonly stagesApi = inject(ProjectStageService);
  private readonly stageGates = inject(StageGateConditionService);
  protected readonly access = inject(ProjectAccessStore);
  private readonly projectsApi = inject(ProjectService);
  private readonly directory = inject(EmployeeService);
  private readonly teamsApi = inject(StageTeamsService);
  private readonly destroyRef = inject(DestroyRef);
  private readonly breadcrumb = inject(BreadcrumbService);
  private readonly modal = inject(ModalService);
  private readonly confirm = inject(ConfirmService);
  private readonly toast = inject(ToastService);
  private readonly errors = inject(ErrorHandlerService);
  private readonly perms = inject(PermissionsService);

  /**
   * Real backend permissions (the route already enforces `Projects.Read`, so the
   * read-panel gates are effectively always-true for anyone on the page; the write
   * gates are what still do work). The old DMS rollout permission family was
   * retired at GA.
   */
  /**
   * crmp P1-B: the stage's read panels — `project.read` from the token for members and read_all; for a
   * grantee, the Stages & tasks area covering this stage (its token does not carry the code).
   */
  readonly readable = computed(() =>
    claimCheck(
      this.access.project(this.projectId())()?.myAccess,
      'StagesAndTasks',
      (p) => this.perms.can(p),
      this.stageId(),
    )(PERM.projects.read),
  );
  protected readonly canManageStages = PERM.stages.manage;
  protected readonly manageTasks = PERM.stageTasks.manage;
  protected readonly activitiesRead = PERM.activities.read;

  readonly projectId = signal('');
  readonly stageId = signal('');
  readonly loading = signal(true);
  readonly failed = signal(false);
  readonly busy = signal(false);
  readonly stage = signal<ProjectStage | null>(null);
  readonly stages = signal<ProjectStage[]>([]);
  /** crmp P1-B: a stage-limited grant steps only through its own stages. */
  readonly visibleStages = computed(() => {
    const a = this.access.project(this.projectId())()?.myAccess;
    const ids = isGrantAccess(a) ? a.stageIds : [];
    return ids.length ? this.stages().filter((x) => ids.includes(x.id)) : this.stages();
  });
  readonly gates = signal<GateCondition[]>([]);
  readonly projectName = signal('');
  readonly employeeNames = signal<Map<string, string>>(new Map());
  readonly filter = signal<TaskFilter>('all');

  // ---- description (Markdown, like the task page) ----
  readonly editingDescription = signal(false);
  readonly savingDesc = signal(false);
  descriptionDraft = '';

  /** Stage owner = the stage-team head; resolved to a name via the directory. */
  readonly ownerId = signal<string | null>(null);
  /** The stage team that holds the head, if one exists (drives changeHead vs create). */
  readonly ownerTeamId = signal<string | null>(null);
  readonly ownerName = computed(() => {
    const id = this.ownerId();
    return id ? (this.employeeNames().get(id) ?? null) : null;
  });

  readonly tasks = computed(() => this.stage()?.tasks ?? []);
  readonly stageCount = computed(() => this.stages().length);
  readonly totalWeight = computed(() => this.tasks().reduce((a, t) => a + (t.weight || 0), 0));

  readonly rejCount = computed(() => this.tasks().filter((t) => t.status === 'Rejected').length);
  readonly pendCount = computed(
    () => this.tasks().filter((t) => t.status === 'PendingApproval').length,
  );
  readonly submitBlocked = computed(
    () => this.stage()?.status === 'Active' && this.rejCount() + this.pendCount() > 0,
  );

  /** Gate-to-advance rollup for the rail launcher: derived "all tasks resolved" gate + real gates. */
  readonly gateSatisfied = computed(
    () => (this.submitBlocked() ? 0 : 1) + this.gates().filter((g) => g.isSatisfied).length,
  );
  readonly gateTotal = computed(() => this.gates().length + 1);

  /** Drives the in-place editors on the Details card (Projects.ManageStages). */
  /**
   * crmp P-2: stage writes need the route claim AND the Manager level AND an open project
   * (`canProjectAction`, contract §2.17.2), read through the shared ProjectAccessStore.
   */
  stageCan(action: ProjectAction): boolean {
    return this.access.can(this.projectId(), action, this.stageId());
  }

  readonly canEditStage = computed(() => this.stageCan('stage.update'));
  /** Employee picklist for the inline owner select, reusing the already-loaded directory. */
  readonly employeeOptions = computed<SelectOption[]>(() =>
    [...this.employeeNames()]
      .map(([value, label]) => ({ value, label }))
      .sort((a, b) => a.label.localeCompare(b.label)),
  );

  // ---- CRM workspace registry (feature 004) — core TASK_WORKSPACE token only.
  // This file never imports `features/crm`; it does not know CRM exists (FR-006, SC-008).
  private readonly workspacePanels = inject(TASK_WORKSPACE, { optional: true }) ?? [];
  protected readonly workspaceHost = computed<WorkspaceHost>(() => ({
    kind: 'stage',
    id: this.stage()?.id ?? '',
    projectId: this.projectId(),
    crm: this.stage()?.crm ?? null,
  }));
  /** Resolved async, held in a signal — under zoneless nothing re-renders on a bare promise. */
  readonly stageMainPanels = signal<readonly ResolvedWorkspacePanel[]>([]);
  readonly stageRailPanels = signal<readonly ResolvedWorkspacePanel[]>([]);

  constructor() {
    effect(() => {
      const host = this.workspaceHost();
      resolveWorkspacePanels(this.workspacePanels, 'stage-main', host).then((p) =>
        this.stageMainPanels.set(p),
      );
      resolveWorkspacePanels(this.workspacePanels, 'stage-rail', host).then((p) =>
        this.stageRailPanels.set(p),
      );
    });
  }

  protected pad(n: number): string {
    return String(n).padStart(2, '0');
  }

  protected longDate(iso: string): string {
    const d = new Date(iso);
    return isNaN(d.getTime())
      ? '—'
      : new Intl.DateTimeFormat('en', { month: 'short', day: '2-digit', year: 'numeric' }).format(
          d,
        );
  }

  ngOnInit(): void {
    // The directory is project-independent and stable across sibling stages — load once.
    this.directory
      .listPaged({ page: 1, pageSize: 500 })
      .pipe(catchError(() => of(null)))
      .subscribe((paged) => {
        if (paged) this.employeeNames.set(new Map(paged.items.map((e) => [e.id, e.fullName])));
      });

    // React to every `:stageId` change so the stepper / breadcrumb navigation
    // between sibling stages re-renders this same component instance.
    this.route.paramMap.pipe(takeUntilDestroyed(this.destroyRef)).subscribe((pm) => {
      const projectId = pm.get('projectId') ?? '';
      const stageId = pm.get('stageId') ?? '';
      const projectChanged = projectId !== this.projectId();
      this.projectId.set(projectId);
      this.access.ensure(projectId);
      this.stageId.set(stageId);
      this.filter.set('all');
      this.load();
      this.loadTeams();
      this.loadStages();
      if (projectChanged) this.loadProject();
    });

    this.syncBreadcrumb();
  }

  ngOnDestroy(): void {
    this.breadcrumb.clear();
  }

  load(): void {
    this.loading.set(true);
    this.failed.set(false);
    // `/details` now carries the planned/actual dates alongside the tasks.
    this.stagesApi.getDetails(this.projectId(), this.stageId()).subscribe({
      next: (stage) => {
        this.stage.set(stage);
        this.loading.set(false);
        this.syncBreadcrumb();
      },
      error: () => {
        this.loading.set(false);
        this.failed.set(true);
      },
    });
    this.stageGates
      .getByStage(this.projectId(), this.stageId())
      .pipe(catchError(() => of([] as GateCondition[])))
      .subscribe((g) => this.gates.set(g));
  }

  private loadStages(): void {
    this.stagesApi
      .getByProject(this.projectId())
      .pipe(catchError(() => of([] as ProjectStage[])))
      .subscribe((list) => this.stages.set(list));
  }

  private loadProject(): void {
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

  /** Resolve the stage owner (the stage-team head) for the Details card + Edit modal. */
  private loadTeams(): void {
    this.teamsApi
      .getByProjectStage(this.projectId(), this.stageId())
      .pipe(catchError(() => of([])))
      .subscribe((teams) => {
        const owning = teams.find((t) => t.headId) ?? null;
        this.ownerId.set(owning?.headId || null);
        this.ownerTeamId.set(owning?.id || null);
      });
  }

  reload(): void {
    this.load();
    this.loadTeams();
    this.loadStages();
  }

  setFilter(status: RollupStatus): void {
    this.filter.set(this.filter() === status ? 'all' : status);
  }

  backToProject(): void {
    void this.router.navigate(['/projects', this.projectId()]);
  }

  /** Head action — open the project documents browser unscoped (folder = all). */
  openDocs(): void {
    const s = this.stage();
    const data: DocumentationModalData = {
      projectId: this.projectId(),
      context: s ? `Stage ${this.pad(s.order)} · ${s.name}` : null,
      initialFolder: null,
    };
    this.modal.open(DocumentationModalComponent, { size: 'xl', data });
  }

  /** Add task — open the create-task modal scoped to this stage (Projects.ManageTasks). */
  async addTask(): Promise<void> {
    const data: TaskFormDialogData = {
      mode: 'create',
      projectId: this.projectId(),
      projectStageId: this.stageId(),
      nextOrder: (this.tasks().reduce((max, t) => Math.max(max, t.order), 0) || 0) + 10,
    };
    const created = await this.modal
      .open<boolean>(TaskFormDialogComponent, { size: 'lg', data })
      .afterClosed();
    if (created) this.load();
  }

  /** Edit stage — open the DMS Forms stage dialog seeded from the current stage. */
  async editStage(): Promise<void> {
    const s = this.stage();
    if (!s) return;
    const data: StageFormDialogData = {
      mode: 'edit',
      projectId: this.projectId(),
      stageId: s.id,
      initial: {
        name: s.name,
        order: s.order,
        estimatedStartDate: s.estimatedStartDate ?? null,
        estimatedEndDate: s.estimatedEndDate ?? null,
        description: s.description ?? null,
        notes: s.notes ?? null,
      },
    };
    const saved = await this.modal
      .open<boolean>(StageFormDialogComponent, { size: 'lg', data })
      .afterClosed();
    if (saved) this.reload();
  }

  /** In-place edit — persist a new planned start date (Projects.ManageStages). */
  onSaveStartDate(date: string): void {
    this.persistDate('estimatedStartDate', date || null, 'Start date updated');
  }

  /** In-place edit — persist a new planned target date (Projects.ManageStages). */
  onSaveTargetDate(date: string): void {
    this.persistDate('estimatedEndDate', date || null, 'Target date updated');
  }

  /**
   * Patch a single planned date. crmp review R1-F1: the stage PUT is a full replace — an omitted
   * nullable date is cleared (dms `ManualStageHandlers.cs:183-184`), so every current field is sent
   * and only the edited one changes. Local state updates on success (no full reload, no flicker).
   */
  private persistDate(
    field: 'estimatedStartDate' | 'estimatedEndDate',
    value: string | null,
    message: string,
  ): void {
    const s = this.stage();
    if (!s) return;
    const req: UpdateProjectStageRequest = {
      name: s.name,
      order: s.order,
      description: s.description,
      notes: s.notes,
      estimatedStartDate: s.estimatedStartDate,
      estimatedEndDate: s.estimatedEndDate,
    };
    req[field] = value;
    this.stagesApi.update(this.projectId(), s.id, req).subscribe({
      next: () => {
        const cur = this.stage();
        if (cur) this.stage.set({ ...cur, [field]: value });
        this.toast.show({ tone: 'success', message });
      },
      error: (err: HttpErrorResponse) => {
        this.toast.show({ tone: 'danger', message: friendly(this.errors.parse(err)) });
        this.load();
      },
    });
  }

  // ---- description editing (Markdown; persisted on the stage update) ----------

  startEditDescription(): void {
    if (!this.canEditStage()) return;
    this.descriptionDraft = this.stage()?.description ?? '';
    this.editingDescription.set(true);
  }

  cancelEditDescription(): void {
    this.descriptionDraft = this.stage()?.description ?? '';
    this.editingDescription.set(false);
  }

  saveDescription(): void {
    const s = this.stage();
    if (!s || this.savingDesc() || !this.canEditStage()) return;
    this.savingDesc.set(true);
    const draft = this.descriptionDraft;
    this.stagesApi
      .update(this.projectId(), s.id, {
        name: s.name,
        order: s.order,
        description: draft || null,
        notes: s.notes,
        // R1-F1: full replace — resend the planned dates or the save clears them.
        estimatedStartDate: s.estimatedStartDate,
        estimatedEndDate: s.estimatedEndDate,
      })
      .subscribe({
        next: () => {
          this.savingDesc.set(false);
          const cur = this.stage();
          if (cur) this.stage.set({ ...cur, description: draft || null });
          this.editingDescription.set(false);
          this.toast.show({ tone: 'success', message: 'Description saved' });
        },
        error: (err: HttpErrorResponse) => {
          this.savingDesc.set(false);
          this.toast.show({ tone: 'danger', message: friendly(this.errors.parse(err)) });
        },
      });
  }

  /** In-place edit — assign the stage owner = stage-team head (Projects.ManageStages). */
  onSaveOwner(employeeId: string): void {
    if (!employeeId || employeeId === this.ownerId()) return;
    const teamId = this.ownerTeamId();
    const call = teamId
      ? this.teamsApi.changeHead(this.projectId(), teamId, employeeId)
      : this.teamsApi.createStandalone(this.projectId(), this.stageId(), employeeId);
    this.ownerId.set(employeeId); // optimistic — resolves the name immediately
    call.subscribe({
      next: () => {
        this.toast.show({ tone: 'success', message: 'Stage owner updated' });
        this.loadTeams();
      },
      error: (err: HttpErrorResponse) => {
        this.toast.show({ tone: 'danger', message: friendly(this.errors.parse(err)) });
        this.loadTeams();
      },
    });
  }

  /** Gate to advance — open the stage's gate checklist as a floating window. */
  async openGates(): Promise<void> {
    const s = this.stage();
    if (!s) return;
    const data: StageGatesModalData = {
      stageId: s.id,
      stageName: s.name,
      projectId: this.projectId(),
      blocked: this.submitBlocked(),
      rejCount: this.rejCount(),
      pendCount: this.pendCount(),
    };
    const changed = await this.modal
      .open<boolean>(StageGatesModalComponent, { size: 'md', data })
      .afterClosed();
    if (changed) this.reload();
  }

  // ---- lifecycle actions (Projects.ManageStages on the backend) ------------

  // crmp A-2: stage transitions are POSTs under the project (dms `StageEndpoints.cs:70,78`). Activate,
  // reopen and approve are gone: stages unlock through Unlock gates and approval runs through Approval
  // gates (gap table REMOVED P-24, P-76). Complete takes no body, so it asks for a confirm, not a note.
  async complete(): Promise<void> {
    const ok = await this.confirm.open({
      title: 'Submit stage for approval',
      body: `Complete "${this.stage()?.name}"? Every task must be completed or cancelled first.`,
      confirmLabel: 'Submit',
    });
    if (!ok) return;
    this.run(this.stagesApi.complete(this.projectId(), this.stageId()), 'Stage submitted');
  }

  async reject(): Promise<void> {
    const result = await this.openNote({
      title: 'Send stage back',
      label: 'Reason',
      required: true,
      confirmLabel: 'Send back',
      tone: 'danger',
    });
    if (!result) return;
    this.run(
      this.stagesApi.reject(this.projectId(), this.stageId(), result.note),
      'Stage sent back',
    );
  }

  async remove(): Promise<void> {
    const ok = await this.confirm.open({
      title: 'Delete stage',
      body: `Delete "${this.stage()?.name}" and its tasks? This cannot be undone.`,
      confirmLabel: 'Delete',
      tone: 'danger',
    });
    if (!ok) return;
    this.busy.set(true);
    this.stagesApi.remove(this.projectId(), this.stageId()).subscribe({
      next: () => {
        this.busy.set(false);
        this.toast.show({ tone: 'success', message: 'Stage deleted' });
        this.backToProject();
      },
      error: (err: HttpErrorResponse) => {
        this.busy.set(false);
        this.toast.show({ tone: 'danger', message: friendly(this.errors.parse(err)) });
      },
    });
  }

  private openNote(
    data: StageNoteModalData,
  ): Promise<{ note: string; approvalType: ApprovalType | null } | undefined> {
    return this.modal
      .open<{
        note: string;
        approvalType: ApprovalType | null;
      }>(StageNoteModalComponent, { size: 'sm', data })
      .afterClosed();
  }

  private run(call: Observable<unknown>, successMessage: string): void {
    if (this.busy()) return;
    this.busy.set(true);
    call.subscribe({
      next: () => {
        this.busy.set(false);
        this.toast.show({ tone: 'success', message: successMessage });
        this.reload();
      },
      error: (err: HttpErrorResponse) => {
        this.busy.set(false);
        this.toast.show({ tone: 'danger', message: friendly(this.errors.parse(err)) });
      },
    });
  }

  private syncBreadcrumb(): void {
    const s = this.stage();
    const crumbs: BreadcrumbCrumb[] = [
      { label: 'DMS', route: '/projects' },
      { label: this.projectName() || 'Project', route: `/projects/${this.projectId()}` },
    ];
    if (s) crumbs.push({ label: `STAGE · ${s.order}` });
    this.breadcrumb.set(crumbs);
  }
}
