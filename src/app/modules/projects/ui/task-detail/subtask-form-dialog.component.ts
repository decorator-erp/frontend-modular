import { ChangeDetectionStrategy, Component, inject, signal } from '@angular/core';
import { FormBuilder, ReactiveFormsModule, Validators } from '@angular/forms';
import { ProjectSubTaskService } from '../../data/project-subtask.service';
import { ErrorHandlerService, friendly } from '@platform/http/error-handler.service';
import { ToastService } from '@platform/feedback/toast.service';
import {
  CreateProjectSubTaskRequest,
  UpdateProjectSubTaskRequest,
} from '../../model/project.model';
import { ParsedApiError } from '@platform/types';
import { PeraValidators, ServerErrorsDirective, firstErrorMessage } from '@shared/forms';
import {
  PERA_MODAL_DATA,
  PeraCheckboxComponent,
  PeraFormFieldComponent,
  PeraFormModalComponent,
  PeraInputComponent,
  PeraModalRef,
} from '@ds';

export interface SubtaskFormDialogData {
  mode: 'create' | 'edit';
  projectTaskId: string;
  subtaskId?: string;
  nextOrder?: number;
  initial?: { title: string; order: number; isRequired: boolean };
}

/** Create / edit a task sub-task / checklist item (DMS Forms · Sub-task). */
@Component({
  selector: 'app-subtask-form-dialog',
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [
    ReactiveFormsModule,
    ServerErrorsDirective,
    PeraFormModalComponent,
    PeraFormFieldComponent,
    PeraInputComponent,
    PeraCheckboxComponent,
  ],
  template: `
    <pera-form-modal
      [eyebrow]="isEdit ? 'PUT /api/project-subtasks/{id}' : 'POST /api/project-subtasks'"
      [title]="isEdit ? 'Edit sub-task' : 'New sub-task'"
      [subtitle]="isEdit ? 'Update the checklist item.' : 'Add a checklist item under a task.'"
      permission="stage_tasks.manage"
      [submitLabel]="isEdit ? 'Save changes' : 'Create sub-task'"
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
        <pera-form-field
          class="col-span-2"
          label="Title"
          [required]="true"
          [error]="errorOf('title')"
        >
          <pera-input
            formControlName="title"
            placeholder="Confirm ceiling heights with MEP"
            [error]="errorOf('title')"
          />
        </pera-form-field>
        <pera-form-field label="Order" [required]="true" [error]="errorOf('order')">
          <pera-input type="number" formControlName="order" [error]="errorOf('order')" />
        </pera-form-field>
        <div class="col-span-2">
          <pera-checkbox formControlName="isRequired">Required to complete the task</pera-checkbox>
        </div>
      </div>
    </pera-form-modal>
  `,
})
export class SubtaskFormDialogComponent {
  private readonly fb = inject(FormBuilder);
  private readonly api = inject(ProjectSubTaskService);
  private readonly errorHandler = inject(ErrorHandlerService);
  private readonly toast = inject(ToastService);
  private readonly modalRef = inject(PeraModalRef) as PeraModalRef<boolean>;
  readonly data = inject(PERA_MODAL_DATA) as SubtaskFormDialogData;

  readonly isEdit = this.data.mode === 'edit';

  readonly form = this.fb.nonNullable.group({
    title: [
      this.data.initial?.title ?? '',
      [Validators.required, PeraValidators.trimmedLength(1, 300)],
    ],
    order: [
      String(this.data.initial?.order ?? this.data.nextOrder ?? 10),
      [Validators.required, PeraValidators.positiveNumber],
    ],
    isRequired: [this.data.initial?.isRequired ?? false],
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
    const call = this.isEdit
      ? this.api.update(this.data.subtaskId!, {
          title: v.title.trim(),
          order: Number(v.order),
          isRequired: v.isRequired,
        } satisfies UpdateProjectSubTaskRequest)
      : this.api.create({
          projectTaskId: this.data.projectTaskId,
          title: v.title.trim(),
          order: Number(v.order),
          isRequired: v.isRequired,
        } satisfies CreateProjectSubTaskRequest);
    call.subscribe({
      next: () => {
        this.toast.show({
          tone: 'success',
          message: this.isEdit ? 'Sub-task saved' : 'Sub-task created',
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
