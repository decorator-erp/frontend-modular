import { ChangeDetectionStrategy, Component, inject, signal } from '@angular/core';
import { FormBuilder, ReactiveFormsModule, Validators } from '@angular/forms';
import type { Observable } from 'rxjs';
import type { HttpErrorResponse } from '@angular/common/http';
import { CrmSpaceService } from '../../data/crm-space.service';
import { ErrorHandlerService } from '@platform/http/error-handler.service';
import { CatalogService } from '@platform/i18n/catalog.service';
import type { CatalogKey } from '@platform/i18n/catalog/en';
import { ToastService } from '@platform/feedback/toast.service';
import { ParsedApiError } from '@platform/types';
import type { CrmSpace, CrmSpaceType } from '../../model';
import { ServerErrorsDirective, firstErrorMessage } from '@shared/forms';
import {
  PERA_MODAL_DATA,
  PeraFormFieldComponent,
  PeraFormModalComponent,
  PeraInputComponent,
  PeraModalRef,
  PeraSelectComponent,
  PeraTextareaComponent,
  SelectOption,
} from '@ds';
import { SpacesStore } from '../../stores/spaces.store';
import type { MutationHandlers } from '../../stores/mutation-handlers';
import { domainErrorKey } from '../domain-error-key';

export interface AddSpaceDialogData {
  projectId: string;
  spaceTypes: CrmSpaceType[];
  /** Present ⇒ rename/retype that space instead of creating a new one. */
  existing?: CrmSpace;
}

/**
 * Create a project space (a real room), or rename/retype an existing one. Two spaces of
 * one type is the point — "Kids room 1" and "Kids room 2" are distinct rooms.
 */
@Component({
  selector: 'app-crm-add-space-dialog',
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [
    ReactiveFormsModule,
    ServerErrorsDirective,
    PeraFormModalComponent,
    PeraFormFieldComponent,
    PeraInputComponent,
    PeraSelectComponent,
    PeraTextareaComponent,
  ],
  template: `
    <pera-form-modal
      [eyebrow]="
        isEdit ? 'PUT /api/crm/spaces/{spaceId}' : 'POST /api/crm/projects/{projectId}/spaces'
      "
      [title]="isEdit ? catalog.t('space.rename') : catalog.t('space.newSpace')"
      permission="crm.spaces.manage"
      [submitLabel]="isEdit ? catalog.t('space.save') : catalog.t('space.addSpace')"
      [submittingLabel]="catalog.t('common.saving')"
      [submitting]="submitting()"
      [errorMessage]="serverError()?.generalMessage ?? null"
      [errorCode]="serverError()?.code ?? null"
      (submitted)="submit()"
      (cancelled)="close()"
    >
      <div [formGroup]="form" [serverErrors]="serverError()" class="flex flex-col gap-4">
        <pera-form-field
          [label]="catalog.t('space.spaceNameL')"
          [required]="true"
          [error]="errorOf('name')"
        >
          <pera-input formControlName="name" dir="auto" [error]="errorOf('name')" />
        </pera-form-field>
        <pera-form-field [label]="catalog.t('space.spaceTypeL')" [required]="true">
          <pera-select formControlName="spaceTypeId" [options]="typeOptions" />
        </pera-form-field>
        <pera-form-field
          [label]="catalog.t('space.descriptionL')"
          [hint]="catalog.t('space.descriptionHint')"
          [error]="errorOf('description')"
        >
          <pera-textarea formControlName="description" dir="auto" [rows]="3" />
        </pera-form-field>
      </div>
    </pera-form-modal>
  `,
})
export class CrmAddSpaceDialogComponent {
  private readonly fb = inject(FormBuilder);
  private readonly api = inject(CrmSpaceService);
  /**
   * OPTIONAL by necessity: this dialog has two hosts. The spaces page lends its injector, so
   * the store is present and owns the write (flags, keyed error, refetch). The brief's
   * add-entry form — itself a modal, on a route with no `SpacesStore` — gets `null` and takes
   * the direct-API fallback below. Both paths share `succeed()`/`fail()`, so the translated
   * banner is identical either way.
   */
  private readonly store = inject(SpacesStore, { optional: true });
  private readonly errorHandler = inject(ErrorHandlerService);
  private readonly toast = inject(ToastService);
  private readonly modalRef = inject(PeraModalRef) as PeraModalRef<boolean>;
  protected readonly catalog = inject(CatalogService);
  readonly data = inject(PERA_MODAL_DATA) as AddSpaceDialogData;

