import {
  ChangeDetectionStrategy,
  Component,
  OnInit,
  computed,
  inject,
  signal,
} from '@angular/core';
import { ActivatedRoute, Router, RouterLink } from '@angular/router';
import { HttpErrorResponse } from '@angular/common/http';
import { EMPTY, forkJoin, of } from 'rxjs';
import { catchError } from 'rxjs/operators';
import { ProjectService } from '../../data/project.service';
import { ScopeOfWorkService } from '../../data/scope-of-work.service';
import { friendlyMessage } from '@platform/errors/error-catalog';
import { ScopeOfWorkStatus } from '../../model/scope-of-work.model';
import { ProjectAccessStore } from '../../stores/project-access.store';
import { ProjectAction } from '../../model/project-actions';
import { ProjectClosedBannerComponent } from '../shared/project-closed-banner.component';
import { ProjectGrantBannerComponent } from '../shared/project-grant-banner.component';
import type { AccessArea } from '../../model/access-grant.model';
import {
  canManageGrants,
  claimCheck,
  grantCovers,
  impliedCodes,
  isGrantAccess,
} from '../../model/project-access';
import { ConfirmService, PeraAlertComponent } from '@ds';
import { ErrorHandlerService, friendly } from '@platform/http/error-handler.service';
import { injectReloadOnConflict } from '@platform/http/concurrency';
import {
  ChangeStatusDialogComponent,
  ChangeStatusDialogData,
} from '../dialogs/change-status-dialog.component';
import { ProjectMemberService } from '../../data/project-member.service';
import { StageTeam, StageTeamsService } from '../../data/stage-teams.service';
import { LocaleService } from '@platform/i18n';
import { CatalogService } from '@platform/i18n/catalog.service';
import { CanDirective } from '@platform/permissions';
import { PermissionsService } from '@platform/permissions';
import { PERM } from '@platform/permissions';
import { ToastService } from '@platform/feedback/toast.service';
import {
  ProjectDetails,
  ProjectMember,
  ProjectStage,
  ProjectStatus,
  ProjectTask,
  ProjectTaskStatus,
  StageStatus,
} from '../../model/project.model';
import { EmployeeService } from '@modules/people';
import { ProjectDocument, ProjectDocumentsService } from '../../data/documents.service';
import {
  formatShortDate,
  projectStatusLabel,
  stageStatusTone,
  taskStatusLabel,
  taskStatusTone,
} from '@shared/ui/status';
import {
  AvatarStackPerson,
  EntityHeaderKpi,
  EntityHeaderMeta,
  ModalService,
  PeraDonutComponent,
  PeraEmptyComponent,
  PeraEntityHeaderCardComponent,
  PeraSkeletonComponent,
  PeraStatusBadgeComponent,
  StatusBadgeTone,
} from '@ds';
import { TasksGanttViewComponent } from '../tasks-view/tasks-gantt-view.component';
import { ActivityFeedComponent } from '../activity/activity-feed.component';
import { StageTimelineComponent } from '../overview/stage-timeline.component';
import {
  collectTasks,
  priorityDistribution,
  statusDistribution,
} from '../overview/task-distribution';
import {
  DocumentationModalComponent,
  DocumentationModalData,
} from '../task-detail/documentation-modal.component';
import { TaskFormDialogComponent, TaskFormDialogData } from '../dialogs/task-form-dialog.component';
import {
  StageFormDialogComponent,
  StageFormDialogData,
} from '../dialogs/stage-form-dialog.component';
import {
  ProjectEditDialogComponent,
  ProjectEditDialogData,
} from '../dialogs/project-edit-dialog.component';

/**
 * Shared class recipes for this page's chrome. They live here rather than in a
 * `styles:` block so the component keeps Angular's default (emulated) style
 * encapsulation and carries zero raw pixels — the Batch 4a de-port (FR-018).
 * Tailwind sees these literals when it scans the file.
 */
const PANEL = 'bg-surface border border-border rounded-card flex flex-col min-w-0';
const PANEL_HEAD = 'px-5 py-3 border-b border-border flex items-center justify-between gap-3';
const PANEL_TITLE = 'm-0 font-medium text-text-primary';
const COUNT_CHIP = 'font-mono text-text-muted px-1.5 py-px bg-selected';
const PANEL_LINK =
  'font-mono font-medium text-text-secondary bg-transparent border-0 p-0 cursor-pointer hover:text-accent transition-colors';
const PANEL_EMPTY = 'px-5 py-6 m-0 text-text-muted';
const TAG =
  'font-mono text-text-secondary px-1.5 py-0.5 border border-border bg-selected uppercase whitespace-nowrap';
