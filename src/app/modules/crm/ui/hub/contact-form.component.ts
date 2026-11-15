import { ChangeDetectionStrategy, Component, inject, signal } from '@angular/core';
import { FormBuilder, ReactiveFormsModule, Validators } from '@angular/forms';
import { catchError, of } from 'rxjs';
import { CrmContactService } from '../../data/crm-contact.service';
import { ErrorHandlerService, friendly } from '@platform/http/error-handler.service';
import { CatalogService } from '@platform/i18n/catalog.service';
import type { CatalogKey } from '@platform/i18n/catalog/en';
import { ContactRole } from '../../model/crm-enums';
import { ToastService } from '@platform/feedback/toast.service';
import { ParsedApiError } from '@platform/types';
import { PeraValidators, ServerErrorsDirective, firstErrorMessage } from '@shared/forms';
import {
  PERA_MODAL_DATA,
  PeraAlertComponent,
  PeraFormFieldComponent,
  PeraFormModalComponent,
  PeraInputComponent,
  PeraModalRef,
  PeraSelectComponent,
  PeraSwitchComponent,
  SelectOption,
} from '@ds';

export interface ContactFormDialogData {
  clientId: string;
  clientName: string;
}

const ROLE_KEYS: Record<ContactRole, CatalogKey> = {
  [ContactRole.Owner]: 'brief.vOwner',
  [ContactRole.Spouse]: 'brief.vSpouse',
  [ContactRole.FamilyMember]: 'contact.roleFamilyMember',
  [ContactRole.Representative]: 'brief.vRepresentative',
  [ContactRole.Other]: 'common.other',
};

/**
 * New contact (T041, FR-021). **The one-primary rule**: the server always enforces
 * exactly one primary (`SetPrimaryContactCommand` un-marks whoever holds it), but the
 * form still warns BEFORE saving when checking "primary" would silently demote someone
 * — surfaced by promoting `client.primaryHint` to a `pera-alert` the instant the switch
 * is checked while an existing primary is known.
 */
@Component({
  selector: 'app-crm-contact-form',
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [
    ReactiveFormsModule,
    ServerErrorsDirective,
    PeraFormModalComponent,
    PeraFormFieldComponent,
    PeraInputComponent,
    PeraSelectComponent,
    PeraSwitchComponent,
    PeraAlertComponent,
  ],
  template: `
    <pera-form-modal
      eyebrow="POST /api/crm/clients/{clientId}/contacts"
      [title]="catalog.t('nav.contact')"
      [subtitle]="catalog.t('client.contactSub')"
      permission="crm.contacts.create"
      [submitLabel]="catalog.t('common.saveContact')"
      [submittingLabel]="catalog.t('common.saving')"
      [submitting]="submitting()"
      [errorMessage]="serverError()?.generalMessage ?? null"
      [errorCode]="serverError()?.code ?? null"
      (submitted)="submit()"
      (cancelled)="close()"
    >
      <div [formGroup]="form" [serverErrors]="serverError()" class="flex flex-col gap-4">
        <pera-form-field [label]="catalog.t('brief.fClient')">
          <div class="fs-body-sm text-text-primary py-1.5">{{ data.clientName }}</div>
        </pera-form-field>

        <div class="grid grid-cols-1 sm:grid-cols-2 gap-x-4 gap-y-4">
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
          <pera-form-field
            [label]="catalog.t('brief.fRole')"
            [required]="true"
            [error]="errorOf('role')"
          >
            <pera-select formControlName="role" [options]="roleOptions" [error]="errorOf('role')" />
          </pera-form-field>
        </div>

        <pera-switch formControlName="isPrimary">{{ catalog.t('brief.fIsPrimary') }}</pera-switch>

        @if (isPrimaryChecked() && existingPrimaryName()) {
          <pera-alert tone="warning">{{ catalog.t('client.primaryHint') }}</pera-alert>
        } @else {
          <p class="fs-caption text-text-muted m-0">{{ catalog.t('client.primaryHint') }}</p>
        }
      </div>
    </pera-form-modal>
  `,
})
export class CrmContactFormComponent {
  private readonly fb = inject(FormBuilder);
  private readonly contacts = inject(CrmContactService);
  private readonly errorHandler = inject(ErrorHandlerService);
  private readonly toast = inject(ToastService);
  private readonly modalRef = inject(PeraModalRef) as PeraModalRef<boolean>;
  protected readonly catalog = inject(CatalogService);
  readonly data = inject(PERA_MODAL_DATA) as ContactFormDialogData;

  protected readonly roleOptions: SelectOption[] = (
    [
      ContactRole.Owner,
      ContactRole.Spouse,
      ContactRole.FamilyMember,
      ContactRole.Representative,
      ContactRole.Other,
    ] as const
  ).map((value) => ({ value: String(value), label: this.catalog.t(ROLE_KEYS[value]) }));

  protected readonly existingPrimaryName = signal<string | null>(null);

  readonly form = this.fb.nonNullable.group({
    firstName: ['', [Validators.required, Validators.maxLength(100)]],
    lastName: ['', [Validators.required, Validators.maxLength(100)]],
    phone: ['', [PeraValidators.phone]],
    role: [String(ContactRole.Owner), [Validators.required]],
    isPrimary: [false],
  });

  readonly serverError = signal<ParsedApiError | null>(null);
  readonly submitting = signal(false);

  constructor() {
    this.contacts
      .getForClient(this.data.clientId)
      .pipe(catchError(() => of([])))
      .subscribe((existing) => {
        const primary = existing.find((c) => c.isPrimary);
        this.existingPrimaryName.set(primary ? `${primary.firstName} ${primary.lastName}` : null);
      });
  }

  /** Reads the live control value — `formControlName` already keeps this component's CD current. */
  protected isPrimaryChecked(): boolean {
    return this.form.controls.isPrimary.value;
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

    this.contacts
      .add(this.data.clientId, {
        firstName: v.firstName.trim(),
        lastName: v.lastName.trim(),
        role: Number(v.role) as ContactRole,
        isPrimary: v.isPrimary,
        phone: v.phone.trim() || null,
      })
      .subscribe({
        next: () => {
          this.toast.show({ tone: 'success', message: this.catalog.t('client.contactSaved') });
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
