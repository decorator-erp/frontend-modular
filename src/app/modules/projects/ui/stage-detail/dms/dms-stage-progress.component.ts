import { ChangeDetectionStrategy, Component, computed, input, output } from '@angular/core';
import { ProjectTask, ProjectTaskStatus } from '../../../model/project.model';
import { PNL, PNL_H, PNL_H_C, PNL_H_T } from './dms-stage-chrome';

/** A task status that participates in the rollup stat grid + filter tabs. */
export type RollupStatus = 'Open' | 'InProgress' | 'PendingApproval' | 'Completed' | 'Rejected';

const STATS: { key: RollupStatus; label: string; dot: string }[] = [
  { key: 'Open', label: 'Open', dot: 'bg-text-secondary' },
  { key: 'InProgress', label: 'In progress', dot: 'bg-info' },
  { key: 'PendingApproval', label: 'Pending', dot: 'bg-pending' },
  { key: 'Completed', label: 'Completed', dot: 'bg-success' },
  { key: 'Rejected', label: 'Rejected', dot: 'bg-danger' },
];

/**
 * Stage progress rollup — the `.pnl` "Stage progress" block from the DMS Stage
 * Detail design: a weighted-by-points headline, a four-segment bar
 * (done / in progress / pending / rejected) and a five-cell status stat grid.
 * Clicking a stat emits `(filterPick)` so the page can drive the task table.
 *
 * **Batch 4b**: owns its own styling; the panel chrome comes from
 * `dms-stage-chrome`.
 */
@Component({
  selector: 'app-dms-stage-progress',
  changeDetection: ChangeDetectionStrategy.OnPush,
  template: `
    <div [class]="PNL">
      <div [class]="PNL_H">
        <div [class]="PNL_H_T">
          Stage progress <span [class]="PNL_H_C">weighted by task points</span>
        </div>
      </div>

      <div class="flex items-baseline justify-between px-4 pt-4 pb-3">
        <div class="fs-h1 font-semibold tracking-[-0.02em] tabular-nums leading-none">
          {{ progPct() }}<span class="fs-body-sm text-text-muted font-normal ms-0.5">%</span>
        </div>
        <div class="fs-label text-text-muted text-end tabular-nums">
          {{ doneWeight() }} of {{ totalWeight() }} pts complete<br />{{ total() }} tasks ·
          {{ count('Completed') }} done
        </div>
      </div>

      <div class="h-2.5 flex mx-4 border border-border bg-surface-muted overflow-hidden">
        <span class="h-full bg-success" [style.width.%]="weightPct('Completed')"></span>
        <span class="h-full bg-info" [style.width.%]="weightPct('InProgress')"></span>
        <span class="h-full bg-pending" [style.width.%]="weightPct('PendingApproval')"></span>
        <span class="h-full bg-danger" [style.width.%]="weightPct('Rejected')"></span>
      </div>

      <div class="grid grid-cols-3 sm:grid-cols-5 border-t border-border mt-3.5 bg-border gap-px">
        @for (st of stats; track st.key) {
          <button
            type="button"
            class="bg-surface px-3 py-3 cursor-pointer border-0 text-start w-full font-[inherit] transition-colors hover:bg-hover"
            [class.bg-accent-soft]="filter() === st.key"
            (click)="filterPick.emit(st.key)"
          >
            <div class="flex items-center gap-1.5 fs-label text-text-muted mb-1.5">
              <span class="w-1.5 h-1.5 rounded-full {{ st.dot }}"></span>{{ st.label }}
            </div>
            <div class="fs-h3 font-semibold tabular-nums leading-none">{{ count(st.key) }}</div>
          </button>
        }
      </div>
    </div>
  `,
})
export class DmsStageProgressComponent {
  readonly tasks = input.required<ProjectTask[]>();
  /** Active filter, for the selected-stat highlight. */
  readonly filter = input<'all' | RollupStatus>('all');
  readonly filterPick = output<RollupStatus>();

  protected readonly stats = STATS;
  protected readonly PNL = PNL;
  protected readonly PNL_H = PNL_H;
  protected readonly PNL_H_T = PNL_H_T;
  protected readonly PNL_H_C = PNL_H_C;

  protected readonly total = computed(() => this.tasks().length);
  protected readonly totalWeight = computed(() =>
    this.tasks().reduce((a, t) => a + (t.weight || 0), 0),
  );
  protected readonly doneWeight = computed(() => this.weightOf('Completed'));
  protected readonly progPct = computed(() => {
    const tw = this.totalWeight();
    return tw ? Math.round((this.doneWeight() / tw) * 100) : 0;
  });

  protected count(status: ProjectTaskStatus): number {
    return this.tasks().filter((t) => t.status === status).length;
  }

  protected weightPct(status: RollupStatus): number {
    const tw = this.totalWeight();
    return tw ? (this.weightOf(status) / tw) * 100 : 0;
  }

  private weightOf(status: RollupStatus): number {
    return this.tasks()
      .filter((t) => t.status === status)
      .reduce((a, t) => a + (t.weight || 0), 0);
  }
}
