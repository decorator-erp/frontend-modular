import { ChangeDetectionStrategy, Component, inject, signal } from '@angular/core';
import { FormBuilder, ReactiveFormsModule, Validators } from '@angular/forms';
import { CrmBriefService } from '../../data/crm-brief.service';
import { ErrorHandlerService, friendly } from '@platform/http/error-handler.service';
import { CatalogService } from '@platform/i18n/catalog.service';
import type { BriefSpace, BriefSpaceRequest } from '../../model';
import { ToastService } from '@platform/feedback/toast.service';
import { ParsedApiError } from '@platform/types';
import { ServerErrorsDirective, firstErrorMessage } from '@shared/forms';
import {
  PERA_MODAL_DATA,
  PeraFormFieldComponent,
  PeraFormModalComponent,
  PeraInputComponent,
  PeraModalRef,
  PeraTextareaComponent,
} from '@ds';

export interface SupersedeEntryDialogData {
  projectId: string;
  entry: BriefSpace;
}

/**
 * "New version…" (T076) — the ONLY path offered on a locked entry (FR-010). Since feature
 * 006 an entry is a thin wrapper (a space reference + free text), so a correction is a
 * plain pre-filled form; the new entry keeps its `supersedesSpaceId` trail and the original's
 * `spaceId`. The server reports back only the new id (`{ briefSpaceId }`).
 */
@Component({
  selector: 'app-crm-supersede-entry',
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [
    ReactiveFormsModule,
    ServerErrorsDirective,
    PeraFormFieldComponent,
    PeraFormModalComponent,
    PeraInputComponent,
    PeraTextareaComponent,
  ],
  template: `
    <pera-form-modal
      eyebrow="POST /api/crm/brief-spaces/{spaceId}/supersede"
      [title]="catalog.t('trust.newVersion')"
      permission="crm.briefs.manage"
      [submitLabel]="catalog.t('common.saveEntry')"
      [submittingLabel]="catalog.t('common.saving')"
      [submitting]="submitting()"
      [errorMessage]="serverError()?.generalMessage ?? null"
      [errorCode]="serverError()?.code ?? null"
      (submitted)="submit()"
      (cancelled)="close()"
    >
      <div [formGroup]="form" [serverErrors]="serverError()" class="flex flex-col gap-4">
        <pera-form-field
          [label]="catalog.t('brief.entryReqsL')"
          [required]="true"
          [error]="errorOf('requirements')"
        >
          <pera-textarea
            formControlName="requirements"
            [error]="errorOf('requirements')"
            dir="auto"
          />
        </pera-form-field>
        <pera-form-field
          [label]="catalog.t('brief.entryCountL')"
          [hint]="catalog.t('common.optionalLbl')"
        >
          <pera-input type="number" formControlName="countOrPieces" />
        </pera-form-field>
      </div>
    </pera-form-modal>
  `,
})
export class CrmSupersedeEntryModalComponent {
  private readonly fb = inject(FormBuilder);
  private readonly briefs = inject(CrmBriefService);
  private readonly errorHandler = inject(ErrorHandlerService);
  private readonly toast = inject(ToastService);
  private readonly modalRef = inject(PeraModalRef) as PeraModalRef<boolean>;
  protected readonly catalog = inject(CatalogService);
  readonly data = inject(PERA_MODAL_DATA) as SupersedeEntryDialogData;

  readonly form = this.fb.nonNullable.group({
    requirements: [
      this.data.entry.requirements ?? '',
      [Validators.required, Validators.maxLength(2000)],
    ],
    countOrPieces: [
      this.data.entry.countOrPieces != null ? String(this.data.entry.countOrPieces) : '',
    ],
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

    const request: BriefSpaceRequest = {
      // The correction must stay on the original's space (400 SupersedeSpaceMismatch, 009b #15).
      spaceId: this.data.entry.spaceId,
      requirements: v.requirements.trim(),
      countOrPieces: v.countOrPieces.trim() ? Number(v.countOrPieces) : null,
      projectTaskId: this.data.entry.projectTaskId,
    };

    this.briefs.supersedeSpace(this.data.entry.id, request).subscribe({
      next: () => {
        this.toast.show({ tone: 'success', message: this.catalog.t('common.saved') });
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
