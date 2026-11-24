import { ChangeDetectionStrategy, Component, computed, input } from '@angular/core';

/**
 * OS-3 (Ocean Studio) — the stand-in thumbnail for a record that has no image yet (projects have no
 * cover field). The colour pair is picked from a hash of `seed`, so the same record always gets the
 * same swatch, and the label's initials sit on top. Decorative: the row beside it carries the name.
 */
const PAIRS = [
  ['var(--accent-500)', 'var(--color-accent-soft)'],
  ['var(--sand-500)', 'var(--sand-50)'],
  ['var(--success-500)', 'var(--success-50)'],
  ['var(--info-500)', 'var(--info-50)'],
  ['var(--color-pending)', 'var(--color-pending-soft)'],
  ['var(--warning-500)', 'var(--warning-50)'],
] as const;

const SIZE_CLASS = {
  sm: 'size-[var(--space-8)] fs-label rounded-[var(--radius-md)]',
  md: 'size-[var(--space-10)] fs-body-sm rounded-[var(--radius-control)]',
  lg: 'size-[var(--space-16)] fs-h3 rounded-[var(--radius-card)]',
} as const;

/** A stable, non-cryptographic string hash (djb2). */
export function swatchIndex(seed: string, buckets = PAIRS.length): number {
  let h = 5381;
  for (let i = 0; i < seed.length; i++) h = ((h << 5) + h + seed.charCodeAt(i)) | 0;
  return Math.abs(h) % buckets;
}

@Component({
  selector: 'pera-swatch',
  changeDetection: ChangeDetectionStrategy.OnPush,
  host: { class: 'inline-flex shrink-0', 'aria-hidden': 'true' },
  template: `
    <span
      data-swatch
      class="grid place-items-center font-extrabold uppercase select-none text-text-primary {{
        sizeClass()
      }}"
      [style.background]="background()"
      >{{ initials() }}</span
    >
  `,
})
export class PeraSwatchComponent {
  /** What the colour is derived from — usually the record id. */
  readonly seed = input.required<string>();
  /** The name whose initials are shown. */
  readonly label = input<string>('');
  readonly size = input<keyof typeof SIZE_CLASS>('md');

  readonly sizeClass = computed(() => SIZE_CLASS[this.size()]);
  readonly background = computed(() => {
    const [strong, soft] = PAIRS[swatchIndex(this.seed())];
    return `linear-gradient(135deg, ${soft} 0%, ${soft} 45%, color-mix(in srgb, ${strong} 55%, ${soft}) 100%)`;
  });
  readonly initials = computed(() => {
    const words = this.label().trim().split(/\s+/).filter(Boolean);
    if (!words.length) return '';
    return (words[0][0] + (words.length > 1 ? words[words.length - 1][0] : '')).toUpperCase();
  });
}
