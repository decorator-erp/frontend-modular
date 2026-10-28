import { ChangeDetectionStrategy, Component, computed, input, output } from '@angular/core';
import { ProjectStage } from '../../model/project.model';

type SegKind = 'completed' | 'current' | 'locked' | 'rejected';

interface MgRow {
  stage: ProjectStage;
  sub: string;
  /** Primary segment position (% of track). */
  left: number;
  width: number;
  kind: SegKind;
  label: string;
  /** Whether to paint the primary segment block at all (false for a 0% active fill). */
  showBar: boolean;
  /** Whether the segment is wide enough to hold its in-bar label without clipping. */
  showLabel: boolean;
  /** Remainder outline after the active fill (current stage only). */
  future: { left: number; width: number } | null;
  /** Now-marker position (% of track), active stage only. */
  now: number | null;
}

/** Min segment width (% of track) before a fill paints / can hold its label. */
const MIN_BAR = 2;
const MIN_LABEL = 12;

/**
 * Stage timeline — a compact per-stage Gantt. Stages are laid out sequentially
 * across a shared track (one slot each, in `order`); completed stages read as
 * solid bars, the active stage fills to its progress with a now-marker, and
 * locked stages render as outlined future slots. Mirrors the DMS dashboards
 * "Stage timeline" mini-gantt. Tokens only — no chart library.
 */
@Component({
  selector: 'app-stage-timeline',
  changeDetection: ChangeDetectionStrategy.OnPush,
  host: { class: 'block' },
  template: `
    <div class="px-5 pt-3.5 pb-5">
      @for (row of rows(); track row.stage.id) {
        <button
          type="button"
          (click)="stageClick.emit(row.stage)"
          class="grid grid-cols-[var(--w-node)_1fr] gap-[var(--space-3)] items-center w-full text-start py-2 border-b border-border-soft last:border-b-0 cursor-pointer hover:bg-hover transition-colors"
          [class.bg-hover]="row.kind === 'current'"
        >
          <div class="min-w-0">
            <div
              class="fs-caption font-medium truncate"
              [class.text-accent]="row.kind === 'current'"
            >
              Stage {{ row.stage.order }} — {{ row.stage.name }}
            </div>
            <div class="font-mono fs-micro text-text-muted mt-0.5 truncate">{{ row.sub }}</div>
          </div>
          <div class="relative h-bar-row bg-surface-muted border border-border-soft">
            @if (row.future) {
              <div
                class="absolute top-px bottom-px bg-surface border border-text-primary opacity-55"
                [style.left.%]="row.future.left"
                [style.width.%]="row.future.width"
              ></div>
            }
            @if (row.showBar) {
              <div
                class="absolute top-px bottom-px flex items-center px-1.5 overflow-hidden"
                [class.bg-text-primary]="row.kind === 'completed'"
                [class.bg-accent]="row.kind === 'current'"
                [class.bg-danger]="row.kind === 'rejected'"
                [class.bg-surface]="row.kind === 'locked'"
                [class.border]="row.kind === 'locked'"
                [class.border-border-strong]="row.kind === 'locked'"
                [style.left.%]="row.left"
                [style.width.%]="row.width"
              >
                @if (row.showLabel) {
                  <span
                    class="font-mono fs-micro whitespace-nowrap leading-none"
                    [class.text-bg]="row.kind !== 'locked'"
                    [class.text-text-muted]="row.kind === 'locked'"
                    >{{ row.label }}</span
                  >
                }
              </div>
            }
            @if (row.now !== null) {
              <div class="absolute -top-1 -bottom-1 w-px bg-accent" [style.left.%]="row.now">
                <span
                  class="absolute -top-1 -left-1 w-icon-2xs h-icon-2xs rounded-full bg-accent"
                ></span>
              </div>
            }
          </div>
        </button>
      }
      @if (axis().length > 1) {
        <div
          class="grid pt-2.5 ps-[calc(var(--w-node)+var(--space-3))]"
          [style.grid-template-columns]="'repeat(' + axis().length + ', minmax(0,1fr))'"
        >
          @for (m of axis(); track $index) {
            <span
              class="font-mono fs-micro text-text-muted text-center pb-1 border-s border-border-soft first:border-s-0"
              >{{ m }}</span
            >
          }
        </div>
      }
    </div>
  `,
})
export class StageTimelineComponent {
  readonly stages = input.required<ProjectStage[]>();
  readonly startDate = input<string | null>(null);
  readonly endDate = input<string | null>(null);
  readonly stageClick = output<ProjectStage>();

  protected readonly rows = computed<MgRow[]>(() => {
    const stages = [...this.stages()].sort((a, b) => a.order - b.order);
    const n = stages.length;
    if (n === 0) return [];
    const slot = 100 / n;
    return stages.map((stage, i): MgRow => {
      const left = i * slot;
      const tasks = `${stage.completedTasks}/${stage.totalTasks} tasks`;
      if (stage.status === 'Completed') {
        return {
          stage,
          sub: `Completed · ${tasks}`,
          left,
          width: slot,
          kind: 'completed',
          label: '100%',
          showBar: true,
          showLabel: slot >= MIN_LABEL,
          future: null,
          now: null,
        };
      }
      if (stage.status === 'Rejected') {
        return {
          stage,
          sub: `Rejected · ${tasks}`,
          left,
          width: slot,
          kind: 'rejected',
          label: 'Rejected',
          showBar: true,
          showLabel: slot >= MIN_LABEL,
          future: null,
          now: null,
        };
      }
      if (stage.status === 'Active') {
        const p = clampPct(stage.progressPercent);
        const fill = slot * (p / 100);
        return {
          stage,
          sub: `In progress · ${p}% · ${tasks}`,
          left,
          width: fill,
          kind: 'current',
          label: `${p}%`,
          // At ~0% there is no fill to paint — show only the now-dot over the outlined slot.
          showBar: fill >= MIN_BAR,
          showLabel: fill >= MIN_LABEL,
          future: { left: left + fill, width: slot - fill },
          now: left + fill,
        };
      }
      return {
        stage,
        sub: `Locked · ${tasks}`,
        left,
        width: slot,
        kind: 'locked',
        label: 'Locked',
        showBar: true,
        showLabel: slot >= MIN_LABEL,
        future: null,
        now: null,
      };
    });
  });

  /** Month labels across the project span; falls back to per-stage ticks. */
  protected readonly axis = computed<string[]>(() => {
    const months = monthsBetween(this.startDate(), this.endDate());
    if (months.length > 1) return months;
    return [...this.stages()].sort((a, b) => a.order - b.order).map((s) => `S${s.order}`);
  });
}

function clampPct(v: number): number {
  return Math.min(100, Math.max(0, Math.round(v)));
}

function monthsBetween(start: string | null, end: string | null): string[] {
  if (!start || !end) return [];
  const s = new Date(start),
    e = new Date(end);
  if (isNaN(s.getTime()) || isNaN(e.getTime()) || e < s) return [];
  const labels: string[] = [];
  const cur = new Date(s.getFullYear(), s.getMonth(), 1);
  while (cur <= e && labels.length < 24) {
    labels.push(cur.toLocaleDateString('en', { month: 'short' }));
    cur.setMonth(cur.getMonth() + 1);
  }
  if (labels.length <= 8) return labels;
  const step = labels.length / 8;
  return Array.from({ length: 8 }, (_, i) => labels[Math.floor(i * step)]);
}
