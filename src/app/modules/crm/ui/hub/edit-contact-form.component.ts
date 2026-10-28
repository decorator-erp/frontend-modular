import { ChangeDetectionStrategy, Component, inject, signal } from '@angular/core';
import { FormBuilder, ReactiveFormsModule, Validators } from '@angular/forms';
import { CrmContact, CrmContactService } from '../../data/crm-contact.service';
import { ErrorHandlerService, friendly } from '@platform/http/error-handler.service';
import { CatalogService } from '@platform/i18n/catalog.service';
import type { CatalogKey } from '@platform/i18n/catalog/en';
import { ContactRole } from '../../model/crm-enums';
import { ToastService } from '@platform/feedback/toast.service';
import { ParsedApiError } from '@platform/types';
import { PeraValidators, ServerErrorsDirective, firstErrorMessage } from '@shared/forms';
import {
  PERA_MODAL_DATA,
  PeraFormFieldComponent,
  PeraFormModalComponent,
  PeraInputComponent,
  PeraModalRef,
  PeraSelectComponent,
  SelectOption,
} from '@ds';

export interface EditContactFormDialogData {
  clientId: string;
  contact: CrmContact;
}

const ROLE_KEYS: Record<ContactRole, CatalogKey> = {
  [ContactRole.Owner]: 'brief.vOwner',
  [ContactRole.Spouse]: 'brief.vSpouse',
  [ContactRole.FamilyMember]: 'contact.roleFamilyMember',
  [ContactRole.Representative]: 'brief.vRepresentative',
  [ContactRole.Other]: 'common.other',
};

/** Edit an existing contact's details — the primary flag is never touched here, only via `setPrimary()`. */
@Component({
  selector: 'app-crm-edit-contact-form',
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [
    ReactiveFormsModule,
    ServerErrorsDirective,
    PeraFormModalComponent,
    PeraFormFieldComponent,
    PeraInputComponent,
    PeraSelectComponent,
  ],
  template: `
    <pera-form-modal
      [eyebrow]="'PUT /api/crm/clients/' + data.clientId + '/contacts/{contactId}'"
      [title]="
        catalog.t('common.edit') + ' — ' + data.contact.firstName + ' ' + data.contact.lastName
      "
      permission="crm.contacts.update"
      [submitLabel]="catalog.t('common.save')"
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
        <pera-form-field
          [label]="catalog.t('brief.fRole')"
          [required]="true"
          [error]="errorOf('role')"
        >
          <pera-select formControlName="role" [options]="roleOptions" [error]="errorOf('role')" />
        </pera-form-field>
      </div>
    </pera-form-modal>
  `,
})
export class CrmEditContactFormComponent {
  private readonly fb = inject(FormBuilder);
  private readonly contacts = inject(CrmContactService);
  private readonly errorHandler = inject(ErrorHandlerService);
  private readonly toast = inject(ToastService);
  private readonly modalRef = inject(PeraModalRef) as PeraModalRef<boolean>;
  protected readonly catalog = inject(CatalogService);
  readonly data = inject(PERA_MODAL_DATA) as EditContactFormDialogData;

  protected readonly roleOptions: SelectOption[] = (
    [
      ContactRole.Owner,
      ContactRole.Spouse,
      ContactRole.FamilyMember,
      ContactRole.Representative,
      ContactRole.Other,
    ] as const
  ).map((value) => ({ value: String(value), label: this.catalog.t(ROLE_KEYS[value]) }));

  readonly form = this.fb.nonNullable.group({
    firstName: [this.data.contact.firstName, [Validators.required, Validators.maxLength(100)]],
    lastName: [this.data.contact.lastName, [Validators.required, Validators.maxLength(100)]],
    phone: [this.data.contact.phone ?? '', [PeraValidators.phone]],
    role: [String(this.data.contact.role), [Validators.required]],
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
    const v = this.form.getRawValue();

    this.contacts
      .update(this.data.clientId, this.data.contact.id, {
        firstName: v.firstName.trim(),
        lastName: v.lastName.trim(),
        role: Number(v.role) as ContactRole,
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
