import { ChangeDetectionStrategy, Component, computed, input } from '@angular/core';

export type TrendDirection = 'up' | 'down' | 'neutral';

const GLYPHS: Record<TrendDirection, string> = {
  up: '▲',
  down: '▼',
  neutral: '–',
};

const TONE_CLASSES: Record<TrendDirection, string> = {
  up: 'text-success',
  down: 'text-danger',
  neutral: 'text-text-muted',
};

/**
 * `pera-trend-arrow` — a directional delta indicator. Renders a glyph
 * (▲ up / ▼ down / – neutral) plus the formatted value. Direction is derived
 * from `value` against a symmetric `threshold`: above ⇒ up, below the negative
 * threshold ⇒ down, otherwise neutral. Neutral is a real greyscale state, not a
 * missing signal. Direction is carried by both glyph shape and colour, never
 * colour alone.
 */
@Component({
  selector: 'pera-trend-arrow',
  changeDetection: ChangeDetectionStrategy.OnPush,
  host: { class: 'inline-flex items-center' },
  template: `
    <span [class]="toneClass()" class="inline-flex items-center gap-1 text-sm font-medium">
      <span aria-hidden="true">{{ glyph() }}</span>
      <span class="tabular-nums">{{ formatted() }}</span>
    </span>
  `,
})
export class PeraTrendArrowComponent {
  readonly value = input.required<number>();
  readonly threshold = input(0);
  readonly format = input<(n: number) => string>((n) => String(n));

  protected readonly direction = computed<TrendDirection>(() => {
    const value = this.value();
    const threshold = this.threshold();
    if (value > threshold) {
      return 'up';
    }
    if (value < -threshold) {
      return 'down';
    }
    return 'neutral';
  });

  protected readonly glyph = computed(() => GLYPHS[this.direction()]);

  protected readonly toneClass = computed(() => TONE_CLASSES[this.direction()]);

  protected readonly formatted = computed(() => this.format()(this.value()));
}
