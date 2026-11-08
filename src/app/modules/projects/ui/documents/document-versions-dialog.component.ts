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
import { catchError, forkJoin, of } from 'rxjs';
import {
  PERA_MODAL_DATA,
  PeraButtonComponent,
  PeraFormFieldComponent,
  PeraInputComponent,
  PeraModalComponent,
  PeraModalFooterDirective,
  PeraModalRef,
  PeraSelectComponent,
  SelectOption,
} from '@ds';
import { EmployeeService } from '@modules/people';
import { ToastService } from '@platform/feedback/toast.service';
import { ErrorHandlerService, friendly } from '@platform/http/error-handler.service';
import { CatalogService } from '@platform/i18n/catalog.service';
import type { CatalogKey } from '@platform/i18n/catalog/en';
import {
  DocumentVersion,
  DocumentVersionsService,
  lineageOf,
} from '../../data/document-versions.service';

export interface DocumentVersionsDialogData {
  documentId: string;
  projectId: string;
  /** `documents.upload` here: offers "Upload new version". */
  canUpload: boolean;
  /** `documents.update` here: offers "Request review". */
  canRequestReview: boolean;
}

/** The document refusals this dialog names itself (dms Documents.Domain/Errors/Errors.cs). */
const DOC_ERRORS: Record<string, CatalogKey> = {
  'project_documents.Locked': 'docv.err.locked',
  'project_documents.AlreadyLocked': 'docv.err.locked',
  'project_documents.NotLatestVersion': 'docv.err.notLatest',
  'project_documents.ReviewInProgress': 'docv.err.reviewInProgress',
  'project_documents.UploaderNotFound': 'docv.err.noEmployee',
  'project_documents.InvalidFileSize': 'docv.err.emptyFile',
};

/**
 * Sync F2: one document's versions, a new version, and a review request.
 *
 * - **History.** `GET /project-documents/{id}` returns the one row; there is no history endpoint.
 *   The older versions stay active, so the lineage is read from `GET /projects/{id}/documents` by
 *   `rootDocumentId`, newest first. If the list does not have it, only the current row shows.
 * - **New version.** `POST /project-documents/{id}/revisions` (multipart `file`, `description?`).
 * - **Request review.** `POST /project-documents/{id}/request-review { approverEmployeeId }`, latest
 *   version only. An approved review locks the document (Documents.Domain `ProjectDocument.Lock`).
 *
 * A locked document offers neither action. Closes with `true` when something changed.
 */
