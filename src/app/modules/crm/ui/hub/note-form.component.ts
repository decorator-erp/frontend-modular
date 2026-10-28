import { ChangeDetectionStrategy, Component, inject, signal } from '@angular/core';
import { HttpErrorResponse } from '@angular/common/http';
import { FormBuilder, ReactiveFormsModule, Validators } from '@angular/forms';
import { CrmNoteService } from '../../data/crm-note.service';
import { ErrorHandlerService, friendly } from '@platform/http/error-handler.service';
import { CatalogService } from '@platform/i18n/catalog.service';
import { ToastService } from '@platform/feedback/toast.service';
import { ParsedApiError } from '@platform/types';
import { ServerErrorsDirective, firstErrorMessage } from '@shared/forms';
import {
  PERA_MODAL_DATA,
  PeraFormFieldComponent,
  PeraFormModalComponent,
  PeraModalRef,
  PeraTextareaComponent,
} from '@ds';

export interface NoteFormDialogData {
  clientId: string;
  /** Present for edit, absent for add. */
  noteId?: string;
  initialContent?: string;
  /** Attributed on create only — a note's project scope never changes after the fact. */
  projectId?: string | null;
}

/** Add or edit a client-level internal note — one shared field, two write paths. */
@Component({
  selector: 'app-crm-note-form',
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [
    ReactiveFormsModule,
    ServerErrorsDirective,
    PeraFormModalComponent,
    PeraFormFieldComponent,
    PeraTextareaComponent,
  ],
  template: `
    <pera-form-modal
      [eyebrow]="isEdit ? 'PUT /api/crm/notes/{noteId}' : 'POST /api/crm/clients/{clientId}/notes'"
      [title]="isEdit ? catalog.t('common.edit') : catalog.t('hub.addNote')"
      [permission]="isEdit ? 'crm.notes.update' : 'crm.notes.create'"
      [submitLabel]="catalog.t('common.save')"
      [submittingLabel]="catalog.t('common.saving')"
      [submitting]="submitting()"
      [errorMessage]="serverError()?.generalMessage ?? null"
      [errorCode]="serverError()?.code ?? null"
      (submitted)="submit()"
      (cancelled)="close()"
    >
      <div [formGroup]="form" [serverErrors]="serverError()">
        <pera-form-field
          [label]="catalog.t('hub.noteContent')"
          [required]="true"
          [error]="errorOf('content')"
        >
          <pera-textarea formControlName="content" [rows]="4" [error]="errorOf('content')" />
        </pera-form-field>
      </div>
    </pera-form-modal>
  `,
})
export class CrmNoteFormComponent {
  private readonly fb = inject(FormBuilder);
  private readonly notes = inject(CrmNoteService);
  private readonly errorHandler = inject(ErrorHandlerService);
  private readonly toast = inject(ToastService);
  private readonly modalRef = inject(PeraModalRef) as PeraModalRef<boolean>;
  protected readonly catalog = inject(CatalogService);
  readonly data = inject(PERA_MODAL_DATA) as NoteFormDialogData;

  protected readonly isEdit = !!this.data.noteId;

  readonly form = this.fb.nonNullable.group({
    content: [this.data.initialContent ?? '', [Validators.required, Validators.maxLength(4000)]],
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
    const content = this.form.getRawValue().content.trim();

    const onSuccess = () => {
      this.toast.show({ tone: 'success', message: this.catalog.t('common.saved') });
      this.modalRef.close(true);
    };
    const onError = (err: HttpErrorResponse) => {
      const parsed = this.errorHandler.parse(err);
      this.serverError.set({ ...parsed, generalMessage: friendly(parsed) });
      this.submitting.set(false);
    };

    if (this.isEdit) {
      this.notes
        .update(this.data.noteId!, { content })
        .subscribe({ next: onSuccess, error: onError });
    } else {
      this.notes
        .add(this.data.clientId, { content, projectId: this.data.projectId ?? null })
        .subscribe({ next: onSuccess, error: onError });
    }
  }
}
