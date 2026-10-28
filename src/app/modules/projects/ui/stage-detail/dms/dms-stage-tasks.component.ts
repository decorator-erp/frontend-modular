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
import { LocaleService } from '@platform/i18n';
import { ProjectTask } from '../../../model/project.model';
import { formatShortDate } from '@shared/ui/status';
import { av, PNL, PNL_H, PNL_H_C, PNL_H_T, PRI, priDot } from './dms-stage-chrome';
import { DmsStageStatusPillComponent } from './dms-stage-status-pill.component';

type TaskFilter = 'all' | 'Open' | 'InProgress' | 'PendingApproval' | 'Completed' | 'Rejected';
type StageTaskView = 'list' | 'gantt';

const TABS: { id: TaskFilter; label: string }[] = [
  { id: 'all', label: 'All' },
  { id: 'Open', label: 'Open' },
  { id: 'InProgress', label: 'In progress' },
  { id: 'PendingApproval', label: 'Pending' },
  { id: 'Completed', label: 'Completed' },
  { id: 'Rejected', label: 'Rejected' },
];

/** Status → gantt bar class + fill (progress) percent. */
const BAR_CLS: Record<string, string> = {
  Completed: 'gb-done',
  InProgress: 'gb-prog',
  PendingApproval: 'gb-pend',
  Rejected: 'gb-rej',
  Open: 'gb-open',
  Locked: 'gb-open',
};
const BAR_FILL: Record<string, number> = {
  Completed: 100,
  InProgress: 50,
  PendingApproval: 85,
  Rejected: 45,
  Open: 0,
  Locked: 0,
};
const DAY = 86_400_000;

interface GanttRow {
  code: string;
  title: string;
  hasBar: boolean;
  leftPct: string;
  widthPct: string;
  endPct: string;
  fillPct: string;
  barCls: string;
  due: string;
  over: boolean;
}

/**
 * Stage tasks panel — the `.pnl` "Tasks" block from the DMS Stage Detail design.
 * Status filter tabs (controlled by the page so the progress stat-grid can drive
 * it too) over a **List ⇄ Gantt** toggle. List = column header + one row per task;
 * Gantt = a `.gt-*` timeline whose bars span each task's planned start→due, fill
 * shows status progress, dashed line = today. Rows/bars link nowhere in gantt;
 * list rows link to the DMS task page. Styling extends the parent `.dms-stage`.
 *
 * Backend gap: the gantt needs per-task planned start + due. Tasks carry
 * `estimatedStartDate`/`dueDate`; bars render from whatever exists and a caption
 * flags any task missing a range rather than fabricating one.
 */
