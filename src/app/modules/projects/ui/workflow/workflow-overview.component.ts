import { ProjectAccessStore } from '../../stores/project-access.store';
import {
  ChangeDetectionStrategy,
  Component,
  computed,
  inject,
  input,
  output,
  signal,
} from '@angular/core';
import { RouterLink } from '@angular/router';
import { ProjectStage, ProjectTask } from '../../model/project.model';
import { LocaleService } from '@platform/i18n';
import { formatShortDate } from '@shared/ui/status';
import { PeraEmptyComponent } from '@ds';
import { TasksGanttViewComponent } from '../tasks-view/tasks-gantt-view.component';

type HealthBand = 'Healthy' | 'Watch' | 'AtRisk' | 'Blocked';

interface StageHealth {
  stage: ProjectStage;
  /** % of tasks done (0-100). */
  progress: number;
  /** Days remaining until the latest task due date — negative if overdue. */
  slack: number | null;
  health: HealthBand;
}

const DAY_MS = 86_400_000;

/**
 * Project Detail · Workflow tab body. Stage health board + Gantt + builder
 * shortcut. Replaces the old single-card placeholder.
 */
@Component({
  selector: 'app-workflow-overview',
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [RouterLink, CanDirective, PeraEmptyComponent, TasksGanttViewComponent],
  template: `
    <!-- Header row -->
    <div class="flex items-center justify-between gap-3 mb-4 flex-wrap">
      <div>
        <h3 class="m-0 fs-body font-semibold">Workflow</h3>
        <p class="m-0 fs-label text-text-secondary mt-0.5">
          Stage health, dependencies and timeline for this project's pipeline.
        </p>
      </div>
      <div class="inline-flex items-center gap-2">
        <div
          class="inline-flex items-center gap-1 p-0.5 bg-bg border border-border font-mono fs-label"
        >
          <button
            type="button"
            (click)="view.set('board')"
            class="px-2.5 py-1 cursor-pointer transition-colors"
            [class.bg-text-primary]="view() === 'board'"
            [class.text-bg]="view() === 'board'"
            [class.text-text-secondary]="view() !== 'board'"
          >
            Board
          </button>
          <button
            type="button"
            (click)="view.set('gantt')"
            class="px-2.5 py-1 cursor-pointer transition-colors"
            [class.bg-text-primary]="view() === 'gantt'"
            [class.text-bg]="view() === 'gantt'"
            [class.text-text-secondary]="view() !== 'gantt'"
          >
            Gantt
          </button>
        </div>
        @if (canOpenBuilder()) {
          <a
            [routerLink]="['/projects', projectId(), 'workflow', 'builder']"
            class="inline-flex items-center gap-1.5 px-2.5 py-1.5 font-mono fs-label uppercase border border-border bg-surface hover:bg-surface-muted"
          >
            Open builder <span class="inline-block rtl:rotate-180" aria-hidden="true">→</span>
          </a>
        }
      </div>
    </div>

    <!-- KPI summary across the workflow -->
    <div class="grid grid-cols-2 md:grid-cols-4 gap-0 border border-border bg-surface mb-4">
      <div class="px-5 py-3.5">
        <div class="font-mono fs-micro uppercase tracking-[0.06em] text-text-muted">Stages</div>
        <div class="fs-h2 font-semibold leading-none tabular-nums mt-1">
          {{ stages().length }}
        </div>
      </div>
      <div class="px-5 py-3.5 border-s border-border-soft">
        <div class="font-mono fs-micro uppercase tracking-[0.06em] text-text-muted">Active</div>
        <div class="fs-h2 font-semibold leading-none tabular-nums mt-1">
          {{ activeCount() }}
        </div>
      </div>
      <div class="px-5 py-3.5 border-s border-border-soft">
        <div class="font-mono fs-micro uppercase tracking-[0.06em] text-text-muted">At risk</div>
        <div
          class="fs-h2 font-semibold leading-none tabular-nums mt-1"
          [class.text-warning]="atRiskCount() > 0"
        >
          {{ atRiskCount() }}
        </div>
      </div>
      <div class="px-5 py-3.5 border-s border-border-soft">
        <div class="font-mono fs-micro uppercase tracking-[0.06em] text-text-muted">Completed</div>
        <div class="fs-h2 font-semibold leading-none tabular-nums mt-1 text-success">
          {{ completedCount() }}
        </div>
      </div>
    </div>

    @if (stages().length === 0) {
      <pera-empty
        title="No stages defined"
        description="Use the workflow builder to author the stage graph for this project."
      />
    } @else if (view() === 'gantt') {
      <app-tasks-gantt-view [stages]="stages()" [tasks]="unstagedTasks()" />
    } @else {
      <!-- Stage health board -->
      <div class="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 gap-3">
        @for (h of healthRows(); track h.stage.id) {
          <button
            type="button"
            (click)="stageClick.emit(h.stage)"
            class="text-start border bg-surface hover:bg-surface-muted transition-colors cursor-pointer p-4 flex flex-col gap-2"
            [class.border-success]="h.health === 'Healthy'"
            [class.border-border]="h.health === 'Watch'"
            [class.border-warning]="h.health === 'AtRisk'"
            [class.border-danger]="h.health === 'Blocked'"
          >
            <div class="flex items-start justify-between gap-2">
              <div class="min-w-0">
                <div class="font-mono fs-micro uppercase tracking-[0.06em] text-text-muted">
                  Stage {{ h.stage.order }} · {{ statusLabel(h.stage.status) }}
                </div>
                <div class="fs-body font-semibold mt-1 truncate">{{ h.stage.name }}</div>
              </div>
              <span
                class="inline-flex items-center gap-1.5 font-mono fs-micro uppercase px-1.5 py-0.5 border whitespace-nowrap"
                [class.border-success]="h.health === 'Healthy'"
                [class.text-success]="h.health === 'Healthy'"
                [class.bg-success-soft]="h.health === 'Healthy'"
                [class.border-border]="h.health === 'Watch'"
                [class.text-text-secondary]="h.health === 'Watch'"
                [class.bg-bg]="h.health === 'Watch'"
                [class.border-warning]="h.health === 'AtRisk'"
                [class.text-warning]="h.health === 'AtRisk'"
                [class.bg-warning-soft]="h.health === 'AtRisk'"
                [class.border-danger]="h.health === 'Blocked'"
                [class.text-danger]="h.health === 'Blocked'"
                [class.bg-danger-soft]="h.health === 'Blocked'"
              >
                {{ healthLabel(h.health) }}
              </span>
            </div>

            <!-- Progress bar -->
            <div class="flex items-center gap-2.5">
              <div class="flex-1 h-bar-track bg-border-soft relative overflow-hidden">
                <span
                  class="absolute inset-y-0 start-0"
                  [class.bg-text-primary]="h.health !== 'Blocked' && h.health !== 'AtRisk'"
                  [class.bg-warning]="h.health === 'AtRisk'"
                  [class.bg-danger]="h.health === 'Blocked'"
                  [style.width.%]="h.progress"
                ></span>
              </div>
              <span class="font-mono fs-label text-text-muted tabular-nums w-10 text-end"
                >{{ h.progress }}%</span
              >
            </div>

            <div class="flex items-center justify-between gap-2 mt-1">
              <span class="font-mono fs-label text-text-muted">
                {{ h.stage.completedTasks }}/{{ h.stage.totalTasks }} tasks
              </span>
              @if (h.slack !== null) {
                <span
                  class="font-mono fs-label"
                  [class.text-danger]="h.slack < 0"
                  [class.text-warning]="h.slack !== null && h.slack >= 0 && h.slack < 3"
                  [class.text-text-muted]="h.slack !== null && h.slack >= 3"
                >
                  {{ h.slack >= 0 ? h.slack + 'd left' : -h.slack + 'd overdue' }}
                </span>
              } @else {
                <span class="font-mono fs-label text-text-muted">no due dates</span>
              }
            </div>

            @if (h.stage.startedOnUtc || h.stage.completedOnUtc) {
              <div
                class="flex items-center gap-2 font-mono fs-label text-text-muted border-t border-border-soft pt-2 mt-1"
              >
                <span>
                  {{
                    h.stage.startedOnUtc ? shortDate(h.stage.startedOnUtc, locale.locale()) : '—'
                  }}
                  <span class="inline-block rtl:rotate-180" aria-hidden="true">→</span>
                  {{
                    h.stage.completedOnUtc
                      ? shortDate(h.stage.completedOnUtc, locale.locale())
                      : '—'
                  }}
                </span>
              </div>
            }
          </button>
        }
      </div>
    }
  `,
})
export class WorkflowOverviewComponent {
  readonly locale = inject(LocaleService);

