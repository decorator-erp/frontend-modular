import { HttpErrorResponse } from '@angular/common/http';
import { ChangeDetectionStrategy, Component, inject, signal } from '@angular/core';
import { FormBuilder, ReactiveFormsModule, Validators } from '@angular/forms';
import { Observable } from 'rxjs';
import { DepartmentService } from '../../data/department.service';
import { ErrorHandlerService, friendly } from '@platform/http/error-handler.service';
import { ToastService } from '@platform/feedback/toast.service';
import { CreateDepartmentRequest, UpdateDepartmentRequest } from '../../model/people.model';
import { ParsedApiError } from '@platform/types';
import { PeraValidators, ServerErrorsDirective, firstErrorMessage } from '@shared/forms';
import {
  PERA_MODAL_DATA,
  PeraButtonComponent,
  PeraFormFieldComponent,
  PeraInputComponent,
  PeraModalComponent,
  PeraModalFooterDirective,
  PeraModalRef,
  PeraTextareaComponent,
} from '@ds';

export interface DepartmentFormDialogData {
  /** Present → edit that department; absent → create. */
  id?: string;
  currentName?: string;
  currentDescription?: string | null;
}

/** Create / edit a department. */
@Component({
  selector: 'app-department-form-dialog',
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [
    ReactiveFormsModule,
    ServerErrorsDirective,
    PeraModalComponent,
    PeraModalFooterDirective,
    PeraFormFieldComponent,
    PeraInputComponent,
    PeraTextareaComponent,
    PeraButtonComponent,
  ],
  template: `
    <pera-modal [title]="isEdit ? 'Edit department' : 'New department'" size="sm">
      <form [formGroup]="form" [serverErrors]="serverError()" (ngSubmit)="submit()" novalidate>
        <div class="flex flex-col gap-3">
          <pera-form-field label="Name" [required]="true" [error]="errorOf('name')">
            <pera-input
              formControlName="name"
              placeholder="e.g. Architecture"
              [error]="errorOf('name')"
            />
          </pera-form-field>
          <pera-form-field label="Description" [error]="errorOf('description')">
            <pera-textarea
              formControlName="description"
              [rows]="3"
              placeholder="What this department does"
              [error]="errorOf('description')"
            />
          </pera-form-field>
        </div>
      </form>

      <div peraModalFooter class="flex items-center justify-end w-full gap-2">
        <div class="flex gap-2">
          <pera-button variant="ghost" (click)="close()">Cancel</pera-button>
          <pera-button variant="primary" [loading]="submitting()" (click)="submit()">
            {{ isEdit ? 'Save changes' : 'Create department' }}
          </pera-button>
        </div>
      </div>
    </pera-modal>
  `,
})
export class DepartmentFormDialogComponent {
  private readonly fb = inject(FormBuilder);
  private readonly departments = inject(DepartmentService);
  private readonly errorHandler = inject(ErrorHandlerService);
  private readonly toast = inject(ToastService);
  private readonly modalRef = inject(PeraModalRef) as PeraModalRef<boolean>;
  readonly data = inject(PERA_MODAL_DATA) as DepartmentFormDialogData | null;

  readonly isEdit = !!this.data?.id;

  readonly form = this.fb.nonNullable.group({
    name: [
      this.data?.currentName ?? '',
      [Validators.required, PeraValidators.trimmedLength(2, 100)],
    ],
    description: [this.data?.currentDescription ?? '', [Validators.maxLength(500)]],
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
    const payload: CreateDepartmentRequest & UpdateDepartmentRequest = {
      name: v.name.trim(),
      description: v.description.trim(),
    };
    // `create` resolves the new id and `update` resolves void, so widen to a common type rather
    // than subscribing to a union of two incompatible signatures.
    const call: Observable<unknown> = this.isEdit
      ? this.departments.update(this.data!.id!, payload)
      : this.departments.create(payload);
    call.subscribe({
      next: () => {
        this.toast.show({
          tone: 'success',
          message: this.isEdit ? 'Department updated' : `Department ${payload.name} created`,
        });
        this.modalRef.close(true);
      },
      error: (err: HttpErrorResponse) => {
        const parsed = this.errorHandler.parse(err);
        this.serverError.set({ ...parsed, generalMessage: friendly(parsed) });
        this.submitting.set(false);
      },
    });
  }
}
