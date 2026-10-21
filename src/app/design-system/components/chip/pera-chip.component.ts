import { ChangeDetectionStrategy, Component, input, output } from '@angular/core';

/**
 * `.chip` — toggleable mono filter chip (10px, square). Emits `(toggled)`
 * with the next state; keep `[on]` bound to the owner's state.
 */
@Component({
  selector: 'pera-chip',
  changeDetection: ChangeDetectionStrategy.OnPush,
  host: { class: 'inline-flex' },
  template: `
    <button
      type="button"
      [attr.aria-pressed]="on()"
      (click)="toggled.emit(!on())"
      class="font-mono fs-label font-medium px-2 py-1 border transition-colors cursor-pointer
             outline-none focus-visible:outline-2 focus-visible:outline-accent"
      [class.bg-surface]="!on()"
      [class.text-text-secondary]="!on()"
      [class.border-border]="!on()"
      [class.hover:bg-hover]="!on()"
      [class.hover:text-text-primary]="!on()"
      [class.bg-accent]="on()"
      [class.text-on-accent]="on()"
      [class.border-accent]="on()"
    >
      <ng-content></ng-content>
    </button>
  `,
})
export class PeraChipComponent {
  readonly on = input(false);
  readonly toggled = output<boolean>();
}
