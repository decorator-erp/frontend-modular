import { ChangeDetectionStrategy, Component, inject, signal } from '@angular/core';
import { HttpErrorResponse } from '@angular/common/http';
import { FormsModule } from '@angular/forms';
import { Observable } from 'rxjs';
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
import { ErrorHandlerService, friendly } from '@platform/http/error-handler.service';
import { CatalogService } from '@platform/i18n/catalog.service';
import type { CatalogKey } from '@platform/i18n/catalog/en';
import { PERM } from '@platform/permissions';
import { FileTemplatesService } from '../../data/file-templates.service';
import {
  FILE_TEMPLATE_CATEGORIES,
  FileTemplate,
  FileTemplateCategory,
} from '../../model/file-template.model';

export interface FileTemplateFormDialogData {
  /** Present → edit (name, category, description); absent → create with a file. */
  template?: FileTemplate;
}

/** The file template refusals this dialog names itself (dms Documents.Domain/Errors/Errors.cs). */
export const FILE_TEMPLATE_ERRORS: Record<string, CatalogKey> = {
  'file_templates.NameAlreadyExists': 'ftpl.err.nameTaken',
  'file_templates.NotFound': 'ftpl.err.notFound',
  'file_templates.InvalidFileSize': 'ftpl.dlg.errFile',
};

/**
 * Sync F3: create a file template (`POST /file-templates`, multipart `file`, `name`, `category`,
 * `description?`) or edit one (`PUT /file-templates/{id} { name, category, description }`). The
 * stored file cannot be replaced. Closes with `true` after a save.
 */
@Component({
  selector: 'app-file-template-form-dialog',
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [
    FormsModule,
    PeraFormFieldComponent,
    PeraFormModalComponent,
    PeraInputComponent,
    PeraSelectComponent,
    PeraTextareaComponent,
  ],
  template: `
    <pera-form-modal
      size="md"
      [eyebrow]="isEdit ? 'PUT /api/file-templates/{id}' : 'POST /api/file-templates'"
      [title]="t(isEdit ? 'ftpl.dlg.edit' : 'ftpl.dlg.new')"
      [permission]="perm"
      [cancelLabel]="t('ftpl.dlg.cancel')"
      [submitLabel]="t(isEdit ? 'ftpl.dlg.save' : 'ftpl.dlg.create')"
      [submittingLabel]="t('ftpl.dlg.saving')"
      [submitting]="busy()"
      [errorMessage]="serverError()"
      (submitted)="submit()"
      (cancelled)="ref.close(false)"
    >
      <div class="flex flex-col gap-4">
        <pera-form-field
          [label]="t('ftpl.file')"
          [required]="!isEdit"
          [hint]="isEdit ? t('ftpl.dlg.fileFixed') : ''"
          [error]="shown('file')"
        >
          @if (isEdit) {
            <span class="fs-caption text-text-secondary" data-file-name>{{
              data.template?.fileName
            }}</span>
          } @else {
            <div class="flex items-center gap-2">
              <label
                class="inline-flex items-center px-3 py-1.5 border border-border bg-bg fs-caption cursor-pointer hover:bg-surface-muted"
              >
                {{ t('ftpl.dlg.chooseFile') }}
                <input type="file" class="hidden" (change)="onFile($event)" data-file />
              </label>
              <span class="fs-caption text-text-muted truncate">{{
                file()?.name ?? t('ftpl.dlg.noFile')
              }}</span>
            </div>
          }
        </pera-form-field>
        <pera-form-field [label]="t('ftpl.name')" [required]="true" [error]="shown('name')">
          <pera-input
            [ngModel]="name()"
            (ngModelChange)="name.set($event ?? '')"
            [error]="shown('name')"
            data-name
          />
        </pera-form-field>
        <pera-form-field [label]="t('ftpl.category')" [required]="true">
          <pera-select
            [options]="categoryOptions"
            [ngModel]="category()"
            (ngModelChange)="category.set($event)"
            data-category
          />
        </pera-form-field>
        <pera-form-field [label]="t('ftpl.dlg.description')">
          <pera-textarea
            [rows]="3"
            [ngModel]="description()"
            (ngModelChange)="description.set($event ?? '')"
            data-description
          />
        </pera-form-field>
      </div>
    </pera-form-modal>
  `,
})
export class FileTemplateFormDialogComponent {
  private readonly api = inject(FileTemplatesService);
  private readonly errors = inject(ErrorHandlerService);
  private readonly catalog = inject(CatalogService);
  readonly ref = inject(PeraModalRef) as PeraModalRef<boolean>;
  readonly data = (inject(PERA_MODAL_DATA) as FileTemplateFormDialogData | null) ?? {};

  readonly isEdit = !!this.data.template;
  readonly perm = PERM.fileTemplates.manage;
  readonly categoryOptions: SelectOption[] = FILE_TEMPLATE_CATEGORIES.map((c) => ({
    value: c,
    label: this.t(`ftpl.cat.${c}`),
  }));

  readonly file = signal<File | null>(null);
  readonly name = signal(this.data.template?.name ?? '');
  readonly category = signal<FileTemplateCategory>(this.data.template?.category ?? 'Document');
  readonly description = signal(this.data.template?.description ?? '');
  readonly busy = signal(false);
  readonly serverError = signal<string | null>(null);
  private readonly attempted = signal(false);

  t(key: string): string {
    return this.catalog.t(key as CatalogKey);
  }

  shown(field: 'name' | 'file'): string {
    if (!this.attempted()) return '';
    if (field === 'name' && !this.name().trim()) return this.t('ftpl.dlg.errName');
    if (field === 'file' && !this.isEdit && !this.file()?.size) return this.t('ftpl.dlg.errFile');
    return '';
  }

  onFile(event: Event): void {
    this.file.set((event.target as HTMLInputElement).files?.[0] ?? null);
  }

  submit(): void {
    this.attempted.set(true);
    if (this.shown('name') || this.shown('file') || this.busy()) return;
    const input = {
      name: this.name().trim(),
      category: this.category(),
      description: this.description().trim() || null,
    };
    const call: Observable<unknown> = this.data.template
      ? this.api.update(this.data.template.id, input)
      : this.api.create(this.file()!, input);
    this.busy.set(true);
    this.serverError.set(null);
    call.subscribe({
      next: () => {
        this.busy.set(false);
        this.ref.close(true);
      },
      error: (err: HttpErrorResponse) => {
        this.busy.set(false);
        const parsed = this.errors.parse(err);
        const key = parsed.code ? FILE_TEMPLATE_ERRORS[parsed.code] : undefined;
        this.serverError.set(key ? this.t(key) : friendly(parsed));
      },
    });
  }
}
