import { ChangeDetectionStrategy, Component, inject, signal } from '@angular/core';
import { FormBuilder, ReactiveFormsModule, Validators } from '@angular/forms';
import { CrmCatalogService } from '../../../data/crm-catalog.service';
import { ErrorHandlerService, friendly } from '@platform/http/error-handler.service';
import { CatalogService } from '@platform/i18n/catalog.service';
import { ToastService } from '@platform/feedback/toast.service';
import { ParsedApiError } from '@platform/types';
import { ServerErrorsDirective, firstErrorMessage } from '@shared/forms';
import {
  PERA_MODAL_DATA,
  PeraFormFieldComponent,
  PeraFormModalComponent,
  PeraInputComponent,
  PeraModalRef,
} from '@ds';

export interface NewCategoryDialogData {
  /** The parent the new category is created under; `null` = a new root. */
  parentId: string | null;
  parentName?: string | null;
}

/**
 * Create a catalog category (v2, Run B F6). Renamed from `new-node-dialog.component.ts`;
 * repointed from `POST /nodes` to `POST /categories`. Calls `CrmCatalogService` directly
 * (the same precedent it already set); the host reloads the cache from `afterClosed(true)`.
 */
@Component({
  selector: 'app-crm-new-category-dialog',
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [
    ReactiveFormsModule,
    ServerErrorsDirective,
    PeraFormModalComponent,
    PeraFormFieldComponent,
    PeraInputComponent,
  ],
  template: `
    <pera-form-modal
      eyebrow="POST /api/crm/catalog/categories"
      [title]="catalog.t('cat.newNode')"
      [subtitle]="data.parentName ?? catalog.t('cat.rootCrumb')"
      permission="crm.catalog.manage"
      [submitLabel]="catalog.t('cat.create')"
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
      </div>
    </pera-form-modal>
  `,
})
export class CrmNewCategoryDialogComponent {
  private readonly fb = inject(FormBuilder);
  private readonly api = inject(CrmCatalogService);
  private readonly errorHandler = inject(ErrorHandlerService);
  private readonly toast = inject(ToastService);
  private readonly modalRef = inject(PeraModalRef) as PeraModalRef<boolean>;
  protected readonly catalog = inject(CatalogService);
  readonly data = inject(PERA_MODAL_DATA) as NewCategoryDialogData;

  readonly form = this.fb.nonNullable.group({
    code: [
      '',
      [Validators.required, Validators.maxLength(64), Validators.pattern(/^[a-z0-9_]{1,64}$/)],
    ],
    nameEn: ['', [Validators.required, Validators.maxLength(200)]],
    nameAr: ['', [Validators.required, Validators.maxLength(200)]],
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

    this.api
      .createCategory({
        parentId: this.data.parentId,
        code: v.code.trim(),
        nameEn: v.nameEn.trim(),
        nameAr: v.nameAr.trim(),
      })
      .subscribe({
        next: () => {
          this.toast.show({ tone: 'success', message: this.catalog.t('cat.nodeCreated') });
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
