import { ChangeDetectionStrategy, Component, inject, signal } from '@angular/core';
import { FormBuilder, ReactiveFormsModule, Validators } from '@angular/forms';
import {
  CrmCatalogService,
  type CatalogEntryKind,
  type CatalogEntryUpdate,
} from '../../../data/crm-catalog.service';
import { ErrorHandlerService, friendly } from '@platform/http/error-handler.service';
import { CatalogService } from '@platform/i18n/catalog.service';
import { ToastService } from '@platform/feedback/toast.service';
import { ParsedApiError } from '@platform/types';
import { ServerErrorsDirective, firstErrorMessage } from '@shared/forms';
import { CatalogSelectionMode } from '../../../model/crm-enums';
import {
  PERA_MODAL_DATA,
  PeraCheckboxComponent,
  PeraFormFieldComponent,
  PeraFormModalComponent,
  PeraInputComponent,
  PeraModalRef,
  PeraSelectComponent,
  type SelectOption,
} from '@ds';

export interface CatalogEntryDialogData {
  kind: CatalogEntryKind;
  id: string;
  code: string;
  nameEn: string;
  nameAr: string;
  /** categories */
  selectionMode?: CatalogSelectionMode;
  /** categories, attributes */
  isRequired?: boolean;
  /** items */
  isPurchasable?: boolean;
  /** attributes */
  unit?: string | null;
}

/**
 * crmp C-4 (D4): edit one catalog entry — `PUT /api/crm/catalog/{kind}/{id}`
 * (`CrmCatalogEndpoints.cs:107`). Every kind edits its code and both names; a category adds
 * its selection mode and required flag, an item its purchasable flag, an attribute its unit
 * and required flag. Members a kind does not edit are left out, so the server keeps them.
 * 409 `crm.catalog.CodeTaken` shows inline. Closes `true` on success; the host reloads.
 */
@Component({
  selector: 'app-crm-catalog-entry-dialog',
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [
    ReactiveFormsModule,
    ServerErrorsDirective,
    PeraCheckboxComponent,
    PeraFormModalComponent,
    PeraFormFieldComponent,
    PeraInputComponent,
    PeraSelectComponent,
  ],
  template: `
    <pera-form-modal
      [eyebrow]="'PUT /api/crm/catalog/' + data.kind"
      [title]="catalog.t('cat.editEntry')"
      [subtitle]="data.code"
      size="md"
      permission="crm.catalog.manage"
      [submitLabel]="catalog.t('cat.save')"
      [submittingLabel]="catalog.t('common.saving')"
      [submitting]="submitting()"
      [errorMessage]="serverError()?.generalMessage ?? null"
      [errorCode]="serverError()?.code ?? null"
      (submitted)="submit()"
      (cancelled)="close()"
    >
      <div [formGroup]="form" [serverErrors]="serverError()" class="flex flex-col gap-4">
        <pera-form-field
          [label]="catalog.t('cat.codeL')"
          [required]="true"
          [error]="errorOf('code')"
        >
          <pera-input formControlName="code" dir="ltr" [error]="errorOf('code')" />
        </pera-form-field>
        <pera-form-field
          [label]="catalog.t('cat.nameEnL')"
          [required]="true"
          [error]="errorOf('nameEn')"
        >
          <pera-input formControlName="nameEn" dir="ltr" [error]="errorOf('nameEn')" />
        </pera-form-field>
        <pera-form-field
          [label]="catalog.t('cat.nameArL')"
          [required]="true"
          [error]="errorOf('nameAr')"
        >
          <pera-input formControlName="nameAr" dir="rtl" [error]="errorOf('nameAr')" />
        </pera-form-field>
        @if (data.kind === 'categories') {
          <pera-form-field [label]="catalog.t('cat.selectionModeL')">
            <pera-select formControlName="selectionMode" [options]="modeOptions" />
          </pera-form-field>
        }
        @if (data.kind === 'attributes') {
          <pera-form-field [label]="catalog.t('cat.attrUnit')">
            <pera-input formControlName="unit" dir="ltr" />
          </pera-form-field>
        }
        @if (data.kind === 'categories' || data.kind === 'attributes') {
          <pera-checkbox formControlName="isRequired">{{
            catalog.t(data.kind === 'categories' ? 'cat.requiredL' : 'cat.attrRequired')
          }}</pera-checkbox>
        }
        @if (data.kind === 'items') {
          <pera-checkbox formControlName="isPurchasable">{{
            catalog.t('cat.isPurchasableL')
          }}</pera-checkbox>
        }
      </div>
    </pera-form-modal>
  `,
})
export class CrmCatalogEntryDialogComponent {
  private readonly fb = inject(FormBuilder);
  private readonly api = inject(CrmCatalogService);
  private readonly errorHandler = inject(ErrorHandlerService);
  private readonly toast = inject(ToastService);
  private readonly modalRef = inject(PeraModalRef) as PeraModalRef<boolean>;
  protected readonly catalog = inject(CatalogService);
  readonly data = inject(PERA_MODAL_DATA) as CatalogEntryDialogData;

  /** Items take 256-character names, the rest 128 (`UpdateCrmCatalogEntryCommandValidator`). */
  private readonly nameMax = this.data.kind === 'items' ? 256 : 128;

  readonly form = this.fb.nonNullable.group({
    code: [this.data.code, [Validators.required, Validators.maxLength(64)]],
    nameEn: [this.data.nameEn, [Validators.required, Validators.maxLength(this.nameMax)]],
    nameAr: [this.data.nameAr, [Validators.required, Validators.maxLength(this.nameMax)]],
    selectionMode: [String(this.data.selectionMode ?? CatalogSelectionMode.None)],
    isRequired: [this.data.isRequired ?? false],
    isPurchasable: [this.data.isPurchasable ?? true],
    unit: [this.data.unit ?? '', [Validators.maxLength(32)]],
  });

  readonly modeOptions: SelectOption[] = [
    { value: String(CatalogSelectionMode.None), label: this.catalog.t('cat.modeNone') },
    { value: String(CatalogSelectionMode.Single), label: this.catalog.t('cat.modeSingle') },
    { value: String(CatalogSelectionMode.Multi), label: this.catalog.t('cat.modeMulti') },
  ];

  readonly serverError = signal<ParsedApiError | null>(null);
  readonly submitting = signal(false);

  errorOf(name: string): string {
    const control = this.form.get(name);
    return control && control.touched && control.errors ? firstErrorMessage(control.errors) : '';
  }

  close(): void {
    this.modalRef.close(false);
  }

  /** The body for this kind: the shared three plus only the members the kind edits. */
  request(): CatalogEntryUpdate {
    const v = this.form.getRawValue();
    const body: CatalogEntryUpdate = {
      code: v.code.trim(),
      nameEn: v.nameEn.trim(),
      nameAr: v.nameAr.trim(),
    };
    switch (this.data.kind) {
      case 'categories':
        return { ...body, selectionMode: Number(v.selectionMode), isRequired: v.isRequired };
      case 'items':
        return { ...body, isPurchasable: v.isPurchasable };
      case 'attributes':
        return { ...body, unit: v.unit.trim() || null, isRequired: v.isRequired };
      default:
        return body;
    }
  }

  submit(): void {
    if (this.submitting()) return;
    if (this.form.invalid) {
      this.form.markAllAsTouched();
      return;
    }
    this.submitting.set(true);
    this.serverError.set(null);
    this.api.updateEntry(this.data.kind, this.data.id, this.request()).subscribe({
      next: () => {
        this.toast.show({ tone: 'success', message: this.catalog.t('cat.entrySaved') });
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