@Component({
  selector: 'app-dms-stage-tasks',
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [RouterLink, DmsStageStatusPillComponent],
  styles: [
    `
      /* Batch 4b: component-scoped (emulated encapsulation), zero raw pixels.
         The Gantt is genuine geometry, so it stays CSS — expressed in rem and in
         the --st-* status tokens published in Batch 0. */
      :host {
        display: block;
      }

      .thd,
      .trow {
        display: grid;
        grid-template-columns: minmax(0, 1fr) 9rem 10.5rem 6rem 3.5rem 5.5rem;
        gap: 0.75rem;
      }

      .gt-body {
        position: relative;
        min-width: 40rem;
      }
      .gt-axis,
      .gt-row {
        display: grid;
        grid-template-columns: 12rem minmax(0, 1fr);
      }
      .gt-scale {
        position: relative;
        height: 2rem;
      }
      .gt-scale .tk {
        position: absolute;
        top: 0;
        bottom: 0;
        border-left: var(--hairline) solid var(--border-soft);
        padding: 0.5rem 0 0 0.4rem;
        font-size: var(--fs-micro);
        color: var(--color-text-muted);
        font-variant-numeric: tabular-nums;
        white-space: nowrap;
      }
      .gt-track {
        position: relative;
        height: 2.5rem;
        background: repeating-linear-gradient(
          to right,
          transparent,
          transparent calc(16.6667% - var(--hairline)),
          var(--border-soft) calc(16.6667% - var(--hairline)),
          var(--border-soft) 16.6667%
        );
      }
      .gt-bar {
        position: absolute;
        top: 50%;
        transform: translateY(-50%);
        height: 1rem;
        border: var(--hairline) solid var(--bar-bd);
        background: var(--bar-bg);
        overflow: hidden;
      }
      .gt-bar .fill {
        position: absolute;
        inset: 0 auto 0 0;
        background: var(--bar-fill);
      }
      .gt-end {
        position: absolute;
        top: 50%;
        transform: translateY(-50%);
        font-size: var(--fs-micro);
        color: var(--color-text-muted);
        padding-left: 0.45rem;
        font-variant-numeric: tabular-nums;
        white-space: nowrap;
      }
      .gt-end.over {
        color: var(--danger-500);
        font-weight: 600;
      }

      /* Status ramps come from the Batch 0 --st-* triplets. */
      .gb-done {
        --bar-bg: var(--st-complete-bg);
        --bar-bd: var(--st-complete-bd);
        --bar-fill: var(--st-complete);
      }
      .gb-prog {
        --bar-bg: var(--st-inprog-bg);
        --bar-bd: var(--st-inprog-bd);
        --bar-fill: var(--st-inprog);
      }
      .gb-pend {
        --bar-bg: var(--st-pending-bg);
        --bar-bd: var(--st-pending-bd);
        --bar-fill: var(--st-pending);
      }
      .gb-rej {
        --bar-bg: var(--st-cancel-bg);
        --bar-bd: var(--st-cancel-bd);
        --bar-fill: var(--st-cancel);
      }
      .gb-open {
        --bar-bg: var(--st-draft-bg);
        --bar-bd: var(--st-draft-bd);
        --bar-fill: var(--st-draft);
      }

      .gt-today {
        position: absolute;
        top: 2rem;
        bottom: 0;
        width: 0;
        border-left: var(--hairline) dashed var(--danger-500);
        z-index: 3;
        pointer-events: none;
      }
      .gt-today .tl {
        position: absolute;
        top: -1rem;
        left: -1.2rem;
        font-size: var(--fs-micro);
        font-weight: 700;
        letter-spacing: 0.04em;
        text-transform: uppercase;
        color: var(--danger-500);
        background: var(--surface);
        padding: 0.05rem 0.3rem;
        border: var(--hairline) solid var(--st-cancel-bd);
      }
      .gt-foot .sw {
        width: 0.7rem;
        height: 0.7rem;
        border: var(--hairline) solid;
      }
    `,
  ],
  template: `
    <div [class]="PNL">
      <div [class]="PNL_H">
        <div [class]="PNL_H_T">
          Tasks <span [class]="PNL_H_C">{{ filterCount() }}</span>
        </div>
        <div class="flex border border-border">
          <button type="button" [class]="vtClass(view() === 'list')" (click)="view.set('list')">
            <span class="flex"
              ><svg
                width="12"
                height="12"
                viewBox="0 0 24 24"
                fill="none"
                stroke="currentColor"
                stroke-width="1.8"
              >
                <path d="M8 6h13M8 12h13M8 18h13M3 6h.01M3 12h.01M3 18h.01" /></svg></span
            >List
          </button>
          <button type="button" [class]="vtClass(view() === 'gantt')" (click)="view.set('gantt')">
            <span class="flex"
              ><svg
                width="12"
                height="12"
                viewBox="0 0 24 24"
                fill="none"
                stroke="currentColor"
                stroke-width="1.8"
              >
                <path d="M4 6h9M4 12h14M4 18h6" /></svg></span
            >Gantt
          </button>
        </div>
      </div>

      <div class="flex gap-1 px-4 py-2.5 border-b border-border-soft flex-wrap">
        @for (tab of tabs; track tab.id) {
          <button
            type="button"
            [class]="ttabClass(filter() === tab.id)"
            (click)="filterChange.emit(tab.id)"
          >
            {{ tab.label }}
            <span class="tabular-nums opacity-70">{{
              tab.id === 'all' ? total() : count(tab.id)
            }}</span>
          </button>
        }
      </div>

      @if (view() === 'list') {
        <div
          class="thd px-4 py-2 border-b border-border-soft fs-micro font-semibold uppercase tracking-[0.05em] text-text-muted"
        >
          <span>Task</span><span>Status</span><span>Assignee</span><span>Priority</span
          ><span class="r">Pts</span><span class="r">Due</span>
        </div>

        @for (t of visible(); track t.id; let i = $index) {
          <a
            class="trow items-center px-4 py-3 border-b border-border-soft last:border-b-0 fs-caption cursor-pointer no-underline text-inherit transition-colors hover:bg-hover"
            [routerLink]="['/projects', t.projectId, 'tasks', t.id]"
          >
            <span class="min-w-0">
              <div class="font-medium text-text-primary truncate">{{ t.name }}</div>
              <div class="mt-px flex items-center gap-1.5 fs-label text-text-muted">
                <span>TASK · {{ t.order }}</span>
              </div>
            </span>
            <span><app-dms-stage-status-pill [status]="t.status" /></span>
            <span class="flex items-center gap-2 fs-label min-w-0">
              @if (assigneeName(t.assignedToId); as nm) {
                <span [class]="i % 2 === 1 ? AV20_ALT : AV20">{{ initials(nm) }}</span
                ><span class="truncate">{{ nm }}</span>
              } @else {
                <span class="truncate text-text-muted">Unassigned</span>
              }
            </span>
            <span
              ><span [class]="PRI"
                ><span [class]="priDot(t.priority)"></span>{{ t.priority }}</span
              ></span
            >
            <span class="text-end tabular-nums text-text-secondary">{{ t.weight }}</span>
            <span
              class="text-end fs-label tabular-nums"
              [class.text-danger]="isOverdue(t)"
              [class.font-medium]="isOverdue(t)"
              [class.text-text-muted]="!isOverdue(t)"
              >{{ t.dueDate ? shortDate(t.dueDate, locale.locale()) : '—' }}</span
            >
          </a>
        } @empty {
          <p class="m-0 px-4 py-6 fs-caption text-text-muted text-center">
            No tasks match this filter.
          </p>
        }
      } @else {
        @if (gantt().hasDates) {
          <div class="overflow-x-auto">
            <div class="gt-body">
              <div class="gt-axis border-b border-border-soft bg-surface-muted">
                <div
                  class="px-4 py-2 fs-micro font-semibold uppercase tracking-[0.05em] text-text-muted border-e border-border-soft"
                >
                  Task
                </div>
                <div class="gt-scale">
                  @for (tk of gantt().ticks; track $index) {
                    <span class="tk" [style.left]="tk.left">{{ tk.label }}</span>
                  }
                </div>
              </div>
              @for (g of gantt().rows; track g.code) {
                <div
                  class="gt-row border-b border-border-soft last:border-b-0 transition-colors hover:bg-hover"
                >
                  <div class="px-4 py-2.5 border-e border-border-soft min-w-0">
                    <div class="fs-label text-text-muted tabular-nums">{{ g.code }}</div>
                    <div class="mt-px fs-label font-medium truncate">{{ g.title }}</div>
                  </div>
                  <div class="gt-track">
                    @if (g.hasBar) {
                      <div
                        class="gt-bar {{ g.barCls }}"
                        [style.left]="g.leftPct"
                        [style.width]="g.widthPct"
                      >
                        <div class="fill" [style.width]="g.fillPct"></div>
                      </div>
                      <span class="gt-end" [class.over]="g.over" [style.left]="g.endPct">{{
                        g.due
                      }}</span>
                    } @else {
                      <span class="gt-end" style="left: 0.6rem">No planned dates</span>
                    }
                  </div>
                </div>
              } @empty {
                <div class="px-4 py-6 text-center fs-caption text-text-muted">
                  No tasks match this filter.
                </div>
              }
              @if (gantt().todayFrac) {
                <div
                  class="gt-today"
                  [style.left]="'calc(12rem + (100% - 12rem) * ' + gantt().todayFrac + ')'"
                >
                  <span class="tl">Today</span>
                </div>
              }
            </div>
          </div>
          <div
            class="gt-foot flex gap-4 px-4 py-2.5 border-t border-border-soft fs-label text-text-muted flex-wrap"
          >
            <span class="flex items-center gap-1.5"
              ><span
                class="sw shrink-0"
                style="background: var(--st-complete); border-color: var(--st-complete-bd)"
              ></span
              >Completed</span
            >
            <span class="flex items-center gap-1.5"
              ><span
                class="sw shrink-0"
                style="background: var(--st-inprog); border-color: var(--st-inprog-bd)"
              ></span
              >In progress</span
            >
            <span class="flex items-center gap-1.5"
              ><span
                class="sw shrink-0"
                style="background: var(--st-pending); border-color: var(--st-pending-bd)"
              ></span
              >Pending</span
            >
            <span class="flex items-center gap-1.5"
              ><span
                class="sw shrink-0"
                style="background: var(--st-cancel); border-color: var(--st-cancel-bd)"
              ></span
              >Rejected</span
            >
            <span class="flex items-center gap-1.5"
              ><span
                class="sw shrink-0"
                style="background: var(--st-draft); border-color: var(--st-draft-bd)"
              ></span
              >Open</span
            >
            @if (gantt().missing) {
              <span class="flex items-center gap-1.5" style="margin-left:auto;"
                >{{ gantt().missing }} missing planned dates ·
                <span class="gt-mock">MOCK · pending backend gap</span></span
              >
            } @else {
              <span class="flex items-center gap-1.5" style="margin-left:auto;"
                >Fill shows progress · dashed line = today</span
              >
            }
          </div>
        } @else {
          <div class="gt-empty">
            No planned dates on these tasks yet — add start &amp; due dates to chart them.
            <span class="gt-mock">MOCK · pending backend gap</span>
          </div>
        }
      }
    </div>
  `,
})
export class DmsStageTasksComponent {
  protected readonly PNL = PNL;
  protected readonly PNL_H = PNL_H;
  protected readonly PNL_H_T = PNL_H_T;
  protected readonly PNL_H_C = PNL_H_C;
  protected readonly PRI = PRI;
  protected readonly AV20 = av(20);
  protected readonly AV20_ALT = av(20, true);
  protected readonly priDot = priDot;

