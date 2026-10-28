import { ChangeDetectionStrategy, Component, computed, inject, signal } from '@angular/core';
import { FormBuilder, ReactiveFormsModule, Validators } from '@angular/forms';
import { ProjectStageService } from '../../data/project-stage.service';
import { ErrorHandlerService, friendly } from '@platform/http/error-handler.service';
import { ToastService } from '@platform/feedback/toast.service';
import { CreateProjectStageRequest, UpdateProjectStageRequest } from '../../model/project.model';
import { ParsedApiError } from '@platform/types';
import { PeraValidators, ServerErrorsDirective, firstErrorMessage } from '@shared/forms';
import {
  PERA_MODAL_DATA,
  PeraDateInputComponent,
  PeraFormFieldComponent,
  PeraFormModalComponent,
  PeraInputComponent,
  PeraModalRef,
  PeraTextareaComponent,
} from '@ds';

export interface StageFormDialogData {
  mode: 'create' | 'edit';
  projectId: string;
  stageId?: string;
  /** Suggested order for a new stage (max existing order + 10). */
  nextOrder?: number;
  initial?: {
    name: string;
    order: number;
    estimatedStartDate: string | null;
    estimatedEndDate: string | null;
    description: string | null;
    notes: string | null;
  };
}

/**
 * Create / edit a project stage (DMS Forms · Stage). New stages start Locked.
 * The design's "From template stage" select is omitted — seeding a stage from a
 * StageTemplate is the project wizard's job and there is no per-stage template
 * lookup endpoint (see docs/STAGE_TASK_BACKEND_GAPS.md).
 */
@Component({
  selector: 'app-stage-form-dialog',
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [
    ReactiveFormsModule,
    ServerErrorsDirective,
    PeraFormModalComponent,
    PeraFormFieldComponent,
    PeraInputComponent,
    PeraTextareaComponent,
    PeraDateInputComponent,
  ],
  template: `
    <pera-form-modal
      [eyebrow]="isEdit ? 'PUT /api/project-stages/{id}' : 'POST /api/project-stages'"
      [title]="isEdit ? 'Edit stage' : 'New stage'"
      [subtitle]="
        isEdit
          ? 'Update stage name, order, planned dates and notes.'
          : 'Add a stage to a Stage-workflow project. New stages start Locked.'
      "
      permission="stages.manage"
      [submitLabel]="isEdit ? 'Save changes' : 'Create stage'"
      submittingLabel="Saving…"
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
        <pera-form-field label="Stage name" [required]="true" [error]="errorOf('name')">
          <pera-input
            formControlName="name"
            placeholder="Technical design"
            [error]="errorOf('name')"
          />
        </pera-form-field>
        <pera-form-field
          label="Order"
          [required]="true"
          hint="Position in the sequence"
          [error]="errorOf('order')"
        >
          <pera-input type="number" formControlName="order" [error]="errorOf('order')" />
        </pera-form-field>
        <pera-form-field
          label="Estimated start"
          hint="optional"
          [error]="errorOf('estimatedStartDate')"
        >
          <pera-date-input
            formControlName="estimatedStartDate"
            [error]="errorOf('estimatedStartDate')"
          />
        </pera-form-field>
        <pera-form-field label="Estimated end" hint="optional" [error]="endDateError()">
          <pera-date-input
            formControlName="estimatedEndDate"
            [min]="form.controls.estimatedStartDate.value || null"
            [error]="endDateError()"
          />
        </pera-form-field>
        <pera-form-field class="col-span-2" label="Description" [error]="errorOf('description')">
          <pera-textarea
            formControlName="description"
            [rows]="3"
            [error]="errorOf('description')"
          />
        </pera-form-field>
        <pera-form-field class="col-span-2" label="Notes" [error]="errorOf('notes')">
          <pera-textarea formControlName="notes" [rows]="2" [error]="errorOf('notes')" />
        </pera-form-field>
      </div>
    </pera-form-modal>
  `,
})
export class StageFormDialogComponent {
  private readonly fb = inject(FormBuilder);
  private readonly stages = inject(ProjectStageService);
  private readonly errorHandler = inject(ErrorHandlerService);
  private readonly toast = inject(ToastService);
  private readonly modalRef = inject(PeraModalRef) as PeraModalRef<boolean>;
  readonly data = inject(PERA_MODAL_DATA) as StageFormDialogData;

  readonly isEdit = this.data.mode === 'edit';

  readonly form = this.fb.nonNullable.group(
    {
      name: [
        this.data.initial?.name ?? '',
        [Validators.required, PeraValidators.trimmedLength(1, 200)],
      ],
      order: [
        String(this.data.initial?.order ?? this.data.nextOrder ?? 10),
        [Validators.required, PeraValidators.positiveNumber],
      ],
      estimatedStartDate: [this.data.initial?.estimatedStartDate ?? ''],
      estimatedEndDate: [this.data.initial?.estimatedEndDate ?? ''],
      description: [this.data.initial?.description ?? '', [Validators.maxLength(1000)]],
      notes: [this.data.initial?.notes ?? '', [Validators.maxLength(1000)]],
    },
    { validators: [PeraValidators.dateRange('estimatedStartDate', 'estimatedEndDate')] },
  );

  readonly serverError = signal<ParsedApiError | null>(null);
  readonly submitting = signal(false);

  readonly endDateError = computed(() => {
    const ctrl = this.form.controls.estimatedEndDate;
    if (ctrl.touched && this.form.errors?.['dateRange']) return 'End must be on or after start.';
    return '';
  });

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
    const base = {
      name: v.name.trim(),
      order: Number(v.order),
      estimatedStartDate: v.estimatedStartDate || null,
      estimatedEndDate: v.estimatedEndDate || null,
      description: v.description.trim() || null,
      notes: v.notes.trim() || null,
    };
    const call = this.isEdit
      ? this.stages.update(this.data.stageId!, base satisfies UpdateProjectStageRequest)
      : this.stages.create({
          projectId: this.data.projectId,
          ...base,
        } satisfies CreateProjectStageRequest);
    call.subscribe({
      next: () => {
        this.toast.show({
          tone: 'success',
          message: this.isEdit ? 'Stage saved' : 'Stage created',
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
