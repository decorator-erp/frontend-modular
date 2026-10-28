import { ChangeDetectionStrategy, Component, inject, signal } from '@angular/core';
import { FormBuilder, ReactiveFormsModule, Validators } from '@angular/forms';
import { catchError, of } from 'rxjs';
import { CrmLeadService } from '../../../data/crm-lead.service';
import { ErrorHandlerService, friendly } from '@platform/http/error-handler.service';
import { CatalogService } from '@platform/i18n/catalog.service';
import type { CatalogKey } from '@platform/i18n/catalog/en';
import { LeadSource } from '../../../model/crm-enums';
import { ToastService } from '@platform/feedback/toast.service';
import { ParsedApiError } from '@platform/types';
import { EmployeeService } from '@modules/people';
import { PeraValidators, ServerErrorsDirective, firstErrorMessage } from '@shared/forms';
import {
  PeraFormFieldComponent,
  PeraFormModalComponent,
  PeraInputComponent,
  PeraModalRef,
  PeraSelectComponent,
  PeraTextareaComponent,
  SelectOption,
} from '@ds';

const SOURCE_KEYS: Record<LeadSource, CatalogKey> = {
  [LeadSource.Website]: 'lead.sourceWebsite',
  [LeadSource.Referral]: 'lead.sourceReferral',
  [LeadSource.SocialMedia]: 'lead.sourceSocialMedia',
  [LeadSource.Phone]: 'lead.sourcePhone',
  [LeadSource.Event]: 'lead.sourceEvent',
  [LeadSource.Other]: 'common.other',
};

/** Create-lead domain codes that belong to one control (009b #3, `Errors.cs:57,84`). */
const CREATE_FIELD_MAP: Record<string, 'ownerId' | 'firstName'> = {
  'crm.leads.OwnerNotFound': 'ownerId',
  'crm.leads.NameRequired': 'firstName',
};

/** New lead (T040, FR-021). A slim intake — the lead is qualified/converted elsewhere. */
@Component({
  selector: 'app-crm-lead-form',
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [
    ReactiveFormsModule,
    ServerErrorsDirective,
    PeraFormModalComponent,
    PeraFormFieldComponent,
    PeraInputComponent,
    PeraTextareaComponent,
    PeraSelectComponent,
  ],
  template: `
    <pera-form-modal
      eyebrow="POST /api/crm/leads"
      [title]="catalog.t('nav.lead')"
      [subtitle]="catalog.t('lead.sub')"
      permission="crm.leads.create"
      [submitLabel]="catalog.t('common.saveLead')"
      [submittingLabel]="catalog.t('common.saving')"
      [submitting]="submitting()"
      [errorMessage]="serverError()?.generalMessage ?? null"
      [errorCode]="serverError()?.code ?? null"
      (submitted)="submit()"
      (cancelled)="close()"
    >
      <div
        [formGroup]="form"
        [serverErrors]="serverError()"
        class="grid grid-cols-2 gap-x-4 gap-y-4"
      >
        <pera-form-field
          [label]="catalog.t('brief.fFirst')"
          [required]="true"
          [error]="errorOf('firstName')"
        >
          <pera-input formControlName="firstName" [error]="errorOf('firstName')" />
        </pera-form-field>
        <pera-form-field
          [label]="catalog.t('brief.fLast')"
          [required]="true"
          [error]="errorOf('lastName')"
        >
          <pera-input formControlName="lastName" [error]="errorOf('lastName')" />
        </pera-form-field>

        <pera-form-field [label]="catalog.t('brief.fPhone')" [error]="errorOf('phone')">
          <pera-input formControlName="phone" [error]="errorOf('phone')" dir="ltr" />
        </pera-form-field>
        <pera-form-field [label]="catalog.t('brief.fEmail')" [error]="errorOf('email')">
          <pera-input type="email" formControlName="email" [error]="errorOf('email')" dir="ltr" />
        </pera-form-field>

        <pera-form-field
          [label]="catalog.t('brief.fSource')"
          [required]="true"
          [error]="errorOf('source')"
        >
          <pera-select
            formControlName="source"
            [options]="sourceOptions"
            [error]="errorOf('source')"
          />
        </pera-form-field>
        <pera-form-field
          [label]="catalog.t('brief.fOwner')"
          [required]="true"
          [error]="errorOf('ownerId')"
        >
          <pera-select
            formControlName="ownerId"
            [options]="ownerOptions()"
            [placeholder]="catalog.t('lead.selectOwner')"
            [error]="errorOf('ownerId')"
          />
        </pera-form-field>

        <pera-form-field class="col-span-2" [label]="catalog.t('brief.fNotes')">
          <pera-textarea formControlName="notes" [rows]="3" />
        </pera-form-field>
      </div>
    </pera-form-modal>
  `,
})
export class CrmLeadFormComponent {
  private readonly fb = inject(FormBuilder);
  private readonly leads = inject(CrmLeadService);
  private readonly directory = inject(EmployeeService);
  private readonly errorHandler = inject(ErrorHandlerService);
  private readonly toast = inject(ToastService);
  private readonly modalRef = inject(PeraModalRef) as PeraModalRef<boolean>;
  protected readonly catalog = inject(CatalogService);

  protected readonly sourceOptions: SelectOption[] = (
    [
      LeadSource.Website,
      LeadSource.Referral,
      LeadSource.SocialMedia,
      LeadSource.Phone,
      LeadSource.Event,
      LeadSource.Other,
    ] as const
  ).map((value) => ({ value: String(value), label: this.catalog.t(SOURCE_KEYS[value]) }));

  protected readonly ownerOptions = signal<SelectOption[]>([]);

  readonly form = this.fb.nonNullable.group({
    firstName: ['', [Validators.required, Validators.maxLength(100)]],
    lastName: ['', [Validators.required, Validators.maxLength(100)]],
    phone: ['', [PeraValidators.phone]],
    email: ['', [PeraValidators.email]],
    source: [String(LeadSource.Website), [Validators.required]],
    ownerId: [null as string | null, [Validators.required]],
    notes: ['', [Validators.maxLength(2000)]],
  });

  readonly serverError = signal<ParsedApiError | null>(null);
  readonly submitting = signal(false);

  constructor() {
    this.directory
      .listPaged({ page: 1, pageSize: 500, isActive: true })
      .pipe(catchError(() => of(null)))
      .subscribe((paged) =>
        this.ownerOptions.set(
          (paged?.items ?? []).map((e) => ({ value: e.id, label: e.fullName })),
        ),
      );
  }

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
    const v = this.form.getRawValue();

    this.leads
      .create({
        firstName: v.firstName.trim(),
        lastName: v.lastName.trim(),
        source: Number(v.source) as LeadSource,
        email: v.email.trim() || null,
        phone: v.phone.trim() || null,
        notes: v.notes.trim() || null,
        ownerId: v.ownerId ?? '',
      })
      .subscribe({
        next: () => {
          this.toast.show({ tone: 'success', message: this.catalog.t('lead.saved') });
          this.modalRef.close(true);
        },
        error: (err) => {
          const parsed = this.errorHandler.parse(err);
          const message = friendly(parsed);
          this.serverError.set({ ...parsed, generalMessage: message });
          const field = parsed.code ? CREATE_FIELD_MAP[parsed.code] : undefined;
          if (field) {
            // `server`, not `serverError`: the [serverErrors] directive clears only its own key.
            const control = this.form.controls[field];
            control.setErrors({ ...(control.errors ?? {}), server: message });
            control.markAsTouched();
          }
          this.submitting.set(false);
        },
      });
  }
}
