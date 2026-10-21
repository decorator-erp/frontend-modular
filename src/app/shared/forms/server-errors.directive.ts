import { Directive, Input, effect, inject } from '@angular/core';
import { FormGroupDirective } from '@angular/forms';
import { ErrorHandlerService } from '@platform/http/error-handler.service';
import { ParsedApiError } from '@platform/types/api-error';

/**
 * Binds a backend-parsed error to a Reactive Form, surfacing `fieldErrors` on
 * the matching controls so the existing `<app-form-field>` and `firstErrorMessage`
 * pattern renders them inline.
 *
 * Usage (in a feature page):
 *
 *   <form [formGroup]="form" [serverErrors]="serverError()">
 *     <app-form-field label="Email" [error]="emailError()">
 *       <app-input formControlName="email" />
 *     </app-form-field>
 *     ...
 *   </form>
 *
 *   serverError = signal<ParsedApiError | null>(null);
 *
 *   submit() {
 *     this.api.create(this.form.value).subscribe({
 *       error: (e) => this.serverError.set(this.errorHandler.parse(e)),
 *     });
 *   }
 *
 * Re-applying the directive (signal updates) re-binds the errors. Setting the
 * input to `null` clears any previously applied server errors.
 */
@Directive({
  selector: '[serverErrors]',
  standalone: true,
})
export class ServerErrorsDirective {
  private readonly formGroupDirective = inject(FormGroupDirective);
  private readonly errorHandler = inject(ErrorHandlerService);

  private _error: ParsedApiError | null = null;

  @Input()
  set serverErrors(value: ParsedApiError | null) {
    this._error = value;
    this.apply();
  }

  constructor() {
    // Re-apply when the form is rebuilt (e.g. controls added dynamically).
    effect(() => this.apply());
  }

  private apply(): void {
    const form = this.formGroupDirective?.form;
    if (!form) return;

    // Clear previously-applied serverError keys (leave native validators alone).
    Object.values(form.controls).forEach((control) => {
      if (control.errors?.['serverError']) {
        const { serverError: _drop, ...rest } = control.errors;
        control.setErrors(Object.keys(rest).length ? rest : null);
      }
    });

    if (this._error && Object.keys(this._error.fieldErrors).length > 0) {
      this.errorHandler.applyToForm(form, this._error.fieldErrors);
    }
  }
}
