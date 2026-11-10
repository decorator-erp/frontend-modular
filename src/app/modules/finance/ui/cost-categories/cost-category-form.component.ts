import { ChangeDetectionStrategy, Component, OnInit, inject, signal } from '@angular/core';
import { HttpErrorResponse } from '@angular/common/http';
import { FormBuilder, FormGroup, ReactiveFormsModule, Validators } from '@angular/forms';
import { CostCategoryService } from '../../data/cost-category.service';
import { ErrorHandlerService, friendly } from '@platform/http/error-handler.service';
import { ToastService } from '@platform/feedback/toast.service';
import {
  PERA_MODAL_DATA,
  PeraButtonComponent,
  PeraFormFieldComponent,
  PeraInputComponent,
  PeraModalRef,
  PeraTextareaComponent,
} from '@ds';

export interface CostCategoryFormData {
  /** Pass an existing id to switch the modal to edit mode. */
  id?: string;
  initial?: {
    code: string;
    name: string;
    description: string | null;
  };
}

/**
 * Create / edit a cost category. Backed by `CostCategoryService`.
 *
 * `code` is required and unique on create; the doc forbids editing it after
 * the fact (no `code` field on `UpdateCostCategoryRequest`), so we disable
 * the control in edit mode.
 */
@Component({
  selector: 'app-cost-category-form',
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [
    ReactiveFormsModule,
    PeraButtonComponent,
    PeraFormFieldComponent,
    PeraInputComponent,
    PeraTextareaComponent,
  ],
  template: `
    <form
      [formGroup]="form"
      (ngSubmit)="submit()"
      class="flex flex-col gap-4 p-5 min-w-[var(--w-dialog)] bg-surface border border-border rounded-card"
    >
      <h2 class="m-0 fs-body font-semibold">
        {{ isEdit ? 'Edit cost category' : 'New cost category' }}
      </h2>

      <pera-form-field
        label="Code"
        [required]="true"
        hint="Short unique identifier (up to 32 chars). Cannot be changed later."
      >
        <pera-input formControlName="code" placeholder="MEP-001"></pera-input>
      </pera-form-field>

      <pera-form-field label="Name" [required]="true">
        <pera-input
          formControlName="name"
          placeholder="Mechanical, electrical, plumbing"
        ></pera-input>
      </pera-form-field>

      <pera-form-field label="Description" hint="Optional. Up to 512 chars.">
        <pera-textarea formControlName="description" [rows]="3"></pera-textarea>
      </pera-form-field>

      @if (serverError(); as msg) {
        <p class="m-0 fs-caption text-danger">{{ msg }}</p>
      }

      <div class="flex justify-end gap-2 pt-1">
        <pera-button type="button" variant="ghost" (click)="cancel()">Cancel</pera-button>
        <pera-button type="submit" variant="primary" [disabled]="form.invalid || saving()">
          {{ saving() ? 'Saving…' : isEdit ? 'Save' : 'Create' }}
        </pera-button>
      </div>
    </form>
  `,
})
export class CostCategoryFormComponent implements OnInit {
  private readonly fb = inject(FormBuilder);
  private readonly api = inject(CostCategoryService);
  private readonly errors = inject(ErrorHandlerService);
  private readonly toast = inject(ToastService);
  private readonly ref = inject<PeraModalRef<boolean>>(PeraModalRef);
  private readonly data = inject<CostCategoryFormData | null>(PERA_MODAL_DATA);

  readonly form: FormGroup = this.fb.group({
    code: ['', [Validators.required, Validators.maxLength(32)]],
    name: ['', [Validators.required, Validators.maxLength(128)]],
    description: ['', [Validators.maxLength(512)]],
  });

  isEdit = false;
  readonly saving = signal(false);
  readonly serverError = signal<string | null>(null);

  ngOnInit(): void {
    const data = this.data;
    if (data?.id && data.initial) {
      this.isEdit = true;
      this.form.patchValue({
        code: data.initial.code,
        name: data.initial.name,
        description: data.initial.description ?? '',
      });
      this.form.get('code')?.disable();
    }
  }

  cancel(): void {
    this.ref.close(false);
  }

  submit(): void {
    if (this.form.invalid || this.saving()) return;
    this.saving.set(true);
    this.serverError.set(null);

    const value = this.form.getRawValue();
    const description = (value.description ?? '').trim();
    const name = (value.name ?? '').trim();
    const code = (value.code ?? '').trim();

    const obs$ = this.isEdit
      ? this.api.update(this.data!.id!, { name, description: description || undefined })
      : this.api.create({ code, name, description: description || undefined });

    obs$.subscribe({
      next: () => {
        this.saving.set(false);
        this.toast.show({
          tone: 'success',
          message: this.isEdit ? 'Cost category updated' : 'Cost category created',
        });
        this.ref.close(true);
      },
      error: (err: HttpErrorResponse) => {
        this.saving.set(false);
        const parsed = this.errors.parse(err);
        this.errors.applyToForm(this.form, parsed.fieldErrors);
        this.serverError.set(friendly(parsed));
      },
    });
  }
}
