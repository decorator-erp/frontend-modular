import { ChangeDetectionStrategy, Component, inject, signal } from '@angular/core';
import { FormBuilder, ReactiveFormsModule, Validators } from '@angular/forms';
import { ClientService } from '../data/client.service';
import { ErrorHandlerService, friendly } from '@platform/http/error-handler.service';
import { ToastService } from '@platform/feedback/toast.service';
import { CatalogService } from '@platform/i18n/catalog.service';
import { CreateClientRequest } from '../model/client.model';
import { ParsedApiError } from '@platform/types';
import { PeraValidators, ServerErrorsDirective, firstErrorMessage } from '@shared/forms';
import { cryptoRandomPassword } from '@shared/ui/password';
import {
  LoginCredentialsComponent,
  type IssuedLogin,
} from '@shared/ui/login-credentials.component';
import {
  PeraButtonComponent,
  PeraFormFieldComponent,
  PeraInputComponent,
  PeraModalComponent,
  PeraModalFooterDirective,
  PeraModalRef,
  PeraTextareaComponent,
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
    PeraTextareaComponent,
    PeraButtonComponent,
    LoginCredentialsComponent,
  ],
  template: `
    <pera-modal [title]="issued() ? catalog.t('creds.title') : 'Add client'" size="md">
      @if (issued(); as login) {
        <!-- LC-2: the new client's sign-in details, shown once. -->
        <app-login-credentials [login]="login" />
      } @else {
        <form [formGroup]="form" [serverErrors]="serverError()" (ngSubmit)="submit()" novalidate>
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
            <div class="md:col-span-2">
              <pera-form-field
                label="Phone"
                [required]="true"
                [error]="errorOf('phone')"
                hint="05XXXXXXXX or +966…"
              >
                <pera-input type="tel" formControlName="phone" [error]="errorOf('phone')" />
              </pera-form-field>
            </div>
            <div class="md:col-span-2">
              <pera-form-field label="Address" [required]="true" [error]="errorOf('address')">
                <pera-textarea
                  formControlName="address"
                  [rows]="2"
                  placeholder="District, city"
                  [error]="errorOf('address')"
                />
              </pera-form-field>
            </div>
            <div class="md:col-span-2">
              <pera-form-field label="Notes" [error]="errorOf('notes')">
                <pera-textarea
                  formControlName="notes"
                  [rows]="3"
                  placeholder="Project interests, preferences…"
                  [error]="errorOf('notes')"
                />
              </pera-form-field>
            </div>
          </div>
        </form>
      }

      <div peraModalFooter class="flex gap-2">
        @if (issued()) {
          <pera-button variant="primary" data-testid="credentials-done" (click)="finish()">{{
            catalog.t('creds.done')
          }}</pera-button>
        } @else {
          <pera-button variant="ghost" (click)="close()">Cancel</pera-button>
          <pera-button variant="primary" [loading]="submitting()" (click)="submit()"
            >Create client</pera-button
          >
        }
      </div>
    </pera-modal>
  `,
})
export class AddClientDialogComponent {
  private readonly fb = inject(FormBuilder);
  private readonly clients = inject(ClientService);
  private readonly errorHandler = inject(ErrorHandlerService);
  private readonly toast = inject(ToastService);
  private readonly modalRef = inject(PeraModalRef) as PeraModalRef<boolean>;

  readonly form = this.fb.nonNullable.group({
    firstName: ['', [Validators.required, PeraValidators.trimmedLength(1, 80)]],
    lastName: ['', [Validators.required, PeraValidators.trimmedLength(1, 80)]],
    email: ['', [Validators.required, PeraValidators.email]],
    phone: ['', [Validators.required, PeraValidators.phone]],
    address: ['', [Validators.required, PeraValidators.trimmedLength(5, 300)]],
    notes: ['', [Validators.maxLength(500)]],
  });

  readonly serverError = signal<ParsedApiError | null>(null);
  readonly submitting = signal(false);
  readonly catalog = inject(CatalogService);
  /** LC-2: the created client's sign-in details, shown once before the dialog closes. */
  readonly issued = signal<IssuedLogin | null>(null);

  errorOf(name: string): string {
    const control = this.form.get(name);
    return control && control.touched && control.errors ? firstErrorMessage(control.errors) : '';
  }

  close(): void {
    this.modalRef.close(false);
  }

  /** Closes after the credentials were shown; `true` = a client was created (the list reloads). */
  finish(): void {
    this.modalRef.close(true);
  }

  submit(): void {
    if (this.form.invalid) {
      this.form.markAllAsTouched();
      return;
    }
    this.submitting.set(true);
    this.serverError.set(null);
    const v = this.form.getRawValue();
    const payload: CreateClientRequest = {
      firstName: v.firstName.trim(),
      lastName: v.lastName.trim(),
      email: v.email.trim(),
      phone: v.phone.trim(),
      address: v.address.trim(),
      notes: v.notes.trim() || undefined,
      password: cryptoRandomPassword(16), // TODO(gap-03): switch to invitation flow once backend POST /api/auth/accept-invitation ships
    };

    this.clients.create(payload).subscribe({
      next: () => {
        this.toast.show({
          tone: 'success',
          message: `${payload.firstName} ${payload.lastName} added`,
        });
        this.submitting.set(false);
        this.issued.set({ email: payload.email, password: payload.password });
      },
      error: (err) => {
        const parsed = this.errorHandler.parse(err);
        this.serverError.set({ ...parsed, generalMessage: friendly(parsed) });
        this.submitting.set(false);
      },
    });
  }
}