  readonly projectId = input.required<string>();
  private readonly access = inject(ProjectAccessStore);
  /** crmp review R2: the builder link shows only to a caller who may add stages (claim AND level). */
  readonly canOpenBuilder = computed(() => this.access.can(this.projectId(), 'stage.create'));
  readonly stages = input<ProjectStage[]>([]);
  readonly unstagedTasks = input<ProjectTask[]>([]);

  readonly stageClick = output<ProjectStage>();

  /** Local view toggle — Board (default) vs Gantt. */
  readonly view = signal<'board' | 'gantt'>('board');

  readonly statusLabel = (status: string): string => {
    switch (status) {
      case 'InProgress':
        return 'In progress';
      default:
        return status || '—';
    }
  };
  readonly shortDate = formatShortDate;

  healthLabel(h: HealthBand): string {
    return h === 'AtRisk' ? 'At risk' : h;
  }

  readonly healthRows = computed<StageHealth[]>(() => {
    return this.stages().map((stage) => this.scoreStage(stage));
  });

  readonly activeCount = computed(() => this.stages().filter((s) => s.status === 'Active').length);

  readonly completedCount = computed(
    () => this.stages().filter((s) => s.status === 'Completed').length,
  );

  readonly atRiskCount = computed(
    () => this.healthRows().filter((r) => r.health === 'AtRisk' || r.health === 'Blocked').length,
  );

