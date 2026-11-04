import { ChangeDetectionStrategy, Component, inject, signal } from '@angular/core';
import { FormBuilder, ReactiveFormsModule, Validators } from '@angular/forms';
import { ClientService } from '../data/client.service';
import { ErrorHandlerService, friendly } from '@platform/http/error-handler.service';
import { ToastService } from '@platform/feedback/toast.service';
import { CatalogService } from '@platform/i18n/catalog.service';
import { UpdateClientRequest } from '../model/client.model';
import { ParsedApiError } from '@platform/types';
import { ServerErrorsDirective, firstErrorMessage } from '@shared/forms';
import {
  PERA_MODAL_DATA,
  PeraButtonComponent,
  PeraFormFieldComponent,
  PeraInputComponent,
  PeraModalComponent,
  PeraModalFooterDirective,
  PeraModalRef,
} from '@ds';

export interface EditClientDialogData {
  id: string;
  /** Shown in the success toast only. */
  name: string;
  initial: {
    jobTitle: string | null;
    maritalStatus: string | null;
    representativeName: string | null;
  };
}

/**
 * Edit a client's profile through `PUT /api/clients/{id}/profile` (crm-prod M8): job title,
 * marital status and representative name — all the backend can update. Name, phone, address and
 * notes have no update route, so the form no longer offers them (deferred). An emptied field is
 * sent as `null`, which the backend reads as "keep the stored value".
 */
@Component({
  selector: 'app-edit-client-dialog',
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [
    ReactiveFormsModule,
    ServerErrorsDirective,
    PeraModalComponent,
    PeraModalFooterDirective,
    PeraFormFieldComponent,
    PeraInputComponent,
    PeraButtonComponent,
  ],
  template: `
    <pera-modal title="Edit client" size="md">
      <form [formGroup]="form" [serverErrors]="serverError()" (ngSubmit)="submit()" novalidate>
        <p class="m-0 mb-3 fs-label text-text-muted">PUT /api/clients/{{ data?.id }}/profile</p>
        <div class="grid grid-cols-1 gap-3">
          <pera-form-field [label]="catalog.t('clients.fJobTitle')" [error]="errorOf('jobTitle')">
            <pera-input formControlName="jobTitle" [error]="errorOf('jobTitle')" />
          </pera-form-field>
          <pera-form-field
            [label]="catalog.t('clients.fMaritalStatus')"
            [error]="errorOf('maritalStatus')"
          >
            <pera-input formControlName="maritalStatus" [error]="errorOf('maritalStatus')" />
          </pera-form-field>
          <pera-form-field
            [label]="catalog.t('clients.fRepresentativeName')"
            [error]="errorOf('representativeName')"
          >
            <pera-input
              formControlName="representativeName"
              [error]="errorOf('representativeName')"
            />
          </pera-form-field>
        </div>
      </form>

      <div peraModalFooter class="flex items-center justify-between w-full gap-2">
        <span class="fs-label text-text-muted">Requires Clients.Update</span>
        <div class="flex gap-2">
          <pera-button variant="ghost" (click)="close()">Cancel</pera-button>
          <pera-button variant="primary" [loading]="submitting()" (click)="submit()"
            >Save changes</pera-button
          >
        </div>
      </div>
    </pera-modal>
  `,
})
export class EditClientDialogComponent {
  private readonly fb = inject(FormBuilder);
  private readonly clients = inject(ClientService);
  private readonly errorHandler = inject(ErrorHandlerService);
  private readonly toast = inject(ToastService);
  private readonly modalRef = inject(PeraModalRef) as PeraModalRef<boolean>;
  readonly data = inject(PERA_MODAL_DATA) as EditClientDialogData | null;
  protected readonly catalog = inject(CatalogService);

  /** The column lengths `UpdateClientProfileCommandValidator` enforces (128 / 64 / 128). */
  readonly form = this.fb.nonNullable.group({
    jobTitle: [this.data?.initial.jobTitle ?? '', [Validators.maxLength(128)]],
    maritalStatus: [this.data?.initial.maritalStatus ?? '', [Validators.maxLength(64)]],
    representativeName: [this.data?.initial.representativeName ?? '', [Validators.maxLength(128)]],
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
    const id = this.data?.id;
    if (!id || this.form.invalid) {
      this.form.markAllAsTouched();
      return;
    }
    this.submitting.set(true);
    this.serverError.set(null);
    const v = this.form.getRawValue();
    const payload: UpdateClientRequest = {
      jobTitle: v.jobTitle.trim() || null,
      maritalStatus: v.maritalStatus.trim() || null,
      representativeName: v.representativeName.trim() || null,
    };
    this.clients.update(id, payload).subscribe({
      next: () => {
        this.toast.show({
          tone: 'success',
          message: `${this.data?.name ?? ''} updated`.trim(),
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
