import { ChangeDetectionStrategy, Component, inject, signal } from '@angular/core';
import { FormBuilder, ReactiveFormsModule, Validators } from '@angular/forms';
import { Observable, of, switchMap } from 'rxjs';
import { RoleService } from '../../data/role.service';
import { LookupCache } from '../../data/lookup.cache';
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
  PeraTextareaComponent,
} from '@ds';

export interface RoleNameDialogData {
  /** When set, the dialog edits this role instead of creating a new one. */
  roleId?: string;
  currentName?: string;
  currentDescription?: string | null;
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
    PeraTextareaComponent,
    PeraButtonComponent,
  ],
  template: `
    <pera-modal [title]="data?.roleId ? 'Edit role' : 'New role'" size="sm">
      <form [formGroup]="form" [serverErrors]="serverError()" (ngSubmit)="submit()" novalidate>
        <div class="flex flex-col gap-3">
          <pera-form-field label="Role name" [required]="true" [error]="errorOf('roleName')">
            <pera-input
              formControlName="roleName"
              placeholder="e.g. Project coordinator"
              [error]="errorOf('roleName')"
            />
          </pera-form-field>
          <pera-form-field
            label="Description"
            [error]="errorOf('description')"
            hint="Optional · what this role is for"
          >
            <pera-textarea
              formControlName="description"
              [rows]="2"
              [error]="errorOf('description')"
            />
          </pera-form-field>
        </div>
      </form>
      <div peraModalFooter class="flex gap-2">
        <pera-button variant="ghost" (click)="close()">Cancel</pera-button>
        <pera-button variant="primary" [loading]="submitting()" (click)="submit()">
          {{ data?.roleId ? 'Save changes' : 'Create role' }}
        </pera-button>
      </div>
    </pera-modal>
  `,
})
export class RoleNameDialogComponent {
  private readonly fb = inject(FormBuilder);
  private readonly roles = inject(RoleService);
  private readonly lookups = inject(LookupCache);
  private readonly errorHandler = inject(ErrorHandlerService);
  private readonly toast = inject(ToastService);
  private readonly modalRef = inject(PeraModalRef) as PeraModalRef<boolean>;
  readonly data = inject(PERA_MODAL_DATA) as RoleNameDialogData | null;

  readonly form = this.fb.nonNullable.group({
    roleName: [
      this.data?.currentName ?? '',
      [Validators.required, PeraValidators.trimmedLength(2, 60)],
    ],
    description: [this.data?.currentDescription ?? '', [Validators.maxLength(300)]],
  });

  readonly serverError = signal<ParsedApiError | null>(null);
  readonly submitting = signal(false);

  errorOf(name: 'roleName' | 'description'): string {
    const control = this.form.controls[name];
    return control.touched && control.errors ? firstErrorMessage(control.errors) : '';
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
    const raw = this.form.getRawValue();
    const name = raw.roleName.trim();
    const description = raw.description.trim() || null;

    this.save(name, description).subscribe({
      next: () => {
        this.lookups.invalidateRoles();
        this.toast.show({
          tone: 'success',
          message: this.data?.roleId ? `Role ${name} updated` : `Role ${name} created`,
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

  /**
   * `CreateRoleCommand` binds `name` ONLY — there is no way to set a description at create time,
   * so a new role with one needs a follow-up update. `UpdateRoleRequest` binds both and persists
   * both, which is why the description must be sent on every edit: omitting it nulls the stored
   * value, and that is exactly what every rename used to do.
   */
  private save(name: string, description: string | null): Observable<unknown> {
    const roleId = this.data?.roleId;
    if (roleId) {
      return this.roles.update(roleId, name, description);
    }
    return this.roles
      .create(name)
      .pipe(
        switchMap((created) =>
          description ? this.roles.update(created.roleId, name, description) : of(created),
        ),
      );
  }
}
