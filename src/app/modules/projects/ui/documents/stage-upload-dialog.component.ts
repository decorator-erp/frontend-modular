import {
  ChangeDetectionStrategy,
  Component,
  OnInit,
  computed,
  inject,
  signal,
} from '@angular/core';
import { HttpErrorResponse } from '@angular/common/http';
import { FormsModule } from '@angular/forms';
import { catchError, of } from 'rxjs';
import {
  PERA_MODAL_DATA,
  PeraFormFieldComponent,
  PeraFormModalComponent,
  PeraInputComponent,
  PeraModalRef,
  PeraSelectComponent,
  SelectOption,
} from '@ds';
import { ErrorHandlerService, friendly } from '@platform/http/error-handler.service';
import { CatalogService } from '@platform/i18n/catalog.service';
import type { CatalogKey } from '@platform/i18n/catalog/en';
import { PERM } from '@platform/permissions';
import { DocumentVersionsService, ScopedFolder } from '../../data/document-versions.service';

export interface StageUploadDialogData {
  stageId: string;
}

/**
 * Sync F2(d): upload a file at stage level — `POST /project-stages/{id}/documents` (multipart
 * `file`, `folderId?`, `description?`; dms DocumentUploadEndpoints.cs:48, `documents.upload`), into
 * one of the stage's folders or none. Closes with `true` after the upload.
 */
@Component({
  selector: 'app-stage-upload-dialog',
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [
    FormsModule,
    PeraFormFieldComponent,
    PeraFormModalComponent,
    PeraInputComponent,
    PeraSelectComponent,
  ],
  template: `
    <pera-form-modal
      size="md"
      eyebrow="POST /api/project-stages/{id}/documents"
      [title]="t('stf.uploadTitle')"
      [permission]="perm"
      [cancelLabel]="t('docv.close')"
      [submitLabel]="t('stf.upload')"
      [submittingLabel]="t('docv.uploading')"
      [submitting]="busy()"
      [submitDisabled]="!file()"
      [errorMessage]="serverError()"
      (submitted)="submit()"
      (cancelled)="ref.close(false)"
    >
      <div class="flex flex-col gap-4">
        <pera-form-field [label]="t('stf.file')" [required]="true">
          <div class="flex items-center gap-2">
            <label
              class="inline-flex items-center px-3 py-1.5 border border-border bg-bg fs-caption cursor-pointer hover:bg-surface-muted"
            >
              {{ t('docv.chooseFile') }}
              <input type="file" class="hidden" (change)="onFile($event)" data-file />
            </label>
            <span class="fs-caption text-text-muted truncate">{{
              file()?.name ?? t('docv.noFile')
            }}</span>
          </div>
        </pera-form-field>
        <pera-form-field [label]="t('stf.folder')">
          <pera-select
            [options]="folderOptions()"
            [placeholder]="t('stf.noFolder')"
            [ngModel]="folderId()"
            (ngModelChange)="folderId.set($event ?? '')"
            data-folder
          />
        </pera-form-field>
        <pera-form-field [label]="t('docv.description')">
          <pera-input [ngModel]="note()" (ngModelChange)="note.set($event ?? '')" data-note />
        </pera-form-field>
      </div>
    </pera-form-modal>
  `,
})
export class StageUploadDialogComponent implements OnInit {
  private readonly api = inject(DocumentVersionsService);
  private readonly errors = inject(ErrorHandlerService);
  private readonly catalog = inject(CatalogService);
  readonly ref = inject(PeraModalRef) as PeraModalRef<boolean>;
  readonly data = inject(PERA_MODAL_DATA) as StageUploadDialogData;

  readonly perm = PERM.documents.upload;
  readonly folders = signal<ScopedFolder[]>([]);
  readonly file = signal<File | null>(null);
  readonly folderId = signal('');
  readonly note = signal('');
  readonly busy = signal(false);
  readonly serverError = signal<string | null>(null);

  readonly folderOptions = computed<SelectOption[]>(() => [
    { value: '', label: this.t('stf.noFolder') },
    ...this.folders().map((f) => ({ value: f.id, label: f.name })),
  ]);

  ngOnInit(): void {
    this.api
      .stageFolders(this.data.stageId)
      .pipe(catchError(() => of([] as ScopedFolder[])))
      .subscribe((list) => this.folders.set(list));
  }

  t(key: CatalogKey, params?: Record<string, string | number>): string {
    return this.catalog.t(key, params);
  }

  onFile(event: Event): void {
    this.file.set((event.target as HTMLInputElement).files?.[0] ?? null);
  }

  submit(): void {
    const file = this.file();
    if (!file || this.busy()) return;
    this.busy.set(true);
    this.serverError.set(null);
    this.api
      .uploadToStage(this.data.stageId, file, this.folderId() || null, this.note())
      .subscribe({
        next: () => {
          this.busy.set(false);
          this.ref.close(true);
        },
        error: (err: HttpErrorResponse) => {
          this.busy.set(false);
          this.serverError.set(friendly(this.errors.parse(err)));
        },
      });
  }
}
