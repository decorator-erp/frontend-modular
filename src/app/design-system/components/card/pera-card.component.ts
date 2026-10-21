import { ChangeDetectionStrategy, Component, computed, input } from '@angular/core';

const PADDING = { none: '', sm: 'p-3', md: 'p-4', lg: 'p-6' } as const;

@Component({
  selector: 'pera-card',
  changeDetection: ChangeDetectionStrategy.OnPush,
  host: { '[class]': 'classes()' },
  template: `<ng-content />`,
})
export class PeraCardComponent {
  /** `none` leaves the card flush so a projected header/body/footer can manage its own spacing. */
  readonly padding = input<'none' | 'sm' | 'md' | 'lg'>('md');
  readonly interactive = input(false);
  /** Flat surfaces are square by default (`--radius-card`); opt in for soft corners. */
  readonly rounded = input(false);

  readonly classes = computed(() =>
    [
      'block bg-surface border border-border',
      this.rounded() ? 'rounded-md' : 'rounded-card',
      PADDING[this.padding()],
      this.interactive() ? 'transition-shadow hover:shadow-sm cursor-pointer' : '',
    ].join(' '),
  );
}