const AV_MINI =
  'inline-flex items-center justify-center rounded-full bg-text-primary text-bg font-medium shrink-0';
const BTN =
  'inline-flex items-center gap-2 px-3 py-1.5 min-h-8 bg-surface border border-border text-text-primary font-medium cursor-pointer whitespace-nowrap hover:bg-hover hover:border-text-muted transition-colors';
const BTN_PRIMARY =
  'inline-flex items-center gap-2 px-3 py-1.5 min-h-8 bg-accent border border-accent text-on-accent font-medium cursor-pointer whitespace-nowrap hover:bg-accent-hover transition-colors';
const STL_GRID = 'grid grid-cols-[minmax(0,1fr)_9rem_8rem_6rem_9rem] gap-3 items-center';

/**
 * Project dashboard — a faithful rebuild of the **Project · Marina Tower** view in
 * the `DMS Dashboards.dc.html` handoff. **De-ported in Batch 4a**: the page no
 * longer carries a `styles:` block or `ViewEncapsulation.None`. Its chrome is
 * Tailwind utilities plus the `--fs-*` / `--space-*` scale tokens; the header is
 * `pera-entity-header-card`, status pills are `pera-status-badge`, and the donut /
 * timeline / activity / team / document panels delegate to the real `@ds` and
 * feature components.
 *
 * Single primary load (`GET /api/projects/{id}/details`) feeds the header, KPI
 * strip, stage timeline, the Stages & tasks list/gantt panel and both donuts;
 * a satellite call brings members (header avatars + Team count). The "Open actions" KPI is
 * hidden (crm-prod B2-fe, deferred): it read `GET /api/projects/approval-requests`, which the
 * backend does not expose. A failed primary load lands on a not-found (404) or error state
 * with a retry, never a blank page. Every gated panel carries one
 * `*peraCan` key. Section order matches the design exactly:
 * header → timeline → stages&tasks → status donut → priority donut → activity →
 * team → documents → risk register (empty state).
 */
@Component({
  selector: 'app-project-detail',
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [
    CanDirective,
    PeraAlertComponent,
    ProjectClosedBannerComponent,
    ProjectGrantBannerComponent,
    PeraDonutComponent,
    PeraEmptyComponent,
    PeraEntityHeaderCardComponent,
    PeraSkeletonComponent,
    PeraStatusBadgeComponent,
    RouterLink,
    StageTimelineComponent,
    TasksGanttViewComponent,
    ActivityFeedComponent,
  ],
  templateUrl: './project-detail.component.html',
})
export class ProjectDetailComponent implements OnInit {
  private readonly route = inject(ActivatedRoute);
  private readonly router = inject(Router);
  private readonly projects = inject(ProjectService);
  private readonly membersApi = inject(ProjectMemberService);
  private readonly scopeApi = inject(ScopeOfWorkService);
  protected readonly access = inject(ProjectAccessStore);
  private readonly teamsApi = inject(StageTeamsService);
  private readonly docsApi = inject(ProjectDocumentsService);
  private readonly directory = inject(EmployeeService);
  private readonly perms = inject(PermissionsService);
  private readonly modal = inject(ModalService);
  private readonly toast = inject(ToastService);
  readonly locale = inject(LocaleService);
  /** Only the CRM link-out is catalogued; the rest of this page is hardcoded English. */
  protected readonly catalog = inject(CatalogService);

  /**
   * Per-panel permission keys (real backend claims). The route already enforces
   * `Projects.Read`, so read panels are visible to anyone on the page; the write
   * affordances (New task) and the manage-only Documents panel are what still gate.
   */
  protected readonly perm = {
    tasksPanel: PERM.projects.read,
    newTask: PERM.stageTasks.manage,
    newStage: PERM.stages.manage,
    update: PERM.projects.update,
    activity: PERM.activities.read,
    team: PERM.projects.read,
    manageTeam: PERM.stageTeams.manage,
    documents: PERM.documents.upload,
    // Mirrors the guard on the CRM dashboard route itself (`crm.routes.ts`), so the
    // affordance is absent rather than a click that lands on a 403.
    crmDashboard: PERM.crm.periods.read,
    // sow #10: mirrors the scope-of-work route's guard (`projects.routes.ts`).
    scope: PERM.scope.read,
  };

  /** crmp P2-B: mirrors the CRM Client portal route's read gate (manage OR clients.read). */
  protected readonly canClientPortal = computed(() =>
    this.perms.can([PERM.crm.portalVisibility.manage, PERM.clients.read]),
  );