@Component({
  selector: 'app-document-versions-dialog',
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [
    FormsModule,
    PeraButtonComponent,
    PeraFormFieldComponent,
    PeraInputComponent,
    PeraModalComponent,
    PeraModalFooterDirective,
    PeraSelectComponent,
  ],
  template: `
    <pera-modal [title]="t('docv.title')" size="lg">
      @if (loading()) {
        <p class="m-0 fs-caption text-text-muted">…</p>
      } @else if (!current()) {
        <p class="m-0 fs-caption text-danger" data-load-failed>{{ t('docv.loadFailed') }}</p>
      } @else {
        @let doc = current()!;
        <div class="flex flex-col gap-5">
          <div class="flex items-start gap-3">
            <div class="flex-1 min-w-0">
              <div class="fs-body font-semibold truncate" data-name>{{ doc.fileName }}</div>
              <div class="font-mono fs-micro text-text-muted mt-0.5">
                {{ t('docv.version', { n: doc.version }) }} ·
                {{ t('docv.uploadedOn', { date: date(doc.uploadedOnUtc) }) }}
              </div>
            </div>
            @if (doc.isLocked) {
              <span
                class="inline-flex items-center font-mono fs-micro px-1.5 py-0.5 border border-warning bg-warning-soft text-warning"
                data-locked
                >{{ t('docv.locked') }}</span
              >
            }
          </div>

          @if (doc.isLocked) {
            <p class="m-0 fs-caption text-text-secondary" data-locked-body>
              {{ t('docv.lockedBody') }}
            </p>
          }

          <section>
            <h3 class="m-0 mb-2 font-mono fs-micro uppercase tracking-[0.06em] text-text-muted">
              {{ t('docv.history') }}
            </h3>
            <ul class="m-0 p-0 list-none border border-border divide-y divide-border-soft">
              @for (v of history(); track v.id) {
                <li class="px-3 py-2 flex items-center gap-3" [attr.data-version]="v.version">
                  <span class="font-mono fs-label w-12 shrink-0">{{
                    t('docv.version', { n: v.version })
                  }}</span>
                  <span class="flex-1 min-w-0">
                    <span class="block fs-caption truncate">{{ v.fileName }}</span>
                    @if (v.description) {
                      <span class="block fs-micro text-text-muted truncate">{{
                        v.description
                      }}</span>
                    }
                  </span>
                  <span class="font-mono fs-micro text-text-muted shrink-0">{{
                    date(v.uploadedOnUtc)
                  }}</span>
                  @if (v.id === doc.id) {
                    <span class="font-mono fs-micro text-accent shrink-0">{{
                      t('docv.current')
                    }}</span>
                  }
                  <button
                    type="button"
                    class="font-mono fs-micro text-accent hover:underline cursor-pointer shrink-0"
                    (click)="download(v)"
                    data-download
                  >
                    {{ t('docv.download') }}
                  </button>
                </li>
              }
            </ul>
            @if (history().length === 1 && onlyCurrent()) {
              <p class="m-0 mt-1.5 fs-micro text-text-muted" data-only-current>
                {{ t('docv.historyOnlyCurrent') }}
              </p>
            }
          </section>

          @if (error()) {
            <p class="m-0 fs-caption text-danger" role="alert" data-error>{{ error() }}</p>
          }

          @if (!doc.isLocked && data.canUpload) {
            <section class="flex flex-col gap-2" data-new-version>
              <h3 class="m-0 font-mono fs-micro uppercase tracking-[0.06em] text-text-muted">
                {{ t('docv.newVersion') }}
              </h3>
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
              <pera-form-field [label]="t('docv.description')">
                <pera-input [ngModel]="note()" (ngModelChange)="note.set($event ?? '')" data-note />
              </pera-form-field>
              <div>
                <pera-button
                  variant="secondary"
                  [disabled]="!file() || !!busy()"
                  [loading]="busy() === 'upload'"
                  (click)="uploadVersion()"
                  data-upload
                  >{{ t('docv.upload') }}</pera-button
                >
              </div>
            </section>
          }

          @if (!doc.isLocked && data.canRequestReview && isLatest()) {
            <section class="flex flex-col gap-2" data-review>
              <h3 class="m-0 font-mono fs-micro uppercase tracking-[0.06em] text-text-muted">
                {{ t('docv.requestReview') }}
              </h3>
              @if (requested()) {
                <p class="m-0 fs-caption text-success" data-requested>
                  {{ t('docv.reviewRequested') }}
                </p>
              } @else {
                <pera-form-field [label]="t('docv.reviewer')" [hint]="t('docv.reviewHint')">
                  <pera-select
                    [options]="employees()"
                    [placeholder]="t('docv.pickReviewer')"
                    [ngModel]="approverId()"
                    (ngModelChange)="approverId.set($event ?? '')"
                    data-reviewer
                  />
                </pera-form-field>
                <div>
                  <pera-button
                    variant="secondary"
                    [disabled]="!approverId() || !!busy()"
                    [loading]="busy() === 'review'"
                    (click)="requestReview()"
                    data-send-review
                    >{{ t('docv.send') }}</pera-button
                  >
                </div>
              }
            </section>
          }
        </div>
      }
      <div peraModalFooter class="flex justify-end w-full">
        <pera-button variant="ghost" (click)="close()">{{ t('docv.close') }}</pera-button>
      </div>
    </pera-modal>
  `,
})
export class DocumentVersionsDialogComponent implements OnInit {
  private readonly api = inject(DocumentVersionsService);
  private readonly employeesApi = inject(EmployeeService);
  private readonly errors = inject(ErrorHandlerService);
  private readonly toast = inject(ToastService);
  private readonly catalog = inject(CatalogService);
  private readonly modalRef = inject(PeraModalRef) as PeraModalRef<boolean>;
  readonly data = inject(PERA_MODAL_DATA) as DocumentVersionsDialogData;

  readonly loading = signal(true);
  readonly current = signal<DocumentVersion | null>(null);
  private readonly projectDocs = signal<DocumentVersion[]>([]);
  readonly employees = signal<SelectOption[]>([]);

