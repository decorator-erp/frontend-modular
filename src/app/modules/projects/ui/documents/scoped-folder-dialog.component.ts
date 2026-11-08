import { ChangeDetectionStrategy, Component, inject, signal } from '@angular/core';
import { HttpErrorResponse } from '@angular/common/http';
import { FormsModule } from '@angular/forms';
import {
  PERA_MODAL_DATA,
  PeraFormFieldComponent,
  PeraFormModalComponent,
  PeraInputComponent,
  PeraModalRef,
} from '@ds';
import { ErrorHandlerService, friendly } from '@platform/http/error-handler.service';
import { CatalogService } from '@platform/i18n/catalog.service';
import type { CatalogKey } from '@platform/i18n/catalog/en';
import { PERM } from '@platform/permissions';
import { DocumentVersionsService } from '../../data/document-versions.service';

export interface ScopedFolderDialogData {
  scope: 'stage' | 'task';
  /** The project stage or project task id. */
  scopeId: string;
}

/**
 * Sync F2(e): a folder at stage or task level — `POST /project-stages/{id}/document-folders` or
 * `POST /project-tasks/{id}/document-folders` `{ name, parentFolderId: null }` (dms
 * DocumentFolderEndpoints.cs:71,89; `documents.upload`). Closes with the new folder id.
 */
@Component({
  selector: 'app-scoped-folder-dialog',
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [FormsModule, PeraFormFieldComponent, PeraFormModalComponent, PeraInputComponent],
  template: `
    <pera-form-modal
      size="sm"
      [eyebrow]="
        data.scope === 'stage'
          ? 'POST /api/project-stages/{id}/document-folders'
          : 'POST /api/project-tasks/{id}/document-folders'
      "
      [title]="t('fld.title')"
      [permission]="perm"
      [cancelLabel]="t('docv.close')"
      [submitLabel]="t('fld.create')"
      [submittingLabel]="t('fld.creating')"
      [submitting]="busy()"
      [errorMessage]="serverError()"
      (submitted)="submit()"
      (cancelled)="ref.close()"
    >
      <pera-form-field [label]="t('fld.name')" [required]="true" [error]="nameError()">
        <pera-input
          [ngModel]="name()"
          (ngModelChange)="name.set($event ?? '')"
          [error]="nameError()"
          data-folder-name
        />
      </pera-form-field>
    </pera-form-modal>
  `,
})
export class ScopedFolderDialogComponent {
  private readonly api = inject(DocumentVersionsService);
  private readonly errors = inject(ErrorHandlerService);
  private readonly catalog = inject(CatalogService);
  readonly ref = inject(PeraModalRef) as PeraModalRef<string>;
  readonly data = inject(PERA_MODAL_DATA) as ScopedFolderDialogData;

  readonly perm = PERM.documents.upload;
  readonly name = signal('');
  readonly nameError = signal('');
  readonly busy = signal(false);
  readonly serverError = signal<string | null>(null);

  t(key: CatalogKey): string {
    return this.catalog.t(key);
  }

  submit(): void {
    const name = this.name().trim();
    this.nameError.set(name ? '' : this.t('fld.errName'));
    if (!name || this.busy()) return;
    this.busy.set(true);
    this.serverError.set(null);
    const call =
      this.data.scope === 'stage'
        ? this.api.createStageFolder(this.data.scopeId, name)
        : this.api.createTaskFolder(this.data.scopeId, name);
    call.subscribe({
      next: (id) => {
        this.busy.set(false);
        this.ref.close(id);
      },
      error: (err: HttpErrorResponse) => {
        this.busy.set(false);
        this.serverError.set(friendly(this.errors.parse(err)));
      },
    });
  }
}