  readonly loading = signal(true);
  /** Why the primary load failed: `notFound` on a 404, `error` on anything else. */
  readonly loadError = signal<'notFound' | 'error' | null>(null);
  readonly details = signal<ProjectDetails | null>(null);
  readonly members = signal<ProjectMember[]>([]);
  readonly employeeNames = signal<Map<string, string>>(new Map());
  /**
   * Stage owner derivation: `ProjectStage` has no owner field, so the stage row
   * shows its stage-team head. Map keyed by `projectStageId` → the head's id (+
   * the backend-provided head name as a fallback). See STAGE_TASK_BACKEND_GAPS.md.
   */
  readonly stageHeads = signal<Map<string, { id: string; name: string }>>(new Map());
  /** Compact "recent documents" list — first 5 project documents, newest first. */
  readonly recentDocs = signal<ProjectDocument[]>([]);
  /** Shown-event count emitted by the Activity feed → the panel's header chip. */
  readonly activityCount = signal(0);

  /** Stages & tasks panel view toggle. */
  readonly stView = signal<'list' | 'gantt'>('list');

  readonly project = computed(() => this.details()?.project ?? null);
  readonly stages = computed(() => this.details()?.stages ?? []);

  /** crmp P1-B: how the caller reaches the project (null for an older response: member behaviour). */
  readonly myAccess = computed(() => this.details()?.myAccess ?? null);
  /**
   * crmp P1-B: the Access tab — a `project.manage_access` holder, or a Manager by membership (never a
   * grantee, never read_all alone; dms ProjectAccessGrantHandlers.cs:80-89).
   */
  readonly canManageAccess = computed(() =>
    canManageGrants(this.myAccess(), (p) => this.perms.can(p)),
  );
  /** crmp P1-B: a stage-limited grant sees only its stages in the Stages & tasks panel. */
  readonly visibleStages = computed(() => {
    const a = this.myAccess();
    if (!isGrantAccess(a) || !a.stageIds.length) return this.stages();
    return this.stages().filter((s) => a.stageIds.includes(s.id));
  });

  /**
   * crmp P1-B: a panel's claim — the token for members and read_all, the grant's implied table for a
   * grantee (whose token does not carry it), and nothing outside the grant's areas.
   */
  protected areaCan(area: AccessArea, permission: string): boolean {
    return claimCheck(this.myAccess(), area, (p) => this.perms.can(p))(permission);
  }

  /**
   * crmp P1-B: a panel listing rows the backend filters by the grant's stages (Stages & tasks): the
   * area granted and the code implied, whatever the stage limit. Members: the token.
   */
  protected listCan(area: AccessArea, permission: string): boolean {
    const a = this.myAccess();
    if (!isGrantAccess(a)) return this.perms.can(permission);
    return a.areas.includes(area) && impliedCodes(area, a.level).includes(permission);
  }

  /** crmp P1-B: the access covers `area` at project level (a stage-limited grant: Overview only). */
  protected covers(area: AccessArea): boolean {
    return grantCovers(this.myAccess(), area);
  }

  /** crmp P1-B: a link to a list the backend filters by the grant's stages: shown when the area is granted. */
  protected shows(area: AccessArea): boolean {
    const a = this.myAccess();
    return !isGrantAccess(a) || a.areas.includes(area);
  }
  readonly unstagedTasks = computed<ProjectTask[]>(() => this.details()?.unstagedTasks ?? []);
  readonly isStage = computed(() => this.project()?.workflowType === 'Stage');

  /**
   * crmp P-2 (D2): on a Stage project, stages are added by hand only after the scope of work is
   * confirmed (409 `projects.stages.ScopeNotConfirmed`, contract §2.19 #125); a FreeStyle project has
   * no stages (`projects.stages.WorkflowNotSupported`). `null` until the scope is read.
   */
  readonly scopeConfirmed = signal<boolean | null>(null);
  /**
   * Review B3 (CP-4): the backend also takes a project that already has stages (one built from a
   * template) as settled — `Confirmed || ProjectStages.Any` (ManualStageHandlers.cs:63-71).
   */
  readonly stagesSettled = computed<boolean | null>(() => {
    const confirmed = this.scopeConfirmed();
    if (this.stages().length > 0) return true;
    return confirmed;
  });

  /** Permission AND level AND open project (canProjectAction), read through the shared store. */
  can(action: ProjectAction): boolean {
    const id = this.project()?.id;
    return !!id && this.access.can(id, action);
  }