  protected vtClass(active: boolean): string {
    const base =
      'inline-flex items-center gap-1.5 px-2.5 py-1 fs-label cursor-pointer border-e border-border last:border-e-0 appearance-none font-[inherit] transition-colors';
    return active
      ? `${base} bg-text-primary text-bg`
      : `${base} bg-surface text-text-secondary hover:bg-hover hover:text-text-primary`;
  }

  protected ttabClass(active: boolean): string {
    const base =
      'fs-label px-2.5 py-1 border cursor-pointer inline-flex items-center gap-1.5 appearance-none font-[inherit] transition-colors';
    return active
      ? `${base} bg-text-primary text-bg border-text-primary`
      : `${base} bg-surface text-text-secondary border-border hover:bg-hover`;
  }

  readonly tasks = input.required<ProjectTask[]>();
  readonly filter = input<TaskFilter>('all');
  readonly assigneeNames = input<Map<string, string>>(new Map());
  readonly filterChange = output<TaskFilter>();

  readonly locale = inject(LocaleService);
  protected readonly tabs = TABS;
  protected readonly shortDate = formatShortDate;
  readonly view = signal<StageTaskView>('list');

  protected readonly total = computed(() => this.tasks().length);
  protected readonly visible = computed(() => {
    const f = this.filter();
    return f === 'all' ? this.tasks() : this.tasks().filter((t) => t.status === f);
  });
  protected readonly filterCount = computed(() =>
    this.filter() === 'all' ? `${this.total()} tasks` : `${this.visible().length} shown`,
  );

