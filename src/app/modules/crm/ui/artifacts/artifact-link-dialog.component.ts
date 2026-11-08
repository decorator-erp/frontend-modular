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
import { catchError, of, switchMap } from 'rxjs';
import {
  PERA_MODAL_DATA,
  PeraFormFieldComponent,
  PeraFormModalComponent,
  PeraModalRef,
  PeraRadioComponent,
  PeraSelectComponent,
  RadioOption,
  SelectOption,
} from '@ds';
import { ProjectDocument, ProjectDocumentsService } from '@modules/projects';
import { ErrorHandlerService, friendly } from '@platform/http/error-handler.service';
import { CatalogService } from '@platform/i18n/catalog.service';
import type { CatalogKey } from '@platform/i18n/catalog/en';
import { PERM } from '@platform/permissions';
import { CrmArtifactService } from '../../data/crm-artifact.service';
import type { CrmArtifactSubject } from '../../model';

export interface ArtifactLinkDialogData {
  subject: CrmArtifactSubject;
  subjectId: string;
  projectId: string;
  /** Documents already linked to this subject — left out of the picker. */
  linkedDocumentIds: readonly string[];
}

/**
 * Sync F4c: link a document to a CRM subject — pick one of the project's documents, or upload a file
 * into the project first (`POST /projects/{id}/documents`), then `POST /crm/artifacts { documentId,
 * <subject>Id }` (dms CrmArtifactEndpoints.cs:27, `crm.artifacts.manage`). Closes with `true`.
 */
@Component({
  selector: 'app-crm-artifact-link-dialog',
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [
    FormsModule,
    PeraFormFieldComponent,
    PeraFormModalComponent,
    PeraRadioComponent,
    PeraSelectComponent,
  ],
  template: `
    <pera-form-modal
      size="md"
      eyebrow="POST /api/crm/artifacts"
      [title]="t('artifacts.linkTitle')"
      [permission]="perm"
      [cancelLabel]="t('common.cancel')"
      [submitLabel]="t('artifacts.linkSubmit')"
      [submittingLabel]="t('artifacts.linking')"
      [submitting]="busy()"
      [submitDisabled]="!ready()"
      [errorMessage]="serverError()"
      (submitted)="submit()"
      (cancelled)="ref.close(false)"
    >
      <div class="flex flex-col gap-4">
        <pera-radio
          [inline]="true"
          [options]="modeOptions"
          [ngModel]="mode()"
          (ngModelChange)="mode.set($event)"
          data-mode
        />
        @if (mode() === 'existing') {
          @if (loaded() && !options().length) {
            <p class="m-0 fs-caption text-text-muted" data-no-docs>
              {{ t('artifacts.noDocuments') }}
            </p>
          } @else {
            <pera-form-field [label]="t('artifacts.pickDocument')" [required]="true">
              <pera-select
                [options]="options()"
                [placeholder]="t('artifacts.pickDocument')"
                [ngModel]="documentId()"
                (ngModelChange)="documentId.set($event ?? '')"
                data-document
              />
            </pera-form-field>
          }
        } @else {
          <div class="flex items-center gap-2">
            <label
              class="inline-flex items-center px-3 py-1.5 border border-border bg-bg fs-caption cursor-pointer hover:bg-surface-muted"
            >
              {{ t('artifacts.chooseFile') }}
              <input type="file" class="hidden" (change)="onFile($event)" data-file />
            </label>
            <span class="fs-caption text-text-muted truncate">{{
              file()?.name ?? t('artifacts.noFile')
            }}</span>
          </div>
        }
      </div>
    </pera-form-modal>
  `,
})
export class CrmArtifactLinkDialogComponent implements OnInit {
  private readonly api = inject(CrmArtifactService);
  private readonly documents = inject(ProjectDocumentsService);
  private readonly errors = inject(ErrorHandlerService);
  private readonly catalog = inject(CatalogService);
  readonly ref = inject(PeraModalRef) as PeraModalRef<boolean>;
  readonly data = inject(PERA_MODAL_DATA) as ArtifactLinkDialogData;

  readonly perm = PERM.crm.artifacts.manage;
  readonly modeOptions: RadioOption[] = [
    { value: 'existing', label: this.t('artifacts.linkExisting') },
    { value: 'upload', label: this.t('artifacts.linkUpload') },
  ];
  readonly mode = signal<'existing' | 'upload'>('existing');
  readonly docs = signal<ProjectDocument[]>([]);
  readonly loaded = signal(false);
  readonly documentId = signal('');
  readonly file = signal<File | null>(null);
  readonly busy = signal(false);
  readonly serverError = signal<string | null>(null);

  readonly options = computed<SelectOption[]>(() => {
    const linked = new Set(this.data.linkedDocumentIds);
    return this.docs()
      .filter((d) => !linked.has(d.id))
      .map((d) => ({ value: d.id, label: d.fileName }));
  });
  readonly ready = computed(() =>
    this.mode() === 'existing' ? !!this.documentId() : !!this.file()?.size,
  );

  ngOnInit(): void {
    this.documents
      .getByProject(this.data.projectId)
      .pipe(catchError(() => of<ProjectDocument[]>([])))
      .subscribe((list) => {
        this.docs.set(list);
        this.loaded.set(true);
      });
  }

  t(key: string): string {
    return this.catalog.t(key as CatalogKey);
  }

  onFile(event: Event): void {
    this.file.set((event.target as HTMLInputElement).files?.[0] ?? null);
  }

  submit(): void {
    if (!this.ready() || this.busy()) return;
    const { subject, subjectId, projectId } = this.data;
    const documentId$ =
      this.mode() === 'existing'
        ? of(this.documentId())
        : this.documents.upload(projectId, this.file()!);
    this.busy.set(true);
    this.serverError.set(null);
    documentId$.pipe(switchMap((id) => this.api.link(subject, subjectId, id))).subscribe({
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