  readonly canAddStage = computed(
    () => this.isStage() && this.stagesSettled() === true && this.can('stage.create'),
  );
  /** The backend's own reason (`projects.stages.ScopeNotConfirmed`) from the error catalog, EN or AR. */
  readonly scopeNotConfirmedMessage = computed(() =>
    friendlyMessage('projects.stages.ScopeNotConfirmed', '', this.catalog.locale()),
  );
  /** A Manager on an unconfirmed Stage project sees why "New stage" is missing, with the SoW link. */
  readonly scopeBlocksStages = computed(
    () => this.isStage() && this.stagesSettled() === false && this.can('stage.create'),
  );
  readonly activeStage = computed<ProjectStage | null>(
    () => this.stages().find((s) => s.status === 'Active') ?? null,
  );

  /** Stage to attach a header-created task to (active, else first). */
  readonly newTaskStage = computed<ProjectStage | null>(
    () => this.activeStage() ?? this.stages()[0] ?? null,
  );

  // ---- task distributions (client-side, from /details) -----------------------
  readonly allTasks = computed(() => collectTasks(this.details()));
  readonly totalTasks = computed(() => this.allTasks().length);
  readonly statusSegments = computed(() => statusDistribution(this.allTasks()));
  readonly prioritySegments = computed(() => priorityDistribution(this.allTasks()));
  readonly doneCount = computed(
    () => this.allTasks().filter((t) => t.status === 'Completed').length,
  );
  readonly inProgressCount = computed(
    () => this.allTasks().filter((t) => t.status === 'InProgress').length,
  );

  readonly stageCount = computed(() => this.stages().length);
  /** Days until the planned end date (negative ⇒ overdue). */
  readonly daysRemaining = computed<number | null>(() => {
    const end = this.project()?.endDate;
    if (!end) return null;
    const d = new Date(end);
    if (isNaN(d.getTime())) return null;
    return Math.round((d.getTime() - Date.now()) / 86_400_000);
  });

  /** Header avatar stack: first 4 members + `+N` overflow. */
  readonly memberAvatars = computed(() => this.members().slice(0, 4));
  readonly memberOverflow = computed(() => Math.max(0, this.members().length - 4));

  /** Days the project has slipped past its planned end (only when both dates exist). */
  readonly dueSlip = computed<number | null>(() => {
    const p = this.project();
    if (!p?.endDate || !p.actualEndDate) return null;
    const end = new Date(p.endDate).getTime();
    const actual = new Date(p.actualEndDate).getTime();
    if (isNaN(end) || isNaN(actual)) return null;
    return Math.round((actual - end) / 86_400_000);
  });

  readonly statusLabel = projectStatusLabel;
  readonly taskLabel = taskStatusLabel;

  // ---- chrome class recipes (Batch 4a de-port) ------------------------------
  protected readonly panelClass = PANEL;
  protected readonly panelHeadClass = PANEL_HEAD;
  protected readonly panelTitleClass = PANEL_TITLE;
  protected readonly countChipClass = COUNT_CHIP;
  protected readonly panelLinkClass = PANEL_LINK;
  protected readonly panelEmptyClass = PANEL_EMPTY;
  protected readonly tagClass = TAG;
  protected readonly avMiniClass = AV_MINI;
  protected readonly btnClass = BTN;
  protected readonly btnPrimaryClass = BTN_PRIMARY;
  protected readonly btnSmClass = `${BTN} text-xs`;
  protected readonly stlGrid = STL_GRID;
  protected readonly stlNameClass =
    'flex items-center gap-2 min-w-0 truncate font-semibold text-text-primary';
  protected readonly stlOwnerClass = 'flex items-center gap-1.5 text-text-secondary';
  protected readonly stlTaskClass = `${STL_GRID} w-full text-start px-5 py-2 border-0 border-b border-border-soft bg-transparent cursor-pointer hover:bg-hover transition-colors`;

  protected chipClass(active: boolean): string {
    const base = 'font-mono font-medium px-2 py-1 border cursor-pointer transition-colors';
    return active
      ? `${base} bg-accent border-accent text-on-accent`
      : `${base} bg-surface border-border text-text-secondary hover:bg-hover hover:text-text-primary`;
  }

  /** `BadgeTone` (shared) → `StatusBadgeTone` (design-system). */
  private toStatusTone(tone: string): StatusBadgeTone {
    if (tone === 'danger') return 'error';
    if (tone === 'accent') return 'info';
    if (tone === 'success' || tone === 'warning' || tone === 'info') return tone;
    return 'neutral';
  }

  protected stageStTone(status: StageStatus): StatusBadgeTone {
    return this.toStatusTone(stageStatusTone(status));
  }

