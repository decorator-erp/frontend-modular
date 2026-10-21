import { NgTemplateOutlet } from '@angular/common';
import { ChangeDetectionStrategy, Component, computed, input, output } from '@angular/core';
import { PeraTrendArrowComponent } from '../../components/trend-arrow/pera-trend-arrow.component';
import { PeraProgressBarComponent } from '../../components/progress-bar/pera-progress-bar.component';

/**
 * `pera-kpi-tile` — a single metric tile: a caption (label), the big metric
 * value and optional signals — a {@link PeraTrendArrowComponent} delta, a tiny
 * inline SVG sparkline and a {@link PeraProgressBarComponent} bar.
 *
 * Net-new; replaces the old `pera-kpi` + `pera-kpi-row` pair. It reuses the
 * existing trend-arrow and progress-bar primitives rather than reimplementing
 * them.
 *
 * When `drillTo` is set the whole tile becomes a real `<button>` — natively
 * keyboard operable (Enter/Space) with a 2px brand focus ring — and emits
 * `drill` (carrying `drillTo`) on activation. Otherwise the tile is a plain,
 * non-interactive container.
 *
 * ```html
 * <pera-kpi-tile
 *   caption="Revenue"
 *   value="1.2M"
 *   [trend]="4.3"
 *   [sparkline]="[3, 5, 4, 8, 6, 9]"
 *   [progress]="72"
 *   [drillTo]="{ route: '/revenue' }"
 *   (drill)="open($event)"
 * />
 * ```
 */
@Component({
  selector: 'pera-kpi-tile',
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [NgTemplateOutlet, PeraTrendArrowComponent, PeraProgressBarComponent],
  host: { class: 'block' },
  template: `
    @if (drillTo() !== undefined) {
      <button
        type="button"
        class="w-full text-start bg-surface border border-border rounded-card p-4 flex flex-col gap-1
               outline-none focus-visible:outline-2 focus-visible:outline-accent focus-visible:outline-offset-2"
        (click)="drill.emit(drillTo())"
      >
        <ng-container [ngTemplateOutlet]="content" />
      </button>
    } @else {
      <div class="bg-surface border border-border rounded-card p-4 flex flex-col gap-1">
        <ng-container [ngTemplateOutlet]="content" />
      </div>
    }

    <ng-template #content>
      <!-- The label tier: UPPERCASE is applied here, so every caller writes its
           caption in Sentence case (FR-008 / SC-006). Matches the prototype's
           .kt .k / .ki .k rules. -->
      <span class="uppercase tracking-wide text-text-muted" [style.fontSize]="'var(--fs-label)'">{{
        caption()
      }}</span>
      <span class="text-2xl font-semibold text-text-primary tabular-nums">
        {{ value() }}
        @if (frac()) {
          <span class="font-mono text-xs font-normal text-text-muted ms-1.5">{{ frac() }}</span>
        }
      </span>

      @if (trend() !== undefined) {
        <pera-trend-arrow [value]="trend()!" />
      }

      @if (sparkline()?.length) {
        <svg viewBox="0 0 100 24" preserveAspectRatio="none" class="w-full h-6" aria-hidden="true">
          <polyline
            [attr.points]="sparkPoints()"
            fill="none"
            stroke-width="2"
            stroke-linecap="round"
            stroke-linejoin="round"
            class="stroke-current text-accent"
          />
        </svg>
      }

      @if (progress() !== undefined) {
        <pera-progress-bar [value]="progress()!" [tone]="progressMuted() ? 'muted' : 'accent'" />
      }

      @if (message()) {
        <span class="fs-caption text-text-secondary leading-snug">{{ message() }}</span>
      }
    </ng-template>
  `,
})
export class PeraKpiTileComponent {
  /** The metric label. */
  readonly caption = input.required<string>();
  /** The big metric value shown beneath the caption. */
  readonly value = input.required<string | number>();
  /** When provided, renders a `pera-trend-arrow` with this delta. */
  readonly trend = input<number | undefined>(undefined);
  /** When non-empty, renders a tiny inline SVG sparkline. */
  readonly sparkline = input<number[] | undefined>(undefined);
  /** When provided (0..100), renders a `pera-progress-bar`. */
  readonly progress = input<number | undefined>(undefined);
  /** When set, the whole tile becomes a clickable/keyboard button that emits `drill`. */
  readonly drillTo = input<unknown>(undefined);
  /** Dims the progress bar to muted — e.g. an over-cap actual figure. */
  readonly progressMuted = input(false);
  /** A small mono suffix rendered beside the value, e.g. "3 over". */
  readonly frac = input<string | null>(null);
  /** An optional muted caption line beneath the value/trend/sparkline/progress block. */
  readonly message = input<string | null>(null);

  /** Emitted with `drillTo` when a drillable tile is activated. */
  readonly drill = output<unknown>();

  /**
   * Sparkline points normalised to the `0 0 100 24` viewBox: x spreads evenly
   * across the width, y inverts the value (top = high) within its own range.
   * A flat series collapses to the vertical midpoint.
   */
  protected readonly sparkPoints = computed(() => {
    const data = this.sparkline();
    if (!data || data.length === 0) {
      return '';
    }
    const count = data.length;
    const min = Math.min(...data);
    const max = Math.max(...data);
    const span = max - min || 1;
    return data
      .map((point, index) => {
        const x = count === 1 ? 0 : (index / (count - 1)) * 100;
        const y = 24 - ((point - min) / span) * 24;
        return `${x},${y}`;
      })
      .join(' ');
  });
}
