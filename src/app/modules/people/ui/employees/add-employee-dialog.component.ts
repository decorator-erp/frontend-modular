import {
  ChangeDetectionStrategy,
  Component,
  OnInit,
  computed,
  inject,
  signal,
} from '@angular/core';
import { FormBuilder, ReactiveFormsModule, Validators } from '@angular/forms';
import { EmployeeService } from '../../data/employee.service';
import { LookupCache } from '../../data/lookup.cache';
import { ErrorHandlerService, friendly } from '@platform/http/error-handler.service';
import { ToastService } from '@platform/feedback/toast.service';
import { CreateEmployeeRequest } from '../../model/people.model';
import { ParsedApiError } from '@platform/types';
import { PeraValidators, ServerErrorsDirective, firstErrorMessage } from '@shared/forms';
import { cryptoRandomPassword } from '@shared/ui/password';
import { CONTRACT_TYPE_OPTIONS } from './contract-type';
import {
  PeraFormFieldComponent,
  PeraInputComponent,
  PeraModalComponent,
  PeraModalFooterDirective,
  PeraModalRef,
  PeraButtonComponent,
  PeraSelectComponent,
  PeraTextareaComponent,
  SelectOption,
} from '@ds';

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
    <pera-modal title="Add employee" size="md">
      <form
        [formGroup]="form"
        [serverErrors]="serverError()"
        id="add-employee-form"
        (ngSubmit)="submit()"
        novalidate
      >
        <div class="grid grid-cols-1 md:grid-cols-2 gap-3">
          <pera-form-field label="First name" [required]="true" [error]="errorOf('firstName')">
            <pera-input
              formControlName="firstName"
              autocomplete="given-name"
              [error]="errorOf('firstName')"
            />
          </pera-form-field>
          <pera-form-field label="Last name" [required]="true" [error]="errorOf('lastName')">
            <pera-input
              formControlName="lastName"
              autocomplete="family-name"
              [error]="errorOf('lastName')"
            />
          </pera-form-field>
          <pera-form-field label="Email" [required]="true" [error]="errorOf('email')">
            <pera-input
              type="email"
              formControlName="email"
              autocomplete="email"
              [error]="errorOf('email')"
            />
          </pera-form-field>
          <!-- No Username field: CreateEmployeeCommand binds no userName. -->
          <!-- No Role picker: the handler always assigns the Employee role, and no endpoint sets a
               user's role at creation. Assign roles afterwards from the Roles screen. -->
          <pera-form-field label="Job title" [required]="true" [error]="errorOf('jobTitle')">
            <pera-input
              formControlName="jobTitle"
              placeholder="e.g. Senior Interior Designer"
              [error]="errorOf('jobTitle')"
            />
          </pera-form-field>
          <pera-form-field
            label="Hire date"
            [required]="true"
            [error]="errorOf('hireDate')"
            hint="YYYY-MM-DD"
          >
            <pera-input
              formControlName="hireDate"
              placeholder="2026-08-27"
              [error]="errorOf('hireDate')"
            />
          </pera-form-field>
          <pera-form-field
            label="Contract type"
            [required]="true"
            [error]="errorOf('contractType')"
          >
            <pera-select
              formControlName="contractType"
              [options]="contractOptions"
              [error]="errorOf('contractType')"
            />
          </pera-form-field>
          <!-- Department is a SECOND call after create — the create command binds no department. -->
          <pera-form-field label="Department" [required]="true" [error]="errorOf('departmentId')">
            <pera-select
              formControlName="departmentId"
              [options]="departmentOptions()"
              placeholder="Select a department"
              [error]="errorOf('departmentId')"
            />
          </pera-form-field>
          <div class="md:col-span-2">
            <pera-form-field
              label="Emergency contact phone"
              [error]="errorOf('emergencyContactPhone')"
            >
              <pera-input
                type="tel"
                formControlName="emergencyContactPhone"
                [error]="errorOf('emergencyContactPhone')"
              />
            </pera-form-field>
          </div>
          <div class="md:col-span-2">
            <pera-form-field
              label="Phone number"
              [error]="errorOf('phoneNumber')"
              hint="05XXXXXXXX or +966…"
            >
              <pera-input
                type="tel"
                formControlName="phoneNumber"
                [error]="errorOf('phoneNumber')"
              />
            </pera-form-field>
          </div>
          <div class="md:col-span-2">
            <pera-form-field label="Notes" [error]="errorOf('notes')">
              <pera-textarea
                formControlName="notes"
                [rows]="3"
                placeholder="Anything the team should know"
                [error]="errorOf('notes')"
              />
            </pera-form-field>
          </div>
        </div>
      </form>

      <div peraModalFooter class="flex gap-2">
        <pera-button variant="ghost" (click)="close()">Cancel</pera-button>
        <pera-button variant="primary" type="submit" [loading]="submitting()" (click)="submit()">
          Create employee
        </pera-button>
      </div>
    </pera-modal>
  `,
})
export class AddEmployeeDialogComponent implements OnInit {
  private readonly fb = inject(FormBuilder);
  private readonly employees = inject(EmployeeService);
  private readonly lookups = inject(LookupCache);
  private readonly errorHandler = inject(ErrorHandlerService);
  private readonly toast = inject(ToastService);
  private readonly modalRef = inject(PeraModalRef) as PeraModalRef<boolean>;

  readonly form = this.fb.nonNullable.group({
    firstName: ['', [Validators.required, PeraValidators.trimmedLength(1, 80)]],
    lastName: ['', [Validators.required, PeraValidators.trimmedLength(1, 80)]],
    email: ['', [Validators.required, PeraValidators.email]],
    jobTitle: ['', [Validators.required, PeraValidators.trimmedLength(2, 120)]],
    // Required by the backend: a non-nullable DateOnly, validated to sit between 50 years ago and
    // a year from now. The dialog never used to send it, so every create failed on it.
    hireDate: ['', [Validators.required, PeraValidators.isoDate]],
    contractType: ['FullTime', [Validators.required]],
    departmentId: [null as string | null, [Validators.required]],
    phoneNumber: ['', [PeraValidators.phone]],
    emergencyContactPhone: ['', [PeraValidators.phone]],
    notes: ['', [Validators.maxLength(500)]],
  });

  readonly serverError = signal<ParsedApiError | null>(null);
  readonly submitting = signal(false);

  readonly contractOptions: SelectOption[] = CONTRACT_TYPE_OPTIONS;
  private readonly departmentList = signal<SelectOption[]>([]);
  readonly departmentOptions = computed(() => this.departmentList());

  ngOnInit(): void {
    // Read through the shared cache rather than hitting /departments again per dialog open.
    this.lookups
      .departments()
      .subscribe((list) =>
        this.departmentList.set(list.map((d) => ({ value: d.id, label: d.name }))),
      );
  }

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
    // Typed, not double-cast: the old `as unknown as CreateEmployeeRequest` meant the payload was
    // never checked against the model, which is how it kept sending fields nothing bound.
    const payload: CreateEmployeeRequest = {
      firstName: v.firstName.trim(),
      lastName: v.lastName.trim(),
      email: v.email.trim(),
      jobTitle: v.jobTitle.trim(),
      hireDate: v.hireDate.trim(),
      // The enum NAME. This used to send the integer, which `Enum.TryParse` rejects.
      contractType: v.contractType,
      phoneNumber: v.phoneNumber.trim() || null,
      emergencyContactPhone: v.emergencyContactPhone.trim() || null,
      notes: v.notes.trim() || null,
      password: cryptoRandomPassword(16), // TODO(gap-03): switch to invitation flow once backend POST /api/auth/accept-invitation ships
    };

    // Department is the second call `create()` makes for us — it is not part of the command.
    this.employees.create(payload, v.departmentId).subscribe({
      next: () => {
        this.toast.show({
          tone: 'success',
          message: `${v.firstName.trim()} ${v.lastName.trim()} added`,
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