  protected taskStTone(status: ProjectTaskStatus): StatusBadgeTone {
    return this.toStatusTone(taskStatusTone(status));
  }

  // ---- entity header card (Batch 1) -----------------------------------------
  // The prototype's `.ehc` project form: name + code badge + status, a meta row
  // whose Team cell is an avatar stack, and a 4-up KPI bar. `nameAr` stays
  // unbound — `ProjectResponse` carries no Arabic name (only `ProjectStage`
  // does), and inventing one would be a backend change.

  /** ProjectStatus → the status-badge tone. */
  readonly headerStatus = computed<{ tone: StatusBadgeTone; label: string } | undefined>(() => {
    const p = this.project();
    if (!p) return undefined;
    const tone: StatusBadgeTone =
      p.status === 'InProgress'
        ? 'info'
        : p.status === 'OnHold'
          ? 'warning'
          : p.status === 'Completed'
            ? 'success'
            : p.status === 'Cancelled'
              ? 'error'
              : 'neutral';
    return { tone, label: this.statusLabel(p.status) };
  });

  /** Every project member, as avatar-stack people (the stack applies its own `+N`). */
  readonly teamPeople = computed<AvatarStackPerson[]>(() =>
    this.members().map((m) => ({ name: this.nameOf(m.employeeId) })),
  );

  /**
   * The active stage, the workflow type, or the stage count — the prototype
   * folds all three into its `.role` line; the meta row is this card's
   * equivalent.
   */
  readonly headerStageMeta = computed<string>(() => {
    if (!this.isStage()) return 'Free-style';
    const active = this.activeStage();
    if (active) return `Stage ${this.pad(active.order)} · ${active.name}`;
    const n = this.stageCount();
    return n ? `${n} stage${n === 1 ? '' : 's'} defined` : '—';
  });

  readonly headerMeta = computed<EntityHeaderMeta[]>(() => {
    const p = this.project();
    if (!p) return [];
    const slip = this.dueSlip();
    const due = this.shortDate(p.endDate);
    const pairs: EntityHeaderMeta[] = [
      { label: 'Client', value: p.clientName || '—' },
      // The details response carries only `ownerId` (an hr employee id); the name resolves through
      // the employee directory this page already loads for member and assignee names.
      { label: 'Product owner', value: p.productOwnerName || this.nameOf(p.productOwnerId) || '—' },
    ];
    if (this.members().length) {
      pairs.push({ label: 'Team', value: { people: this.teamPeople(), max: 4 } });
    }
    pairs.push(
      { label: 'Stage', value: this.headerStageMeta() },
      { label: 'Start', value: this.shortDate(p.startDate) },
      { label: 'Due', value: slip === null ? due : `${due} (${slip >= 0 ? '+' : ''}${slip}d)` },
    );
    return pairs;
  });

  readonly headerKpis = computed<EntityHeaderKpi[]>(() => {
    const p = this.project();
    if (!p) return [];
    const days = this.daysRemaining();
    const kpis: EntityHeaderKpi[] = [
      { caption: 'Progress', value: p.progressPercentage, frac: '%' },
      { caption: 'Tasks', value: this.totalTasks(), frac: `${this.doneCount()} done` },
      {
        caption: 'Days remaining',
        value: days === null ? '—' : Math.abs(days),
        frac: days === null ? undefined : days >= 0 ? 'd left' : 'd overdue',
      },
    ];
    // ProjectDetailsResponse.Gates (crm-prod B2-fe): shown only when the project has gates.
    const gates = this.details()?.gates;
    if (gates && gates.total > 0) {
      // FINDING-P2-8: a crm-prod addition, so catalogued (EN + AR) unlike the ported labels.
      kpis.push({
        caption: this.catalog.t('project.kpiGates'),
        value: gates.pending,
        frac: this.catalog.t('project.kpiGatesPendingOf', { total: gates.total }),
      });
    }
    return kpis;
  });

  ngOnInit(): void {
    this.load();
  }

  /** The error state's Retry: runs the primary load again from the skeleton. */
  retryLoad(): void {
    this.load();
  }