  /** Gantt model derived from each task's planned start (estimatedStartDate) → due. */
  protected readonly gantt = computed(() => {
    const ms = (d: string | null | undefined): number | null => {
      if (!d) return null;
      const t = Date.parse(d);
      return Number.isNaN(t) ? null : t;
    };
    const rows = this.visible().map((t) => {
      const s = ms(t.estimatedStartDate);
      const e = ms(t.dueDate);
      return { t, start: s ?? e, end: e ?? s };
    });
    const points = rows.flatMap((r) => [r.start, r.end]).filter((v): v is number => v != null);
    const hasDates = points.length > 0;
    const min = hasDates ? Math.min(...points) : 0;
    const max = hasDates ? Math.max(...points) : 0;
    const span = Math.max(max - min, DAY);
    const pct = (v: number): number => ((v - min) / span) * 100;

    let missing = 0;
    const out: GanttRow[] = rows.map(({ t, start, end }) => {
      const hasBar = start != null && end != null;
      if (!hasBar) missing++;
      const left = hasBar ? pct(start) : 0;
      const width = hasBar ? Math.max(pct(end) - left, 1.4) : 0;
      return {
        code: `TASK · ${t.order}`,
        title: t.name,
        hasBar,
        leftPct: `${left.toFixed(3)}%`,
        widthPct: `${width.toFixed(3)}%`,
        endPct: `${(hasBar ? pct(end) : 0).toFixed(3)}%`,
        fillPct: `${BAR_FILL[t.status] ?? 0}%`,
        barCls: BAR_CLS[t.status] ?? 'gb-open',
        due: t.dueDate ? this.shortDate(t.dueDate, this.locale.locale()) : '—',
        over: this.isOverdue(t),
      };
    });

    const N = 6;
    const ticks = hasDates
      ? Array.from({ length: N }, (_, i) => {
          const frac = i / N;
          return {
            left: `${(frac * 100).toFixed(3)}%`,
            label: this.shortDate(new Date(min + span * frac).toISOString(), this.locale.locale()),
          };
        })
      : [];

    const now = Date.now();
    const todayFrac = hasDates && now >= min && now <= max ? ((now - min) / span).toFixed(4) : null;
    return { rows: out, ticks, todayFrac, hasDates, missing };
  });

  protected count(status: TaskFilter): number {
    return this.tasks().filter((t) => t.status === status).length;
  }

  protected assigneeName(id: string | null): string | null {
    return id ? (this.assigneeNames().get(id) ?? null) : null;
  }

  protected initials(name: string): string {
    const parts = name.trim().split(/\s+/);
    const a = parts[0]?.[0] ?? '';
    const b = parts.length > 1 ? parts[parts.length - 1][0] : '';
    return (a + b).toUpperCase() || '?';
  }

  protected isOverdue(t: ProjectTask): boolean {
    if (!t.dueDate || t.status === 'Completed') return false;
    const ms = Date.parse(t.dueDate);
    return !Number.isNaN(ms) && ms < Date.now();
  }
}
