import { ChangeDetectionStrategy, Component, inject, signal } from '@angular/core';
import {
  AbstractControl,
  FormBuilder,
  ReactiveFormsModule,
  ValidationErrors,
} from '@angular/forms';
import { map } from 'rxjs/operators';
import { CrmPeriodService } from '../../../data/crm-period.service';
import { injectReloadOnConflict } from '@platform/http/concurrency';
import { ErrorHandlerService, friendly } from '@platform/http/error-handler.service';
import { CatalogService } from '@platform/i18n/catalog.service';
import {
  cairoLocalToUtcIso,
  formatCairoDateTime,
  utcIsoToCairoLocalInput,
} from '@platform/i18n/intl-locale';
import { ToastService } from '@platform/feedback/toast.service';
import { ParsedApiError } from '@platform/types';
import { ServerErrorsDirective, firstErrorMessage } from '@shared/forms';
import {
  PERA_MODAL_DATA,
  PeraAlertComponent,
  PeraFormFieldComponent,
  PeraFormModalComponent,
  PeraInputComponent,
  PeraModalRef,
} from '@ds';

export interface PeriodFormDialogData {
  mode: 'open' | 'extend';
  projectId: string;
  /** Required in `extend` mode. */
  periodId?: string;
  /** Required in `extend` mode — pre-fills the field with the current close date. */
  currentClosesAtUtc?: string;
}

/** Must be in the future (`crm.periods.InvalidCloseTime` mirrors this server-side). */
function futureDateTime(control: AbstractControl): ValidationErrors | null {
  const v = control.value;
  if (!v) return null;
  return new Date(cairoLocalToUtcIso(v)).getTime() > Date.now() ? null : { futureDateTime: true };
}

/**
 * Open or extend the requirement-gathering period (T042, FR-021). One form, two modes —
 * matching the backend's two endpoints (`POST .../periods`, `PUT /periods/{id}/extend`).
 * The close-date field is a Cairo wall-clock `datetime-local` input, converted to UTC at
 * the api boundary (never the visitor's own machine timezone — FR-034).
 */
@Component({
  selector: 'app-crm-period-form',
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [
    ReactiveFormsModule,
    ServerErrorsDirective,
    PeraFormModalComponent,
    PeraFormFieldComponent,
    PeraInputComponent,
    PeraAlertComponent,
  ],
  template: `
    <pera-form-modal
      [eyebrow]="
        isExtend ? 'PUT /api/crm/periods/{id}/extend' : 'POST /api/crm/projects/{id}/periods'
      "
      [title]="catalog.t(isExtend ? 'period.extend' : 'period.openPeriodBtn')"
      [subtitle]="catalog.t('period.sub')"
      permission="crm.periods.open"
      [submitLabel]="catalog.t(isExtend ? 'period.extend' : 'period.openPeriodBtn')"
      [submittingLabel]="catalog.t('common.saving')"
      [submitting]="submitting()"
      [errorMessage]="serverError()?.generalMessage ?? null"
      [errorCode]="serverError()?.code ?? null"
      (submitted)="submit()"
      (cancelled)="close()"
    >
      <div [formGroup]="form" [serverErrors]="serverError()" class="flex flex-col gap-4">
        <pera-form-field
          [label]="catalog.t('brief.fClosesAt')"
          [required]="true"
          [error]="errorOf('closesAt')"
        >
          <pera-input
            type="datetime-local"
            formControlName="closesAt"
            [error]="errorOf('closesAt')"
          />
        </pera-form-field>

        <pera-alert tone="info">{{ catalog.t('period.closeNote') }}</pera-alert>
      </div>
    </pera-form-modal>
  `,
})
export class CrmPeriodFormComponent {
  private readonly fb = inject(FormBuilder);
  private readonly periods = inject(CrmPeriodService);
  private readonly errorHandler = inject(ErrorHandlerService);
  private readonly toast = inject(ToastService);
  private readonly reloadOnConflict = injectReloadOnConflict();
  private readonly modalRef = inject(PeraModalRef) as PeraModalRef<boolean>;
  protected readonly catalog = inject(CatalogService);
  readonly data = inject(PERA_MODAL_DATA) as PeriodFormDialogData;

  readonly isExtend = this.data.mode === 'extend';

  readonly form = this.fb.nonNullable.group({
    closesAt: [
      this.data.currentClosesAtUtc ? utcIsoToCairoLocalInput(this.data.currentClosesAtUtc) : '',
      [(c: AbstractControl) => (c.value ? null : { required: true }), futureDateTime],
    ],
  });

  readonly serverError = signal<ParsedApiError | null>(null);
  readonly submitting = signal(false);

  errorOf(name: string): string {
    const control = this.form.get(name);
    if (!control || !control.touched || !control.errors) return '';
    if (control.errors['futureDateTime']) return this.catalog.t('period.closeInFuture');
    return firstErrorMessage(control.errors);
  }

  close(): void {
    this.modalRef.close(false);
  }

  submit(): void {
    if (this.form.invalid) {
      this.form.markAllAsTouched();
      return;
    }
    this.submitting.set(true);
    this.serverError.set(null);
    const closesAtUtc = cairoLocalToUtcIso(this.form.getRawValue().closesAt);

    const call = this.isExtend
      ? this.periods.extend(this.data.periodId!, closesAtUtc)
      : this.periods.open(this.data.projectId, closesAtUtc).pipe(map(() => undefined));

    call.subscribe({
      next: () => {
        const message = this.catalog.t(this.isExtend ? 'toast.periodExtended' : 'period.saved', {
          closesAt: formatCairoDateTime(closesAtUtc, this.catalog.locale()),
        });
        this.toast.show({ tone: 'success', message });
        this.modalRef.close(true);
      },
      error: (err) => {
        // 009b #26: 409 crm.periods.ConcurrentUpdate → close as done so the card reloads (X-3).
        if (this.reloadOnConflict(err, () => this.modalRef.close(true))) return;
        const parsed = this.errorHandler.parse(err);
        this.serverError.set({ ...parsed, generalMessage: friendly(parsed) });
        this.submitting.set(false);
      },
    });
  }
}