  readonly file = signal<File | null>(null);
  readonly note = signal('');
  readonly approverId = signal('');
  readonly busy = signal<'upload' | 'review' | null>(null);
  readonly error = signal<string | null>(null);
  readonly requested = signal(false);
  private changed = false;

  /** The lineage from the project list, or the current row alone when the list lacks it. */
  readonly history = computed<DocumentVersion[]>(() => {
    const doc = this.current();
    if (!doc) return [];
    const lineage = lineageOf(this.projectDocs(), doc.rootDocumentId);
    return lineage.some((v) => v.id === doc.id) ? lineage : [doc, ...lineage];
  });
  readonly onlyCurrent = computed(
    () => !lineageOf(this.projectDocs(), this.current()?.rootDocumentId ?? '').length,
  );
  /** Only the newest version of a lineage can be reviewed (`NotLatestVersion`). */
  readonly isLatest = computed(() => this.history()[0]?.id === this.current()?.id);

  ngOnInit(): void {
    this.load(this.data.documentId);
    if (this.data.canRequestReview) {
      this.employeesApi
        .getAll()
        .pipe(catchError(() => of(null)))
        .subscribe((paged) =>
          this.employees.set((paged?.items ?? []).map((e) => ({ value: e.id, label: e.fullName }))),
        );
    }
  }

  t(key: CatalogKey, params?: Record<string, string | number>): string {
    return this.catalog.t(key, params);
  }

  date(iso: string): string {
    const d = new Date(iso);
    if (!iso || Number.isNaN(d.getTime())) return '—';
    return d.toLocaleDateString(this.catalog.locale() === 'ar' ? 'ar' : 'en', {
      year: 'numeric',
      month: 'short',
      day: 'numeric',
    });
  }

  private load(documentId: string): void {
    this.loading.set(true);
    forkJoin({
      doc: this.api.getById(documentId).pipe(catchError(() => of(null))),
      list: this.api.getByProject(this.data.projectId).pipe(catchError(() => of([]))),
    }).subscribe(({ doc, list }) => {
      this.current.set(doc);
      this.projectDocs.set(list);
      this.loading.set(false);
    });
  }

  onFile(event: Event): void {
    const input = event.target as HTMLInputElement;
    this.file.set(input.files?.[0] ?? null);
  }

  uploadVersion(): void {
    const doc = this.current();
    const file = this.file();
    if (!doc || !file || this.busy()) return;
    this.busy.set('upload');
    this.error.set(null);
    this.api.uploadRevision(doc.id, file, this.note()).subscribe({
      next: (newId) => {
        this.busy.set(null);
        this.changed = true;
        this.file.set(null);
        this.note.set('');
        this.toast.show({
          tone: 'success',
          message: this.t('docv.uploaded', { n: this.history()[0].version + 1 }),
        });
        this.requested.set(false);
        this.load(newId || doc.id);
      },
      error: (err: HttpErrorResponse) => this.fail(err),
    });
  }

  requestReview(): void {
    const doc = this.current();
    if (!doc || !this.approverId() || this.busy()) return;
    this.busy.set('review');
    this.error.set(null);
    this.api.requestReview(doc.id, this.approverId()).subscribe({
      next: () => {
        this.busy.set(null);
        this.changed = true;
        this.requested.set(true);
        this.toast.show({ tone: 'success', message: this.t('docv.reviewRequested') });
      },
      error: (err: HttpErrorResponse) => this.fail(err),
    });
  }

  download(v: DocumentVersion): void {
    this.api.download(v.id).subscribe({
      next: (blob) => {
        const url = URL.createObjectURL(blob);
        const a = document.createElement('a');
        a.href = url;
        a.download = v.fileName;
        a.click();
        URL.revokeObjectURL(url);
      },
      error: (err: HttpErrorResponse) => this.fail(err),
    });
  }

  close(): void {
    this.modalRef.close(this.changed);
  }

  private fail(err: HttpErrorResponse): void {
    this.busy.set(null);
    const parsed = this.errors.parse(err);
    const key = parsed.code ? DOC_ERRORS[parsed.code] : undefined;
    this.error.set(key ? this.t(key) : friendly(parsed));
  }
}
