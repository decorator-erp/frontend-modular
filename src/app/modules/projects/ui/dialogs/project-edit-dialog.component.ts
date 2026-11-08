import { ChangeDetectionStrategy, Component, inject, signal } from '@angular/core';
import { FormBuilder, ReactiveFormsModule, Validators } from '@angular/forms';
import { ProjectService } from '../../data/project.service';
import { ErrorHandlerService, friendly } from '@platform/http/error-handler.service';
import { ToastService } from '@platform/feedback/toast.service';
import { UpdateProjectRequest } from '../../model/project.model';
import { ParsedApiError } from '@platform/types';
import { PeraValidators, ServerErrorsDirective, firstErrorMessage } from '@shared/forms';
import {
  PERA_MODAL_DATA,
  PeraFormFieldComponent,
  PeraFormModalComponent,
  PeraInputComponent,
  PeraModalRef,
  PeraTextareaComponent,
} from '@ds';

export interface ProjectEditDialogData {
  id: string;
  initial: { name: string; description: string | null; notes: string | null };
}

/**
 * Edit a project's mutable header fields (DMS Forms · Project · edit).
 * `UpdateProjectRequest` is intentionally narrow — only `name`/`description`/
 * `notes`; code, client and dates each have their own endpoints, and creation is
 * the project wizard.
 */
@Component({
  selector: 'app-project-edit-dialog',
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [
    ReactiveFormsModule,
    ServerErrorsDirective,
    PeraFormModalComponent,
    PeraFormFieldComponent,
    PeraInputComponent,
    PeraTextareaComponent,
  ],
  template: `
    <pera-form-modal
      eyebrow="PUT /api/projects/{id}"
      title="Edit project"
      subtitle="Update the mutable header fields. Code, client and dates are managed elsewhere."
      permission="project.update"
      submitLabel="Save changes"
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
          label="Project name"
          [required]="true"
          hint="≤ 100 chars"
          [error]="errorOf('name')"
        >
          <pera-input
            formControlName="name"
            placeholder="Al Maha Residence"
            [error]="errorOf('name')"
          />
        </pera-form-field>
        <pera-form-field class="col-span-2" label="Description" [error]="errorOf('description')">
          <pera-textarea
            formControlName="description"
            [rows]="3"
            placeholder="Short brief shown on the project header"
            [error]="errorOf('description')"
          />
        </pera-form-field>
        <pera-form-field class="col-span-2" label="Notes" [error]="errorOf('notes')">
          <pera-textarea
            formControlName="notes"
            [rows]="2"
            placeholder="Internal notes"
            [error]="errorOf('notes')"
          />
        </pera-form-field>
      </div>
    </pera-form-modal>
  `,
})
export class ProjectEditDialogComponent {
  private readonly fb = inject(FormBuilder);
  private readonly projects = inject(ProjectService);
  private readonly errorHandler = inject(ErrorHandlerService);
  private readonly toast = inject(ToastService);
  private readonly modalRef = inject(PeraModalRef) as PeraModalRef<boolean>;
  readonly data = inject(PERA_MODAL_DATA) as ProjectEditDialogData | null;

  readonly form = this.fb.nonNullable.group({
    name: [
      this.data?.initial.name ?? '',
      [Validators.required, PeraValidators.trimmedLength(1, 100)],
    ],
    description: [this.data?.initial.description ?? '', [Validators.maxLength(2000)]],
    notes: [this.data?.initial.notes ?? '', [Validators.maxLength(1000)]],
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

  /**
   * Sync W2-5: the project PUT treats null as "keep" (dms `Project.Update`, Project.cs:62-84), so a
   * field the user emptied is sent as '' — which the backend stores, clearing it. A field that was
   * already empty stays null (nothing to clear).
   */
  private cleared(value: string, initial: string | null | undefined): string | null {
    return value.trim() || (initial ? '' : null);
  }

  submit(): void {
    const id = this.data?.id;
    if (!id || this.form.invalid) {
      this.form.markAllAsTouched();
      return;
    }
    this.submitting.set(true);
    this.serverError.set(null);
    const v = this.form.getRawValue();
    const payload: UpdateProjectRequest = {
      name: v.name.trim(),
      description: this.cleared(v.description, this.data?.initial.description),
      notes: this.cleared(v.notes, this.data?.initial.notes),
    };
    this.projects.update(id, payload).subscribe({
      next: () => {
        this.toast.show({ tone: 'success', message: 'Project saved' });
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
