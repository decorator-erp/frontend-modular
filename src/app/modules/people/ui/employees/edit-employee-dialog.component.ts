import { ChangeDetectionStrategy, Component, inject, signal } from '@angular/core';
import { FormBuilder, ReactiveFormsModule, Validators } from '@angular/forms';
import { EmployeeService, EmployeePatch } from '../../data/employee.service';
import { ErrorHandlerService, friendly } from '@platform/http/error-handler.service';
import { ToastService } from '@platform/feedback/toast.service';
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
  PeraSelectComponent,
  PeraTextareaComponent,
} from '@ds';
import { CONTRACT_TYPE_OPTIONS } from './contract-type';

export interface EditEmployeeDialogData {
  employeeId: string;
  fullName: string;
  jobTitle: string;
  contractType: string;
  phoneNumber: string | null;
  emergencyContactPhone: string | null;
  notes: string | null;
  endDate: string | null;
}

/**
 * Edit the six fields `PUT /api/employees/{id}` actually binds.
 *
 * Not editable here, because the command binds none of them: name, email, hire date, department
 * and active state. Department moves through `POST /api/employees/{id}/department/{departmentId}`;
 * active state through the activate/deactivate routes.
 *
 * Only opened for an ACTIVE employee — `Employee.Update()` returns early when `!IsActive` and the
 * endpoint still answers 204, so an edit on a deactivated employee would report success and change
 * nothing. The caller enforces that; this dialog assumes it.
 */
@Component({
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [
    ReactiveFormsModule,
    ServerErrorsDirective,
    PeraModalComponent,
    PeraModalFooterDirective,
    PeraFormFieldComponent,
    PeraInputComponent,
    PeraSelectComponent,
    PeraTextareaComponent,
    PeraButtonComponent,
  ],
  template: `
    <pera-modal [title]="'Edit ' + data.fullName" size="md">
      <form [formGroup]="form" [serverErrors]="serverError()" (ngSubmit)="submit()" novalidate>
        <div class="flex flex-col gap-3">
          <pera-form-field label="Job title" [required]="true" [error]="errorOf('jobTitle')">
            <pera-input formControlName="jobTitle" [error]="errorOf('jobTitle')" />
          </pera-form-field>
          <pera-form-field label="Contract type" [error]="errorOf('contractType')">
            <pera-select
              formControlName="contractType"
              [options]="contractTypes"
              placeholder="Select a contract type"
              [error]="errorOf('contractType')"
            />
          </pera-form-field>
          <pera-form-field label="Phone" [error]="errorOf('phoneNumber')">
            <pera-input formControlName="phoneNumber" [error]="errorOf('phoneNumber')" />
          </pera-form-field>
          <pera-form-field
            label="Emergency contact phone"
            [error]="errorOf('emergencyContactPhone')"
          >
            <pera-input
              formControlName="emergencyContactPhone"
              [error]="errorOf('emergencyContactPhone')"
            />
          </pera-form-field>
          <pera-form-field
            label="End date"
            [error]="errorOf('endDate')"
            hint="Optional · YYYY-MM-DD"
          >
            <pera-input
              formControlName="endDate"
              placeholder="2027-01-31"
              [error]="errorOf('endDate')"
            />
          </pera-form-field>
          <pera-form-field label="Notes" [error]="errorOf('notes')">
            <pera-textarea formControlName="notes" [rows]="3" [error]="errorOf('notes')" />
          </pera-form-field>
        </div>
      </form>
      <div peraModalFooter class="flex gap-2">
        <pera-button variant="ghost" (click)="close()">Cancel</pera-button>
        <pera-button variant="primary" [loading]="submitting()" (click)="submit()">
          Save changes
        </pera-button>
      </div>
    </pera-modal>
  `,
})
export class EditEmployeeDialogComponent {
  private readonly fb = inject(FormBuilder);
  private readonly employees = inject(EmployeeService);
  private readonly errorHandler = inject(ErrorHandlerService);
  private readonly toast = inject(ToastService);
  private readonly modalRef = inject(PeraModalRef) as PeraModalRef<EmployeePatch | null>;
  readonly data = inject(PERA_MODAL_DATA) as EditEmployeeDialogData;

  readonly contractTypes = CONTRACT_TYPE_OPTIONS;

  readonly form = this.fb.nonNullable.group({
    jobTitle: [this.data.jobTitle, [Validators.required, PeraValidators.trimmedLength(2, 200)]],
    contractType: [this.data.contractType],
    phoneNumber: [this.data.phoneNumber ?? '', [Validators.maxLength(50)]],
    emergencyContactPhone: [this.data.emergencyContactPhone ?? '', [Validators.maxLength(50)]],
    endDate: [this.data.endDate ?? '', [PeraValidators.isoDate]],
    notes: [this.data.notes ?? '', [Validators.maxLength(2000)]],
  });

  readonly serverError = signal<ParsedApiError | null>(null);
  readonly submitting = signal(false);

  errorOf(name: string): string {
    const control = this.form.get(name);
    return control && control.touched && control.errors ? firstErrorMessage(control.errors) : '';
  }

  close(): void {
    this.modalRef.close(null);
  }

  submit(): void {
    if (this.form.invalid) {
      this.form.markAllAsTouched();
      return;
    }
    this.submitting.set(true);
    this.serverError.set(null);
    const v = this.form.getRawValue();
    const patch: EmployeePatch = {
      jobTitle: v.jobTitle.trim(),
      contractType: v.contractType,
      phoneNumber: v.phoneNumber.trim(),
      emergencyContactPhone: v.emergencyContactPhone.trim(),
      endDate: v.endDate.trim(),
      notes: v.notes.trim(),
    };

    this.employees.update(this.data.employeeId, patch).subscribe({
      next: () => {
        this.toast.show({ tone: 'success', message: `${this.data.fullName} updated` });
        // Hand the patch back so the caller can update its view without a refetch.
        this.modalRef.close(patch);
      },
      error: (err) => {
        const parsed = this.errorHandler.parse(err);
        this.serverError.set({ ...parsed, generalMessage: friendly(parsed) });
        this.submitting.set(false);
      },
    });
  }
}
