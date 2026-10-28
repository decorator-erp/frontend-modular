import { ChangeDetectionStrategy, Component, inject, signal } from '@angular/core';
import { FormBuilder, ReactiveFormsModule, Validators } from '@angular/forms';
import { CrmMeetingService } from '../../data/crm-meeting.service';
import { ErrorHandlerService, friendly } from '@platform/http/error-handler.service';
import { CatalogService } from '@platform/i18n/catalog.service';
import { ToastService } from '@platform/feedback/toast.service';
import { ParsedApiError } from '@platform/types';
import { ServerErrorsDirective, firstErrorMessage } from '@shared/forms';
import {
  PERA_MODAL_DATA,
  PeraFormFieldComponent,
  PeraFormModalComponent,
  PeraModalRef,
  PeraTextareaComponent,
} from '@ds';

export interface CancelMeetingDialogData {
  meetingId: string;
  /** `true` when opened from the client portal — targets the portal endpoint instead. */
  asClient?: boolean;
}

/**
 * Cancel (T053) — the ONE meeting action whose reason is MANDATORY
 * (`crm.meetings.CancelReasonRequired`). Unlike reschedule, which is an offer and
 * takes none.
 */
@Component({
  selector: 'app-crm-cancel-meeting',
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [
    ReactiveFormsModule,
    ServerErrorsDirective,
    PeraFormModalComponent,
    PeraFormFieldComponent,
    PeraTextareaComponent,
  ],
  template: `
    <pera-form-modal
      [eyebrow]="
        data.asClient
          ? 'PUT /api/crm/portal/meetings/{id}/cancel'
          : 'PUT /api/crm/meetings/{id}/cancel'
      "
      [title]="catalog.t('sched.cancel')"
      permission="crm.meetings.cancel"
      [submitLabel]="catalog.t('sched.cancel')"
      [submitting]="submitting()"
      [errorMessage]="serverError()?.generalMessage ?? null"
      [errorCode]="serverError()?.code ?? null"
      (submitted)="submit()"
      (cancelled)="close()"
    >
      <div [formGroup]="form" [serverErrors]="serverError()" class="flex flex-col gap-4">
        <pera-form-field
          [label]="catalog.t('sched.cancelR')"
          [required]="true"
          [error]="errorOf('reason')"
        >
          <pera-textarea formControlName="reason" [error]="errorOf('reason')" />
        </pera-form-field>
      </div>
    </pera-form-modal>
  `,
})
export class CrmCancelMeetingComponent {
  private readonly fb = inject(FormBuilder);
  private readonly meetings = inject(CrmMeetingService);
  private readonly errorHandler = inject(ErrorHandlerService);
  private readonly toast = inject(ToastService);
  private readonly modalRef = inject(PeraModalRef) as PeraModalRef<boolean>;
  protected readonly catalog = inject(CatalogService);
  readonly data = inject(PERA_MODAL_DATA) as CancelMeetingDialogData;

  readonly form = this.fb.nonNullable.group({
    reason: ['', [Validators.required, Validators.maxLength(1000)]],
  });

  readonly serverError = signal<ParsedApiError | null>(null);
  readonly submitting = signal(false);

  errorOf(name: string): string {
    const control = this.form.get(name);
    return control && control.touched && control.errors ? firstErrorMessage(control.errors) : '';
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
    const reason = this.form.getRawValue().reason.trim();

    const call = this.data.asClient
      ? this.meetings.portalCancel(this.data.meetingId, reason)
      : this.meetings.cancel(this.data.meetingId, reason);

    call.subscribe({
      next: () => {
        this.toast.show({ tone: 'success', message: this.catalog.t('sched.cancel') });
        this.modalRef.close(true);
      },
      error: (err) => {
        const parsed = this.errorHandler.parse(err);
        this.serverError.set({ ...parsed, generalMessage: friendly(parsed) });
        this.submitting.set(false);
      },
    });
  }
}
