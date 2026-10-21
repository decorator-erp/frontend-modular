import { ChangeDetectionStrategy, Component, computed, input } from '@angular/core';
import { PeraIconComponent } from '../icon/pera-icon.component';
import { PeraSpinnerComponent } from '../spinner/pera-spinner.component';

export type ButtonVariant = 'primary' | 'secondary' | 'tertiary' | 'ghost' | 'danger';
export type ButtonSize = 'xs' | 'sm' | 'md' | 'lg';

const VARIANT_CLASSES: Record<ButtonVariant, string> = {
  primary: 'bg-accent text-text-on-accent hover:bg-accent-hover',
  secondary:
    'bg-surface text-text-primary border border-border hover:bg-surface-muted hover:border-border-strong',
  tertiary: 'bg-transparent text-text-primary border border-border hover:bg-surface-muted',
  ghost: 'bg-transparent text-text-primary hover:bg-surface-muted',
  danger: 'bg-danger text-text-on-accent hover:opacity-90',
};

const SIZE_CLASSES: Record<ButtonSize, string> = {
  xs: 'h-6 px-2 text-xs gap-1',
  sm: 'h-7 px-2.5 fs-body-sm gap-1.5',
  md: 'h-8 px-3 text-sm gap-2',
  lg: 'h-10 px-4 text-sm gap-2',
};

// Square icon-only footprints: sm 28×28, md 32×32 (per design-system.md §48).
const ICON_ONLY_SIZE_CLASSES: Record<ButtonSize, string> = {
  xs: 'h-6 w-6 p-0',
  sm: 'h-7 w-7 p-0',
  md: 'h-8 w-8 p-0',
  lg: 'h-10 w-10 p-0',
};

@Component({
  selector: 'pera-button',
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [PeraIconComponent, PeraSpinnerComponent],
  host: {
    '[class]': 'hostClasses()',
  },
  template: `
    <button [type]="type()" [disabled]="disabled() || loading()" [class]="classes()">
      @if (loading()) {
        <pera-spinner size="xs" />
      } @else if (iconStart()) {
        <pera-icon [name]="iconStart()!" [size]="iconSize()" />
      }
      <ng-content />
      @if (iconEnd()) {
        <pera-icon [name]="iconEnd()!" [size]="iconSize()" />
      }
      <ng-content select="[kbd]" />
    </button>
  `,
})
export class PeraButtonComponent {
  readonly variant = input<ButtonVariant>('secondary');
  readonly size = input<ButtonSize>('md');
  readonly loading = input(false);
  readonly disabled = input(false);
  readonly block = input(false);
  readonly iconStart = input<string | undefined>(undefined);
  readonly iconEnd = input<string | undefined>(undefined);
  readonly iconOnly = input(false);
  readonly type = input<'button' | 'submit' | 'reset'>('button');

  readonly hostClasses = computed(() =>
    [
      this.block() ? 'block w-full' : 'inline-block',
      this.disabled() ? 'pointer-events-none' : '',
    ].join(' '),
  );

  readonly iconSize = computed(() => (this.size() === 'xs' ? 14 : this.size() === 'lg' ? 18 : 16));

  readonly classes = computed(() =>
    [
      'inline-flex items-center justify-center font-medium whitespace-nowrap select-none',
      'transition-colors cursor-pointer outline-none',
      'focus-visible:outline-2 focus-visible:outline-accent focus-visible:outline-offset-2',
      this.iconOnly() ? ICON_ONLY_SIZE_CLASSES[this.size()] : SIZE_CLASSES[this.size()],
      VARIANT_CLASSES[this.variant()],
      this.block() ? 'w-full' : '',
      this.disabled() ? 'opacity-45 cursor-not-allowed pointer-events-none' : '',
    ].join(' '),
  );
}
