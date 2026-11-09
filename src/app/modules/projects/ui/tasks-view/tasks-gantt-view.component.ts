import { ChangeDetectionStrategy, Component, computed, input } from '@angular/core';
import { ProjectStage, ProjectTask } from '../../model/project.model';

const DAY_MS = 86_400_000;
/** Hard ceiling on rendered days so a stray date doesn't explode the grid. */
const MAX_DAYS = 180;

interface GanttBar {
  /** 0-based day index range, inclusive start / exclusive end. */
  startDay: number;
  endDay: number;
  cls: string;
}

interface GanttRow {
  id: string;
  label: string;
  isStage: boolean;
  status: string;
  bar: GanttBar | null;
}

function day(iso: string): number {
  return Math.floor(new Date(iso).getTime() / DAY_MS);
}

/** Effective plot window — prefer the actual dates, fall back to the planned ones. */
const stageStart = (s: ProjectStage): string | null => s.startedOnUtc ?? s.estimatedStartDate;
const stageEnd = (s: ProjectStage): string | null => s.completedOnUtc ?? s.estimatedEndDate;
const taskStart = (t: ProjectTask): string | null => t.startedOnUtc ?? t.estimatedStartDate;
const taskEnd = (t: ProjectTask): string | null => t.completedOnUtc ?? t.dueDate;

/**
 * Bar fill per ProjectTaskStatus/StageStatus — status by shape first, tokens
 * only: done = solid ink, in-progress/current = solid accent, rejected = solid
 * danger, future/locked = muted outline (no fill). No soft pastel blocks.
 */
function statusClass(status: string): string {
  switch (status) {
    case 'InProgress':
    case 'Active':
      return 'bg-accent border border-accent';
    case 'Completed':
      return 'bg-ink border border-ink';
    case 'Rejected':
    case 'Cancelled':
      return 'bg-danger border border-danger';
    default: // Locked, Open, PendingApproval, Skipped
      return 'bg-transparent border border-border-strong';
  }
}

/**
 * Pure CSS-grid Gantt over the project's stages and tasks. One summary row per
 * stage plus nested task rows; bars span the task's started→completed/due
 * window. Sticky name column, vertical "today" line. No chart library.
 */
@Component({
  selector: 'app-tasks-gantt-view',
  changeDetection: ChangeDetectionStrategy.OnPush,
  host: { class: 'block' },
  template: `
    <div class="border border-border bg-surface rounded-card overflow-x-auto">
      <!-- Axis header -->
      <div class="grid border-b border-border" [style.grid-template-columns]="gridColumns()">
        <div
          class="sticky start-0 z-10 bg-surface px-4 py-2 font-mono fs-micro uppercase tracking-[0.04em] text-text-muted border-e border-border"
        >
          Task
        </div>
        @for (tick of ticks(); track tick.day) {
          <div class="relative py-2" [style.grid-column-start]="tick.day + 2">
            <span class="absolute start-0 font-mono fs-micro text-text-muted whitespace-nowrap">{{
              tick.label
            }}</span>
          </div>
        }
      </div>

      @for (row of rows(); track row.id) {
        <div
          class="grid items-center border-b border-border-soft last:border-b-0 relative"
          [class.bg-surface-muted]="row.isStage"
          [style.grid-template-columns]="gridColumns()"
        >
          <!-- Sticky name column -->
          <div
            class="sticky start-0 z-10 px-4 py-1.5 border-e border-border truncate"
            [class.bg-surface-muted]="row.isStage"
            [class.bg-surface]="!row.isStage"
          >
            <span
              class="fs-caption truncate"
              [class.font-semibold]="row.isStage"
              [class.ps-4]="!row.isStage"
              >{{ row.label }}</span
            >
          </div>
          <!-- Today line (dashed, distinct from solid in-progress bars) -->
          @if (todayDay() !== null) {
            <div
              class="h-full border-l border-dashed border-accent justify-self-start row-start-1 pointer-events-none"
              [style.grid-column-start]="todayDay()! + 2"
              aria-hidden="true"
            ></div>
          }
          <!-- Bar -->
          @if (row.bar; as bar) {
            <div
              class="row-start-1 my-1.5 min-w-bar-group"
              [class]="bar.cls + (row.isStage ? ' h-bar-group' : ' h-bar-item')"
              [style.grid-column]="bar.startDay + 2 + ' / ' + (bar.endDay + 2)"
              [attr.title]="row.label + ' · ' + row.status"
            ></div>
          } @else {
            <span class="row-start-1 col-start-2 font-mono fs-micro text-text-muted italic px-1"
              >no dates</span
            >
          }
        </div>
      } @empty {
        <p class="m-0 px-4 py-6 text-center fs-caption text-text-muted">
          No tasks with dates to plot yet.
        </p>
      }
    </div>
    <div class="flex items-center gap-4 mt-2 font-mono fs-micro uppercase text-text-muted">
      <span class="inline-flex items-center gap-1.5"
        ><span class="w-3 h-2 bg-transparent border border-border-strong"></span>Locked / Open</span
      >
      <span class="inline-flex items-center gap-1.5"
        ><span class="w-3 h-2 bg-accent border border-accent"></span>In progress</span
      >
      <span class="inline-flex items-center gap-1.5"
        ><span class="w-3 h-2 bg-ink border border-ink"></span>Completed</span
      >
      <span class="inline-flex items-center gap-1.5"
        ><span class="w-3 h-2 bg-danger border border-danger"></span>Rejected</span
      >
      <span class="inline-flex items-center gap-1.5"
        ><span class="h-3 border-l border-dashed border-accent"></span>Today</span
      >
    </div>
  `,
})
export class TasksGanttViewComponent {
  readonly stages = input<ProjectStage[]>([]);
  /** Tasks outside any stage (FreeStyle projects / unstaged). */
  readonly tasks = input<ProjectTask[]>([]);

