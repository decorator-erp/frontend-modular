import { ChangeDetectionStrategy, Component, computed, input } from '@angular/core';

export type PriorityLevel = 'low' | 'medium' | 'high' | 'urgent';

/**
 * Glyph classes escalate with priority so the level reads by *shape/fill
 * weight*, not colour alone. In greyscale: low = small hollow ring, medium =
 * larger hollow ring, high = solid filled dot, urgent = solid filled dot with
 * a halo ring (the heaviest, unmistakable mark).
 */
const GLYPH_CLASSES: Record<PriorityLevel, string> = {
  low: 'h-2 w-2 border-2 border-current text-text-muted',
  medium: 'h-2.5 w-2.5 border-2 border-current text-text-secondary',
  high: 'h-2.5 w-2.5 border-2 border-current bg-current text-warning',
  urgent: 'h-2.5 w-2.5 bg-current text-danger ring-2 ring-current/40',
};

/**
 * `pera-priority-badge` — task priority indicator. An escalating glyph
 * (hollow ring → filled dot → solid dot + halo) that stays legible in
 * greyscale, with an optional capitalized level label.
 */
@Component({
  selector: 'pera-priority-badge',
  changeDetection: ChangeDetectionStrategy.OnPush,
  host: { class: 'inline-flex items-center' },
  template: `
    <span
      data-glyph
      aria-hidden="true"
      class="inline-block shrink-0 rounded-full"
      [class]="glyphClasses()"
    ></span>
    @if (label()) {
      <span class="ms-1.5 text-xs text-text-secondary">{{ text() }}</span>
    }
  `,
})
export class PeraPriorityBadgeComponent {
  readonly level = input<PriorityLevel>('low');
  readonly label = input(true);

  protected readonly glyphClasses = computed(() => GLYPH_CLASSES[this.level()]);

  protected readonly text = computed(() => {
    const level = this.level();
    return level.charAt(0).toUpperCase() + level.slice(1);
  });
}