  private load(): void {
    const id = this.route.snapshot.paramMap.get('id')!;
    this.loading.set(true);
    this.loadError.set(null);
    forkJoin({
      details: this.projects.getDetails(id),
      members: this.membersApi.getByProject(id).pipe(catchError(() => of([] as ProjectMember[]))),
    })
      .pipe(
        catchError((err: unknown) => {
          this.loadError.set(
            err instanceof HttpErrorResponse && err.status === 404 ? 'notFound' : 'error',
          );
          this.loading.set(false);
          return EMPTY;
        }),
      )
      .subscribe(({ details, members }) => {
        this.details.set(details);
        this.access.seed(details.project);
        this.loadScope(id);
        this.members.set(members);
        this.loading.set(false);
        this.resolveNames();
        this.loadStageHeads(id);
        this.loadRecentDocuments(id);
      });
  }

  readonly lifecycleBusy = signal(false);

  /** crmp P-9: `PUT …/status`; StagesOpen / TasksOpen show inside the dialog. */
  async changeStatus(): Promise<void> {
    const p = this.project();
    if (!p) return;
    const data: ChangeStatusDialogData = {
      projectId: p.id,
      projectName: p.name,
      current: p.status,
    };
    const changed = await this.modal
      .open<ProjectStatus | undefined>(ChangeStatusDialogComponent, { size: 'sm', data })
      .afterClosed();
    if (changed) this.afterLifecycleChange(p.id);
  }

  /** crmp P-9: `PUT …/active?isActive=` — an inactive project is closed for work. */
  toggleActive(): void {
    const p = this.project();
    if (!p || this.lifecycleBusy()) return;
    this.lifecycleBusy.set(true);
    const call = p.isActive ? this.projects.deactivate(p.id) : this.projects.activate(p.id);
    call.subscribe({
      next: () => {
        this.lifecycleBusy.set(false);
        this.afterLifecycleChange(p.id);
      },
      error: (err: HttpErrorResponse) => this.lifecycleFailed(p.id, err),
    });
  }

  /** crmp P-9: `DELETE /projects/{id}`; NotDeletable shows the backend's reason. */
  async deleteProject(): Promise<void> {
    const p = this.project();
    if (!p || this.lifecycleBusy()) return;
    const ok = await this.confirmDialog.open({
      title: this.catalog.t('plc.deleteTitle'),
      body: this.catalog.t('plc.deleteBody', { name: p.name }),
      confirmLabel: this.catalog.t('plc.delete'),
      tone: 'danger',
    });
    if (!ok) return;
    this.lifecycleBusy.set(true);
    this.projects.remove(p.id).subscribe({
      next: () => {
        this.lifecycleBusy.set(false);
        this.toast.show({ tone: 'success', message: this.catalog.t('plc.deleted') });
        void this.router.navigate(['/projects']);
      },
      error: (err: HttpErrorResponse) => this.lifecycleFailed(p.id, err),
    });
  }

  private afterLifecycleChange(id: string): void {
    this.access.refresh(id);
    this.load();
  }

  private lifecycleFailed(id: string, err: HttpErrorResponse): void {
    this.lifecycleBusy.set(false);
    if (this.reloadOnConflict(err, () => this.afterLifecycleChange(id))) return;
    this.toast.show({ tone: 'danger', message: friendly(this.lifecycleErrors.parse(err)) });
    this.access.refresh(id);
  }

  private readonly confirmDialog = inject(ConfirmService);
  private readonly lifecycleErrors = inject(ErrorHandlerService);
  private readonly reloadOnConflict = injectReloadOnConflict();

  /** crmp P-2: whether the scope of work is confirmed (manual stages need it). */
  private loadScope(id: string): void {
    if (!this.isStage()) {
      this.scopeConfirmed.set(false);
      return;
    }
    this.scopeApi
      .getScope(id)
      .pipe(catchError(() => of(null)))
      .subscribe((scope) => this.scopeConfirmed.set(scope?.status === ScopeOfWorkStatus.Confirmed));
  }

  /** Resolve employee ids → names for member avatars + task assignees. */
  private resolveNames(): void {
    this.directory
      .listPaged({ page: 1, pageSize: 500 })
      .pipe(catchError(() => of(null)))
      .subscribe((paged) => {
        if (paged) this.employeeNames.set(new Map(paged.items.map((e) => [e.id, e.fullName])));
      });
  }

  /**
   * Stage owner = stage-team head. Loads the project's stage teams once and keys
   * the head id/name by `projectStageId` (first team per stage). Resolved to a
   * display name through `employeeNames`, with the team's `headName` as fallback.
   */
  private loadStageHeads(id: string): void {
    this.teamsApi
      .getByProject(id)
      .pipe(catchError(() => of([] as StageTeam[])))
      .subscribe((teams) => {
        const map = new Map<string, { id: string; name: string }>();
        for (const t of teams) {
          if (t.projectStageId && t.headId && !map.has(t.projectStageId)) {
            map.set(t.projectStageId, { id: t.headId, name: t.headName });
          }
        }
        this.stageHeads.set(map);
      });
  }