  /** [minDay, dayCount] for the axis, derived from every date on stages+tasks. */
  private readonly range = computed<{ min: number; days: number }>(() => {
    const days: number[] = [];
    const push = (iso: string | null | undefined) => {
      if (iso) days.push(day(iso));
    };
    for (const stage of this.stages()) {
      push(stageStart(stage));
      push(stageEnd(stage));
      for (const t of stage.tasks ?? []) {
        push(taskStart(t));
        push(taskEnd(t));
      }
    }
    for (const t of this.tasks()) {
      push(taskStart(t));
      push(taskEnd(t));
    }
    const today = Math.floor(Date.now() / DAY_MS);
    if (days.length === 0) return { min: today - 7, days: 28 };
    let min = Math.min(...days, today) - 2;
    let max = Math.max(...days, today) + 3;
    if (max - min > MAX_DAYS) {
      min = Math.max(min, today - 30);
      max = Math.min(max, min + MAX_DAYS);
    }
    return { min, days: max - min };
  });

  readonly dayCount = computed(() => this.range().days);
  readonly gridColumns = computed(() => `220px repeat(${this.dayCount()}, minmax(20px, 1fr))`);

  readonly todayDay = computed<number | null>(() => {
    const today = Math.floor(Date.now() / DAY_MS) - this.range().min;
    return today >= 0 && today < this.dayCount() ? today : null;
  });

  readonly ticks = computed<{ day: number; label: string }[]>(() => {
    const { min, days } = this.range();
    const step = Math.max(1, Math.ceil(days / 10));
    const result: { day: number; label: string }[] = [];
    for (let d = 0; d < days; d += step) {
      const date = new Date((min + d) * DAY_MS);
      result.push({
        day: d,
        label: date.toLocaleDateString(undefined, { month: 'short', day: 'numeric' }),
      });
    }
    return result;
  });

  readonly rows = computed<GanttRow[]>(() => {
    const { min, days } = this.range();
    const clamp = (d: number) => Math.max(0, Math.min(days, d));

    const taskBar = (t: ProjectTask): GanttBar | null => {
      const s = taskStart(t);
      const e = taskEnd(t);
      let start = s ? day(s) : null;
      let end = e ? day(e) : null;
      if (start === null && end === null) return null;
      if (start === null) start = end! - 3;
      if (end === null) end = start + 3;
      if (end < start) [start, end] = [end, start];
      return {
        startDay: clamp(start - min),
        endDay: clamp(end - min + 1),
        cls: statusClass(t.status),
      };
    };

    const result: GanttRow[] = [];
    for (const stage of this.stages()) {
      const bars = (stage.tasks ?? []).map(taskBar).filter((b): b is GanttBar => b !== null);
      const sStart = stageStart(stage);
      const sEnd = stageEnd(stage);
      let stageBar: GanttBar | null = null;
      if (sStart || sEnd || bars.length) {
        const starts = [
          ...bars.map((b) => b.startDay),
          ...(sStart ? [clamp(day(sStart) - min)] : []),
        ];
        const ends = [...bars.map((b) => b.endDay), ...(sEnd ? [clamp(day(sEnd) - min + 1)] : [])];
        if (starts.length && ends.length) {
          stageBar = {
            startDay: Math.min(...starts),
            endDay: Math.max(...ends),
            cls: statusClass(stage.status),
          };
        }
      }
      result.push({
        id: stage.id,
        label: stage.name,
        isStage: true,
        status: stage.status,
        bar: stageBar,
      });
      for (const t of stage.tasks ?? []) {
        result.push({ id: t.id, label: t.name, isStage: false, status: t.status, bar: taskBar(t) });
      }
    }
    const unstaged = this.tasks();
    if (unstaged.length) {
      result.push({ id: '__unstaged__', label: 'Unstaged', isStage: true, status: '', bar: null });
      for (const t of unstaged) {
        result.push({ id: t.id, label: t.name, isStage: false, status: t.status, bar: taskBar(t) });
      }
    }
    return result;
  });
}
