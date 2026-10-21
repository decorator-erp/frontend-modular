import { ChangeDetectionStrategy, Component, computed, input } from '@angular/core';

export interface DonutSegment {
  label: string;
  value: number;
  /** A CSS color — pass a design token var, e.g. `var(--color-success)`. */
  color: string;
}

interface DonutArc {
  color: string;
  dashArray: string;
  dashOffset: number;
}

/**
 * `.donut` — SVG ring chart with an optional legend. Segments use the
 * stroke-dasharray technique on a unit circle (r = 15.9155, circumference ≈ 100)
 * so each segment's dash length IS its percentage; the first segment starts at
 * 12 o'clock (dashoffset 25) and the rest follow clockwise. Token-driven colors
 * only — pass `color` as a CSS var.
 *
 * Mirrors the DMS dashboards donut (Task status / Task priority).
 */
@Component({
  selector: 'pera-donut',
  changeDetection: ChangeDetectionStrategy.OnPush,
  host: { class: 'block' },
  template: `
    <div class="flex items-center gap-6">
      <div class="relative shrink-0" [style.width.px]="size()" [style.height.px]="size()">
        <svg
          viewBox="0 0 42 42"
          class="block"
          [style.width.px]="size()"
          [style.height.px]="size()"
          aria-hidden="true"
        >
          <circle
            cx="21"
            cy="21"
            r="15.9155"
            fill="transparent"
            stroke="var(--color-border-soft)"
            stroke-width="6"
          />
          @for (arc of arcs(); track $index) {
            <circle
              cx="21"
              cy="21"
              r="15.9155"
              fill="transparent"
              stroke-width="6"
              [attr.stroke]="arc.color"
              [attr.stroke-dasharray]="arc.dashArray"
              [attr.stroke-dashoffset]="arc.dashOffset"
            />
          }
        </svg>
        <div
          class="absolute inset-0 flex flex-col items-center justify-center pointer-events-none text-center"
        >
          <div
            class="font-medium leading-none text-text-primary"
            [style.font-size.px]="centerSize()"
          >
            {{ centerValue() }}
          </div>
          @if (centerLabel()) {
            <div class="font-mono fs-micro text-text-muted mt-0.5">{{ centerLabel() }}</div>
          }
        </div>
      </div>
      @if (legend()) {
        <div class="flex flex-col gap-2 min-w-0 flex-1">
          @for (seg of segments(); track seg.label) {
            <div
              class="grid grid-cols-[auto_1fr_auto] gap-2.5 items-center"
              [class.opacity-45]="seg.value === 0"
            >
              <span
                class="w-icon-2xs h-icon-2xs shrink-0"
                [class.rounded-full]="roundSwatch()"
                [style.background]="seg.color"
              ></span>
              <span class="text-xs leading-normal font-medium text-text-primary truncate">{{
                seg.label
              }}</span>
              <span class="font-mono fs-label text-text-primary tabular-nums">{{ seg.value }}</span>
            </div>
          }
        </div>
      }
    </div>
  `,
})
export class PeraDonutComponent {
  readonly segments = input.required<DonutSegment[]>();
  /** Big value rendered in the ring center. */
  readonly centerValue = input<string | number>('');
  /** Small mono caption under the center value. */
  readonly centerLabel = input<string | null>(null);
  /** Ring diameter in px. */
  readonly size = input(120);
  /** Font size (px) for the center value. */
  readonly centerSize = input(22);
  readonly legend = input(true);
  /** Round legend swatches (DMS uses round for priority, square for status). */
  readonly roundSwatch = input(false);

  protected readonly arcs = computed<DonutArc[]>(() => {
    const segs = this.segments().filter((s) => s.value > 0);
    const total = segs.reduce((a, s) => a + s.value, 0);
    if (total <= 0) return [];
    let cumulative = 0;
    return segs.map((s) => {
      const pct = (s.value / total) * 100;
      const arc: DonutArc = {
        color: s.color,
        dashArray: `${round(pct)} ${round(100 - pct)}`,
        dashOffset: round(25 - cumulative),
      };
      cumulative += pct;
      return arc;
    });
  });
}

function round(n: number): number {
  return Math.round(n * 100) / 100;
}