  /** Compact "recent documents" panel — first 5 project documents, newest first. */
  private loadRecentDocuments(id: string): void {
    if (!this.areaCan('Documents', this.perm.documents)) return;
    this.docsApi
      .getByProject(id)
      .pipe(catchError(() => of([] as ProjectDocument[])))
      .subscribe((list) => {
        const recent = [...list]
          .sort((a, b) => new Date(b.createdAtUtc).getTime() - new Date(a.createdAtUtc).getTime())
          .slice(0, 5);
        this.recentDocs.set(recent);
      });
  }

  nameOf(employeeId: string | null): string {
    if (!employeeId) return '';
    return this.employeeNames().get(employeeId) ?? '';
  }

  /** Stage owner display name (team head), resolved through `employeeNames`. */
  stageOwner(stageId: string): string {
    const head = this.stageHeads().get(stageId);
    if (!head) return '';
    return this.nameOf(head.id) || head.name || '';
  }

  /** Uppercase file extension used as the document's kind tag. */
  docKind(doc: ProjectDocument): string {
    return (doc.fileName.split('.').pop() ?? '').toUpperCase().slice(0, 4) || 'FILE';
  }

  /** Document uploader name, if it resolves through the employee directory. */
  docAuthor(doc: ProjectDocument): string {
    return this.nameOf(doc.uploadedByUserId);
  }

  /** Human-readable byte size (B / KB / MB / GB). */
  fileSize(bytes: number): string {
    if (!bytes) return '0 B';
    const units = ['B', 'KB', 'MB', 'GB'];
    let value = bytes;
    let i = 0;
    while (value >= 1024 && i < units.length - 1) {
      value /= 1024;
      i++;
    }
    return `${value.toFixed(i === 0 ? 0 : value < 10 ? 1 : 0)} ${units[i]}`;
  }

  /** Coarse relative timestamp (today / yesterday / Nd ago / Nw ago / short date). */
  relativeTime(iso: string | null | undefined): string {
    if (!iso) return '';
    const then = new Date(iso).getTime();
    if (isNaN(then)) return '';
    const days = Math.floor((Date.now() - then) / 86_400_000);
    if (days < 1) return 'today';
    if (days === 1) return 'yesterday';
    if (days < 7) return `${days}d ago`;
    if (days < 30) return `${Math.floor(days / 7)}w ago`;
    return this.shortDate(iso);
  }

  /** Two-letter initials from a resolved name (falls back to a dash). */
  initials(name: string): string {
    const parts = name.trim().split(/\s+/).filter(Boolean);
    if (!parts.length) return '—';
    return (parts[0][0] + (parts[1]?.[0] ?? '')).toUpperCase();
  }

  pad(n: number): string {
    return String(n).padStart(2, '0');
  }

  shortDate(iso: string | null | undefined): string {
    return formatShortDate(iso, this.locale.locale());
  }

  /** Best-available due endpoint for a task row. */
  taskDue(t: ProjectTask): string {
    return this.shortDate(t.dueDate ?? t.completedOnUtc);
  }

  /** Best-available due endpoint for a stage row. */
  stageDue(s: ProjectStage): string {
    return this.shortDate(s.estimatedEndDate ?? s.completedOnUtc);
  }

  // ---- status class maps (retained: referenced by project-detail.component.spec.ts)
  projStCls(status: ProjectStatus): string {
    return status === 'InProgress'
      ? 'inprogress'
      : status === 'OnHold'
        ? 'onhold'
        : status === 'Completed'
          ? 'completed'
          : status === 'Cancelled'
            ? 'cancelled'
            : 'draft';
  }
  projStColor(status: ProjectStatus): string {
    return status === 'InProgress'
      ? 'var(--info)'
      : status === 'OnHold'
        ? 'var(--warning)'
        : status === 'Completed'
          ? 'var(--success)'
          : status === 'Cancelled'
            ? 'var(--error)'
            : 'var(--color-text-muted)';
  }
  stageStCls(status: StageStatus): string {
    return status === 'Active'
      ? 'inprogress'
      : status === 'Completed'
        ? 'completed'
        : status === 'Rejected'
          ? 'rejected'
          : 'draft';
  }
  stageStLabel(status: StageStatus): string {
    return status === 'Active'
      ? 'In progress'
      : status === 'Completed'
        ? 'Completed'
        : status === 'Rejected'
          ? 'Rejected'
          : 'Locked';
  }
  taskStCls(status: ProjectTaskStatus): string {
    return status === 'Completed'
      ? 'completed'
      : status === 'InProgress'
        ? 'inprogress'
        : status === 'PendingApproval'
          ? 'pending'
          : status === 'Rejected'
            ? 'rejected'
            : 'draft';
  }

