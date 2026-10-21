import { ChangeDetectionStrategy, Component } from '@angular/core';

/**
 * `.t-tag` — decorative, non-interactive mono pill (10px, square). For
 * labels/codes that classify a row but carry no toggle behaviour.
 */
@Component({
  selector: 'pera-tag',
  changeDetection: ChangeDetectionStrategy.OnPush,
  host: { class: 'inline-flex' },
  template: `
    <span
      class="font-mono fs-label font-medium text-text-secondary px-2 py-0.5
             border border-border text-center"
    >
      <ng-content></ng-content>
    </span>
  `,
})
export class PeraTagComponent {}
