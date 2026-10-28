import { Directive, ElementRef, afterRenderEffect, inject, input } from '@angular/core';

/**
 * Gives the native `<input>` / `<textarea>` inside a design-system input (`pera-input`,
 * `pera-money-input`, `pera-date-input`, `pera-textarea`) an accessible name. None of them takes
 * an `id` or `aria-label`, so a `<label>` can only wrap it, which `label-has-associated-control`
 * cannot see through. Used where a visible label per row would be noise (the scope-of-work items
 * table, sow #3) and under a `pera-form-field` label (the summary, sow #5/#6).
 */
@Directive({ selector: '[appInnerInputLabel]' })
export class InnerInputLabelDirective {
  private readonly host = inject<ElementRef<HTMLElement>>(ElementRef);

  /** The accessible name for the wrapped input. */
  readonly appInnerInputLabel = input.required<string>();

  constructor() {
    afterRenderEffect(() => {
      const label = this.appInnerInputLabel();
      this.host.nativeElement.querySelector('input, textarea')?.setAttribute('aria-label', label);
    });
  }
}
