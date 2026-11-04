import { ChangeDetectionStrategy, Component, inject, signal } from '@angular/core';
import { FormBuilder, ReactiveFormsModule, Validators } from '@angular/forms';
import { ErrorHandlerService, friendly } from '@platform/http/error-handler.service';
import { ToastService } from '@platform/feedback/toast.service';
import { ParsedApiError } from '@platform/types';
import { PeraValidators, ServerErrorsDirective, firstErrorMessage } from '@shared/forms';
import {
  CreateStageTemplateRequest,
  UpdateStageTemplateRequest,
} from '../../model/stage-template.model';
import { StageTemplatesService } from '../../data/stage-templates.service';
import {
  PERA_MODAL_DATA,
  PeraButtonComponent,
  PeraCheckboxComponent,
  PeraFormFieldComponent,
  PeraInputComponent,
  PeraModalComponent,
  PeraModalFooterDirective,
  PeraModalRef,
  PeraTextareaComponent,
} from '@ds';

export interface StageTemplateFormDialogData {
  /** Present → edit that template; absent → create a new (Custom) template. */
  id?: string;
  initial?: { name: string; description: string | null; isDefault: boolean };
}

/**
 * Create / edit a stage template. New templates are always `Custom`
 * (`type`, sent as the enum int by the service); System templates are seeded and immutable — the library
 * hides Edit for them, and a stray edit attempt surfaces the backend 409 as a toast.
 */
@Component({
  selector: 'app-stage-template-form-dialog',
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [
    ReactiveFormsModule,
    ServerErrorsDirective,
    PeraModalComponent,
    PeraModalFooterDirective,
    PeraFormFieldComponent,
    PeraInputComponent,
    PeraTextareaComponent,
    PeraCheckboxComponent,
    PeraButtonComponent,
  ],
  template: `
    <pera-modal [title]="isEdit ? 'Edit stage template' : 'New stage template'" size="md">
      <form [formGroup]="form" [serverErrors]="serverError()" (ngSubmit)="submit()" novalidate>
        <p class="m-0 mb-3 fs-label text-text-muted">
          {{
            isEdit ? 'PUT /api/stage-templates/' + data?.id : 'POST /api/stage-templates · Custom'
          }}
        </p>
        <div class="flex flex-col gap-3">
          <pera-form-field label="Name" [required]="true" [error]="errorOf('name')">
            <pera-input
              formControlName="name"
              placeholder="e.g. Residential fit-out"
              [error]="errorOf('name')"
            />
          </pera-form-field>
          <pera-form-field label="Description" [error]="errorOf('description')">
            <pera-textarea
              formControlName="description"
              [rows]="3"
              placeholder="What this template seeds"
              [error]="errorOf('description')"
            />
          </pera-form-field>
          <pera-checkbox formControlName="isDefault">Mark as default</pera-checkbox>
        </div>
      </form>

      <div peraModalFooter class="flex items-center justify-between w-full gap-2">
        <span class="fs-label text-text-muted">Requires Projects.ManageStages</span>
        <div class="flex gap-2">
          <pera-button variant="ghost" (click)="close()">Cancel</pera-button>
          <pera-button variant="primary" [loading]="submitting()" (click)="submit()">
            {{ isEdit ? 'Save changes' : 'Create template' }}
          </pera-button>
        </div>
      </div>
    </pera-modal>
  `,
})
export class StageTemplateFormDialogComponent {
  private readonly fb = inject(FormBuilder);
  private readonly templates = inject(StageTemplatesService);
  private readonly errorHandler = inject(ErrorHandlerService);
  private readonly toast = inject(ToastService);
  private readonly modalRef = inject(PeraModalRef) as PeraModalRef<boolean>;
  readonly data = inject(PERA_MODAL_DATA) as StageTemplateFormDialogData | null;

  readonly isEdit = !!this.data?.id;

  readonly form = this.fb.nonNullable.group({
    name: [
      this.data?.initial?.name ?? '',
      [Validators.required, PeraValidators.trimmedLength(1, 200)],
    ],
    description: [this.data?.initial?.description ?? '', [Validators.maxLength(1000)]],
    isDefault: [this.data?.initial?.isDefault ?? false],
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
    const name = v.name.trim();
    const description = v.description.trim() || null;

    const call = this.isEdit
      ? this.templates.update(this.data!.id!, {
          name,
          description,
          isDefault: v.isDefault,
        } as UpdateStageTemplateRequest)
      : this.templates.create({
          name,
          description,
          isDefault: v.isDefault,
          type: 'Custom',
        } as CreateStageTemplateRequest);

    call.subscribe({
      next: () => {
        this.toast.show({
          tone: 'success',
          message: this.isEdit ? 'Template updated' : `Template ${name} created`,
        });
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
