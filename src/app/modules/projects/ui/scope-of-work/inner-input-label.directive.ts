import { Directive, ElementRef, afterRenderEffect, inject, input } from '@angular/core';

/**
 * Gives the native `<input>` inside a design-system input (`pera-input`, `pera-money-input`) an
 * accessible name. Neither component takes an `id` or `aria-label`, so a `<label>` can only wrap
 * it, which `label-has-associated-control` cannot see through. Used where a visible label per
 * row would be noise (the scope-of-work items table, sow #3).
 */
@Directive({ selector: '[appInnerInputLabel]' })
export class InnerInputLabelDirective {
  private readonly host = inject<ElementRef<HTMLElement>>(ElementRef);

  /** The accessible name for the wrapped input. */
  readonly appInnerInputLabel = input.required<string>();

  constructor() {
    afterRenderEffect(() => {
      const label = this.appInnerInputLabel();
      this.host.nativeElement.querySelector('input')?.setAttribute('aria-label', label);
    });
  }
}
