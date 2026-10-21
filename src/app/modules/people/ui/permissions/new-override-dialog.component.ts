import { ChangeDetectionStrategy, Component, inject, signal } from '@angular/core';
import { FormBuilder, ReactiveFormsModule, Validators } from '@angular/forms';
import { PermissionService } from '../../data/permission.service';
import { ErrorHandlerService, friendly } from '@platform/http/error-handler.service';
import { ToastService } from '@platform/feedback/toast.service';
import { ParsedApiError } from '@platform/types';
import { PermissionRow } from './permission-row';
import { PeraValidators, ServerErrorsDirective, firstErrorMessage } from '@shared/forms';
import {
  PERA_MODAL_DATA,
  PeraButtonComponent,
  PeraFormFieldComponent,
  PeraInputComponent,
  PeraModalComponent,
  PeraModalFooterDirective,
  PeraModalRef,
  PeraRadioComponent,
  PeraSelectComponent,
  PeraTextareaComponent,
} from '@ds';

export interface NewOverrideDialogData {
  targetUserId: string;
  targetName: string;
  permissions: PermissionRow[];
}

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
    PeraRadioComponent,
    PeraTextareaComponent,
    PeraButtonComponent,
  ],
  template: `
    <pera-modal [title]="'New override for ' + data.targetName" size="sm">
      <form [formGroup]="form" [serverErrors]="serverError()" (ngSubmit)="submit()" novalidate>
        <div class="flex flex-col gap-3">
          <pera-form-field label="Permission" [required]="true" [error]="errorOf('permission')">
            <pera-select
              formControlName="permission"
              [options]="permissionOptions"
              placeholder="Select a permission"
              [error]="errorOf('permission')"
            />
          </pera-form-field>
          <pera-form-field label="Type" [required]="true">
            <pera-radio
              formControlName="type"
              [inline]="true"
              [options]="[
                {
                  value: 'grant',
                  label: 'Grant',
                  description: 'Adds the capability on top of roles',
                },
                { value: 'deny', label: 'Deny', description: 'Blocks it even if a role grants it' },
              ]"
            />
          </pera-form-field>
          <pera-form-field label="Reason" [error]="errorOf('reason')" hint="Shown in the audit log">
            <pera-textarea formControlName="reason" [rows]="2" [error]="errorOf('reason')" />
          </pera-form-field>
          @if (form.controls.type.value === 'grant') {
            <pera-form-field
              label="Expires at"
              [error]="errorOf('expiresAt')"
              hint="Optional · YYYY-MM-DD"
            >
              <pera-input
                formControlName="expiresAt"
                placeholder="2026-12-31"
                [error]="errorOf('expiresAt')"
              />
            </pera-form-field>
          }
        </div>
      </form>
      <div peraModalFooter class="flex gap-2">
        <pera-button variant="ghost" (click)="close()">Cancel</pera-button>
        <pera-button variant="primary" [loading]="submitting()" (click)="submit()"
          >Apply override</pera-button
        >
      </div>
    </pera-modal>
  `,
})
export class NewOverrideDialogComponent {
  private readonly fb = inject(FormBuilder);
  private readonly permissionsApi = inject(PermissionService);
  private readonly errorHandler = inject(ErrorHandlerService);
  private readonly toast = inject(ToastService);
  private readonly modalRef = inject(PeraModalRef) as PeraModalRef<boolean>;
  readonly data = inject(PERA_MODAL_DATA) as NewOverrideDialogData;

  readonly permissionOptions = this.data.permissions.map((p) => ({
    value: p.value,
    label: `${p.group} · ${p.displayName}`,
  }));

  readonly form = this.fb.nonNullable.group({
    permission: ['', [Validators.required]],
    type: ['grant' as 'grant' | 'deny', [Validators.required]],
    reason: ['', [Validators.maxLength(300)]],
    expiresAt: ['', [PeraValidators.isoDate]],
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
    const base = {
      targetUserId: this.data.targetUserId,
      permission: v.permission,
      reason: v.reason.trim() || undefined,
    };
    const call =
      v.type === 'grant'
        ? this.permissionsApi.grant({ ...base, expiresAt: v.expiresAt || undefined })
        : this.permissionsApi.deny(base);
    call.subscribe({
      next: () => {
        this.toast.show({
          tone: 'success',
          message: `Override applied to ${this.data.targetName}`,
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
