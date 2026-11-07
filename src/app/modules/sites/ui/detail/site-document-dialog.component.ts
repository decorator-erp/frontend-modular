import { ChangeDetectionStrategy, Component, computed, inject, signal } from '@angular/core';
import { FormsModule } from '@angular/forms';
import {
  PERA_MODAL_DATA,
  PeraAlertComponent,
  PeraFormFieldComponent,
  PeraFormModalComponent,
  PeraModalRef,
  PeraSelectComponent,
  type SelectOption,
} from '@ds';
import { CatalogService } from '@platform/i18n/catalog.service';
import { SITE_DOCUMENT_KIND_LABEL, SiteDocumentKind } from '../../model/site-enums';
import type { WriteOutcome } from '../../model/site-errors';

export interface SiteDocumentDialogRequest {
  file: File | null;
  documentId: string | null;
  kind: SiteDocumentKind;
  recordId: string | null;
}

export interface SiteDocumentDialogData {
  mode: 'upload' | 'link';
  /** Attach existing: the project's documents (id → file name). */
  documents: SelectOption[];
  /** "Whole survey" (null) + one entry per record (`<moduleCode> · <label>`). */
  subjects: SelectOption[];
  save: (req: SiteDocumentDialogRequest) => Promise<WriteOutcome>;
}

/**
 * sites S-9: Upload (file → project documents → link) or Attach existing (a project document →
 * link), with kind and subject (prototype `sites.link` / `sites.upload`, `sites.js:722-747`). The
 * link refusals (409 `DocumentAlreadyLinked`, 404 `DocumentNotFound`, 400 `InvalidDocumentSubject`,
 * 409 `SiteLocked`) show inline here.
 */
@Component({
  selector: 'app-site-document-dialog',
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [
    FormsModule,
    PeraAlertComponent,
    PeraFormFieldComponent,
    PeraFormModalComponent,
    PeraSelectComponent,
  ],
  template: `
    <pera-form-modal
      size="md"
      [title]="catalog.t(data.mode === 'upload' ? 'sv.uploadDoc' : 'sv.linkDoc')"
      [subtitle]="catalog.t(data.mode === 'upload' ? 'sv.uploadSub' : 'sv.linkDocSub')"
      [submitLabel]="catalog.t(data.mode === 'upload' ? 'sv.uploadAndLink' : 'sv.link')"
      [cancelLabel]="catalog.t('sv.cancel')"
      [submitting]="saving()"
      [errorMessage]="banner()"
      [errorCode]="bannerCode()"
      (submitted)="submit()"
      (cancelled)="ref.close()"
    >
      <div class="flex flex-col gap-4">
        @if (data.mode === 'upload') {
          <pera-form-field
            [label]="catalog.t('sv.file')"
            [required]="true"
            [error]="fileError() ?? undefined"
          >
            <input
              type="file"
              class="block w-full fs-body-sm text-text-secondary"
              accept="image/*,video/*,application/pdf"
              [attr.aria-label]="catalog.t('sv.file')"
              (change)="pickFile($event)"
              data-file
            />
          </pera-form-field>
        } @else {
          @if (data.documents.length === 0) {
            <pera-alert tone="info" data-no-project-docs>{{
              catalog.t('sv.noProjectDocs')
            }}</pera-alert>
          }
          <pera-form-field
            [label]="catalog.t('sv.document')"
            [required]="true"
            [error]="docError() ?? undefined"
          >
            <pera-select
              [options]="data.documents"
              placeholder="—"
              [ngModel]="documentId()"
              (ngModelChange)="documentId.set($event)"
              data-document
            />
          </pera-form-field>
        }
        <div class="grid gap-4 sm:grid-cols-2">
          <pera-form-field [label]="catalog.t('sv.kind')" [required]="true">
            <pera-select
              [options]="kinds()"
              [ngModel]="kind()"
              (ngModelChange)="kind.set($event)"
              data-kind
            />
          </pera-form-field>
          <pera-form-field [label]="catalog.t('sv.attachTo')">
            <pera-select
              [options]="data.subjects"
              [ngModel]="recordId()"
              (ngModelChange)="recordId.set($event)"
              data-subject
            />
          </pera-form-field>
        </div>
      </div>
    </pera-form-modal>
  `,
})
export class SiteDocumentDialogComponent {
  readonly ref = inject(PeraModalRef) as PeraModalRef<boolean>;
  readonly data = inject(PERA_MODAL_DATA) as SiteDocumentDialogData;
  protected readonly catalog = inject(CatalogService);

  protected readonly kinds = computed<SelectOption[]>(() =>
    Object.values(SiteDocumentKind).map((k) => ({
      value: k,
      label: this.catalog.t(SITE_DOCUMENT_KIND_LABEL[k]),
    })),
  );

  readonly file = signal<File | null>(null);
  readonly documentId = signal<string | null>(null);
  readonly kind = signal<SiteDocumentKind>(SiteDocumentKind.Photo);
  readonly recordId = signal<string | null>(null);
  readonly saving = signal(false);
  readonly banner = signal<string | null>(null);
  readonly bannerCode = signal<string | null>(null);
  readonly fileError = signal<string | null>(null);
  readonly docError = signal<string | null>(null);

  protected pickFile(event: Event): void {
    const files = (event.target as HTMLInputElement).files;
    this.file.set(files && files.length ? files[0] : null);
    this.fileError.set(null);
  }

  async submit(): Promise<void> {
    if (this.saving()) return;
    const upload = this.data.mode === 'upload';
    this.fileError.set(upload && !this.file() ? this.catalog.t('sv.err.pickFile') : null);
    this.docError.set(!upload && !this.documentId() ? this.catalog.t('sv.err.pickDoc') : null);
    if (this.fileError() || this.docError()) return;
    this.banner.set(null);
    this.bannerCode.set(null);
    this.saving.set(true);
    const outcome = await this.data.save({
      file: upload ? this.file() : null,
      documentId: upload ? null : this.documentId(),
      kind: this.kind(),
      recordId: this.recordId() || null,
    });
    this.saving.set(false);
    if (outcome.ok) return this.ref.close(true);
    if (outcome.reloaded) return this.ref.close(false);
    this.banner.set(outcome.message ?? null);
    this.bannerCode.set(outcome.code ?? null);
  }
}