  protected readonly typeOptions: SelectOption[] = this.data.spaceTypes.map((s) => ({
    value: s.id,
    label: this.catalog.locale() === 'ar' ? s.nameAr || s.nameEn : s.nameEn,
  }));

  readonly isEdit = !!this.data.existing;

  readonly form = this.fb.nonNullable.group({
    name: [this.data.existing?.name ?? '', [Validators.required, Validators.maxLength(120)]],
    spaceTypeId: [this.data.existing?.spaceType.id ?? '', [Validators.required]],
    description: [this.data.existing?.description ?? '', [Validators.maxLength(2000)]],
  });

  readonly serverError = signal<ParsedApiError | null>(null);
  readonly submitting = signal(false);

  errorOf(name: string): string {
    const control = this.form.get(name);
    if (!control || !control.touched || !control.errors) return '';
    // `description` is the one field whose overflow message must be translated — the
    // dialog is bilingual and a raw English "Must be at most…" would leak onto an Arabic
    // screen. The other fields' validators (required/maxLength on name) stay on the
    // English default, matching every other CRM dialog's `errorOf`.
    if (name === 'description' && control.errors['maxlength']) {
      return this.catalog.t('space.descriptionTooLong', {
        max: control.errors['maxlength'].requiredLength,
      });
    }
    return firstErrorMessage(control.errors);
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
    // Sent on BOTH create and rename — `update()` is a full-replacement PUT, so a rename
    // that omitted this would silently wipe the description (see the model's own doc).
    // Trimmed client-side; a whitespace-only box goes as `null`, matching the backend's
    // own trim-or-null normalization rather than round-tripping "  " as a real value.
    const body = {
      spaceTypeId: v.spaceTypeId,
      name: v.name.trim(),
      description: v.description.trim() || null,
    };

    if (this.store) {
      const handlers: MutationHandlers = {
        onDone: () => this.succeed(),
        onError: (parsed, fallback) => this.fail(parsed, fallback),
      };
      // The store reads its own `projectId`; the spaces page loads it in its constructor,
      // so it is always set by the time this dialog can be opened from there.
      if (this.data.existing) {
        this.store.renameSpace(this.data.existing.id, body, handlers);
      } else {
        this.store.createSpace(body, handlers);
      }
      return;
    }

    // `update` yields void and `create` a bare id — neither result is used here.
    const call: Observable<unknown> = this.data.existing
      ? this.api.update(this.data.existing.id, body)
      : this.api.create(this.data.projectId, body);

    call.subscribe({
      next: () => this.succeed(),
      error: (err: HttpErrorResponse) => this.fail(this.errorHandler.parse(err)),
    });
  }

  private succeed(): void {
    this.toast.show({
      tone: 'success',
      message: this.catalog.t(this.isEdit ? 'space.renamed' : 'space.created'),
    });
    this.modalRef.close(true);
  }

  /**
   * The banner message is a TRANSLATED catalog key, never `friendly(parsed)` — that resolves
   * through the English-only `ERROR_MESSAGES`, which would put English on an Arabic screen.
   * The untouched `parsed` still feeds `[serverErrors]` for field-level errors.
   */
  private fail(parsed: ParsedApiError, fallback: CatalogKey = 'space.saveFailed'): void {
    this.serverError.set({
      ...parsed,
      generalMessage: this.catalog.t(domainErrorKey(parsed.code, fallback)),
    });
    this.submitting.set(false);
  }
}