  /**
   * Score one stage's operational health.
   *   Blocked  — Rejected
   *   AtRisk   — overdue or due-soon and not yet completed
   *   Healthy  — Active with good slack OR completed
   *   Watch    — everything else (Locked, Open, pending approval)
   */
  private scoreStage(stage: ProjectStage): StageHealth {
    const progress =
      stage.totalTasks > 0
        ? Math.round((100 * stage.completedTasks) / stage.totalTasks)
        : (stage.progressPercent ?? 0);

    // Latest due date among the stage's tasks (closest deadline = the binding one).
    const dueDays: number[] = [];
    for (const t of stage.tasks ?? []) {
      if (t.dueDate && t.status !== 'Completed' && t.status !== 'Rejected') {
        const d = Math.floor((new Date(t.dueDate).getTime() - Date.now()) / DAY_MS);
        dueDays.push(d);
      }
    }
    const slack = dueDays.length ? Math.min(...dueDays) : null;

    let health: HealthBand;
    if (stage.status === 'Rejected') {
      health = 'Blocked';
    } else if (stage.status === 'Completed') {
      health = 'Healthy';
    } else if (slack !== null && slack < 0) {
      health = 'AtRisk';
    } else if (slack !== null && slack < 3 && progress < 80) {
      health = 'AtRisk';
    } else if (stage.status === 'Active') {
      health = 'Healthy';
    } else {
      health = 'Watch';
    }

    return { stage, progress, slack, health };
  }
}
