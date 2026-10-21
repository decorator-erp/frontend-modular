import { ChangeDetectionStrategy, Component, input } from '@angular/core';
import { PeraKpiTileComponent } from '../kpi-tile/pera-kpi-tile.component';
import { PeraProgressBarComponent } from '../../components/progress-bar/pera-progress-bar.component';

/** A single label/value row rendered beneath the metric in a {@link PeraStatCardComponent}. */
export interface StatBreakdownRow {
  label: string;
  value: string | number;
}

/**
 * `pera-stat-card` — a {@link PeraKpiTileComponent} metric header paired with a
 * headline {@link PeraProgressBarComponent} and an optional label/value
 * breakdown list.
 *
 * Net-new; reuses the existing kpi-tile and progress-bar primitives rather than
 * reimplementing either. The kpi-tile renders its own card chrome
 * (`bg-surface border rounded-lg p-4`), so wrapping it in a second card would
 * double-nest borders — instead the host is a plain flex column: the tile
 * provides the card, and the progress bar + breakdown rows sit directly below
 * it. The tile's own `progress` input is intentionally left unset so the single
 * headline bar is not duplicated.
 *
 * ```html
 * <pera-stat-card
 *   caption="Budget used"
 *   value="68%"
 *   [trend]="4.3"
 *   [progress]="68"
 *   [breakdown]="[
 *     { label: 'Labor', value: '12,000' },
 *     { label: 'Material', value: '8,000' },
 *   ]"
 * />
 * ```
 */
@Component({
  selector: 'pera-stat-card',
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [PeraKpiTileComponent, PeraProgressBarComponent],
  host: { class: 'block' },
  template: `
    <div class="flex flex-col gap-3">
      <pera-kpi-tile [caption]="caption()" [value]="value()" [trend]="trend()" />

      <pera-progress-bar [value]="progress()" />

      @if (breakdown().length) {
        <div class="flex flex-col gap-1">
          @for (row of breakdown(); track $index) {
            <div class="flex items-center justify-between text-xs">
              <span class="text-text-muted">{{ row.label }}</span>
              <span class="text-text-primary tabular-nums">{{ row.value }}</span>
            </div>
          }
        </div>
      }
    </div>
  `,
})
export class PeraStatCardComponent {
  /** The metric label, forwarded to the kpi-tile. */
  readonly caption = input.required<string>();
  /** The big metric value, forwarded to the kpi-tile. */
  readonly value = input.required<string | number>();
  /** When provided, the kpi-tile renders a `pera-trend-arrow` with this delta. */
  readonly trend = input<number | undefined>(undefined);
  /** Headline progress for the bar beneath the metric (0..100). */
  readonly progress = input.required<number>();
  /** Small label/value rows rendered under the metric; empty ⇒ no list. */
  readonly breakdown = input<StatBreakdownRow[]>([]);
}