  // ---- actions ---------------------------------------------------------------

  /** Header → edit the project's name/description/notes; reload on success. */
  async editProject(): Promise<void> {
    const p = this.project();
    if (!p) return;
    const data: ProjectEditDialogData = {
      id: p.id,
      initial: { name: p.name, description: p.description, notes: p.notes },
    };
    const ref = this.modal.open<boolean>(ProjectEditDialogComponent, { size: 'md', data });
    if (await ref.afterClosed()) this.reload();
  }

  /** Header → open the project documents browser (shared documentation window). */
  openDocuments(): void {
    const data: DocumentationModalData = {
      projectId: this.project()!.id,
      context: this.project()?.name ?? null,
      initialFolder: null,
    };
    this.modal.open(DocumentationModalComponent, { size: 'xl', data });
  }

  /**
   * Header → the CRM requirement-gathering workspace for this project (brief, spaces,
   * items, provisioning, scheduler all hang off it).
   *
   * A plain URL, never a CRM component import — features may not import each other.
   */
  openRequirementGathering(): void {
    const project = this.project();
    if (project) void this.router.navigate(['/crm/projects', project.id]);
  }

  /** Header → create a task on the active (or first) stage; reload on success. */
  async newTask(): Promise<void> {
    const project = this.project();
    const stage = this.newTaskStage();
    if (!project || !stage) return;
    const nextOrder = (stage.tasks.reduce((max, t) => Math.max(max, t.order), 0) || 0) + 10;
    const data: TaskFormDialogData = {
      mode: 'create',
      projectId: project.id,
      projectStageId: stage.id,
      nextOrder,
    };
    const created = await this.modal
      .open<boolean>(TaskFormDialogComponent, { size: 'lg', data })
      .afterClosed();
    if (created) this.reload();
  }

  /** Header → add a stage to this project; reload on success. */
  async newStage(): Promise<void> {
    const project = this.project();
    if (!project) return;
    const nextOrder = (this.stages().reduce((max, s) => Math.max(max, s.order), 0) || 0) + 10;
    const data: StageFormDialogData = { mode: 'create', projectId: project.id, nextOrder };
    const created = await this.modal
      .open<boolean>(StageFormDialogComponent, { size: 'lg', data })
      .afterClosed();
    if (created) this.reload();
  }

  openTask(task: ProjectTask): void {
    const project = this.project();
    if (!project) return;
    void this.router.navigate(['/projects', project.id, 'tasks', task.id]);
  }

  /** Timeline click → open the stage's detail page. */
  openStage(stage: ProjectStage): void {
    // crmp P1-B: a stage outside a stage-limited grant has no page for the caller.
    if (!grantCovers(this.myAccess(), 'StagesAndTasks', stage.id)) return;
    const project = this.project();
    if (project) void this.router.navigate(['/projects', project.id, 'stages', stage.id]);
  }

  /** Team panel → manage team (gated on manageStageTeams). */
  manageTeam(): void {
    const project = this.project();
    if (project) void this.router.navigate(['/projects', project.id, 'teams']);
  }

  /**
   * Risk register has no backend endpoint yet (see STAGE_TASK_BACKEND_GAPS.md).
   * The design's "Log a risk" CTA is a MOCK affordance — surface that honestly
   * rather than wiring a fake create.
   */
  logRisk(): void {
    this.toast.show({ tone: 'info', message: 'Risk register isn’t available yet.' });
  }

  backToProjects(): void {
    void this.router.navigate(['/projects']);
  }

  /**
   * Refresh after a dialog write. A 404 (the project went away, or the caller lost access) lands on
   * the not-found state: `getDetails` marks 404 handled, so nothing else would say so.
   */
  private reload(): void {
    const id = this.route.snapshot.paramMap.get('id')!;
    this.projects
      .getDetails(id)
      .pipe(
        catchError((err: unknown) => {
          if (err instanceof HttpErrorResponse && err.status === 404)
            this.loadError.set('notFound');
          return of(null);
        }),
      )
      .subscribe((d) => {
        if (d) this.details.set(d);
      });
  }

  /** A task row's progress cell: the sub-task percentage, or a dash when the response has none. */
  taskProgress(t: ProjectTask): string {
    return t.progressPercent === null ? '—' : `${t.progressPercent}%`;
  }
}
