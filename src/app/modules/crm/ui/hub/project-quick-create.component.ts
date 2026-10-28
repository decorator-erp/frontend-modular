import { ChangeDetectionStrategy, Component, inject, signal } from '@angular/core';
import { FormBuilder, ReactiveFormsModule, Validators } from '@angular/forms';
import { ProjectService } from '@modules/projects';
import { ErrorHandlerService, friendly } from '@platform/http/error-handler.service';
import { CatalogService } from '@platform/i18n/catalog.service';
import { ToastService } from '@platform/feedback/toast.service';
import { CreateProjectRequest } from '@modules/projects';
import { ParsedApiError } from '@platform/types';
import { PeraValidators, ServerErrorsDirective, firstErrorMessage } from '@shared/forms';
import {
  PERA_MODAL_DATA,
  PeraFormFieldComponent,
  PeraFormModalComponent,
  PeraInputComponent,
  PeraModalRef,
} from '@ds';

export interface ProjectQuickCreateDialogData {
  clientId: string;
}

/**
 * The hub's "New project" quick-create (B5) — a minimal `FreeStyle` project with no
 * stage template, so the gathering workspace can start on it immediately. Fewer fields
 * than the full `/projects/new` page (no stage template, dates, description) because
 * this path exists purely to unblock a client with zero projects.
 */
@Component({
  selector: 'app-crm-project-quick-create',
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [
    ReactiveFormsModule,
    ServerErrorsDirective,
    PeraFormModalComponent,
    PeraFormFieldComponent,
    PeraInputComponent,
  ],
  template: `
    <pera-form-modal
      eyebrow="POST /api/projects"
      [title]="catalog.t('hub.newProject')"
      permission="project.create"
      [submitLabel]="catalog.t('common.save')"
      [submittingLabel]="catalog.t('common.saving')"
      [submitting]="submitting()"
      [errorMessage]="serverError()?.generalMessage ?? null"
      [errorCode]="serverError()?.code ?? null"
      (submitted)="submit()"
      (cancelled)="close()"
    >
      <div [formGroup]="form" [serverErrors]="serverError()" class="flex flex-col gap-4">
        <pera-form-field
          [label]="catalog.t('hub.projectName')"
          [required]="true"
          [error]="errorOf('name')"
        >
          <pera-input formControlName="name" [error]="errorOf('name')" />
        </pera-form-field>
        <pera-form-field
          [label]="catalog.t('hub.projectCode')"
          [required]="true"
          [error]="errorOf('code')"
        >
          <pera-input formControlName="code" [error]="errorOf('code')" dir="ltr" />
        </pera-form-field>
        <pera-form-field
          [label]="catalog.t('brief.fAddress')"
          [required]="true"
          [error]="errorOf('address')"
        >
          <pera-input formControlName="address" [error]="errorOf('address')" />
        </pera-form-field>
      </div>
    </pera-form-modal>
  `,
})
export class CrmProjectQuickCreateComponent {
  private readonly fb = inject(FormBuilder);
  private readonly projects = inject(ProjectService);
  private readonly errorHandler = inject(ErrorHandlerService);
  private readonly toast = inject(ToastService);
  private readonly modalRef = inject(PeraModalRef) as PeraModalRef<string | false>;
  protected readonly catalog = inject(CatalogService);
  readonly data = inject(PERA_MODAL_DATA) as ProjectQuickCreateDialogData;

  readonly form = this.fb.nonNullable.group({
    name: ['', [Validators.required, PeraValidators.trimmedLength(2, 200)]],
    code: ['', [Validators.required, PeraValidators.trimmedLength(2, 32)]],
    address: ['', [Validators.required, PeraValidators.trimmedLength(5, 300)]],
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

    const payload = {
      code: v.code.trim(),
      name: v.name.trim(),
      address: v.address.trim(),
      clientId: this.data.clientId,
      workflowType: 'FreeStyle',
      stageTemplateId: null,
    } satisfies CreateProjectRequest;

    this.projects.create(payload).subscribe({
      next: (id) => {
        this.toast.show({ tone: 'success', message: this.catalog.t('common.saved') });
        this.modalRef.close(id);
      },
      error: (err) => {
        const parsed = this.errorHandler.parse(err);
        this.serverError.set({ ...parsed, generalMessage: friendly(parsed) });
        this.submitting.set(false);
      },
    });
  }
}
