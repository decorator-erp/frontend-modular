import { ChangeDetectionStrategy, Component, effect, inject, input, signal } from '@angular/core';
import { CanDirective, PERM } from '@platform/permissions';
import {
  DocumentFoldersService,
  ProjectDocument,
  ProjectDocumentsService,
} from '@modules/projects';
import { CatalogService } from '@platform/i18n/catalog.service';
import { PeraButtonComponent, PeraEmptyComponent } from '@ds';

/** Seeded server-side in the same transaction that opens the requirement period. */
const FOLDER_NAME = 'Requirement gathering';

/**
 * The brief attachments card (T065, Dependency 6) — unit photos & floor plans, stored
 * via the EXISTING `ProjectDocumentsService.upload()` against the "Requirement
 * gathering" folder (seeded on period open; exists by the time any CRM screen renders).
 *
 * ⚠️ Scope note: this is the general project-documents surface (Dependency 6), not the
 * finer-grained `crm.artifacts` per-subject link (`POST /api/crm/artifacts`, which ties
 * one document to one BriefSpace/RequirementItem/Meeting and is what the designer
 * profile's confirmed-only `AttachmentBlock` filters by, B6c). No B3 task assigns that
 * linking UI; only the plain upload-into-the-shared-folder card does.
 */
@Component({
  selector: 'app-crm-brief-attachments',
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [CanDirective, PeraButtonComponent, PeraEmptyComponent],
  host: { class: 'block' },
  template: `
    <div class="bg-surface border border-border rounded-card">
      <div class="px-4 py-3 border-b border-border flex items-center justify-between gap-3">
        <div>
          <div class="font-semibold text-text-primary">{{ catalog.t('common.attachments') }}</div>
          <p class="fs-caption text-text-secondary m-0">{{ catalog.t('common.inDocsFolder') }}</p>
        </div>
        <div *peraCan="PERM.documents.upload">
          <input #fileInput type="file" class="hidden" (change)="onFileChosen($event)" />
          <pera-button
            variant="secondary"
            size="sm"
            [loading]="uploading()"
            (click)="fileInput.click()"
            >{{ catalog.t('common.uploadFile') }}</pera-button
          >
        </div>
      </div>
      <div class="p-4">
        @if (documents().length) {
          <ul class="flex flex-col gap-2">
            @for (doc of documents(); track doc.id) {
              <li class="flex items-center justify-between gap-3 fs-body-sm">
                <span class="truncate text-text-primary">{{ doc.fileName }}</span>
                <span class="fs-label text-text-muted shrink-0">{{
                  sizeLabel(doc.sizeBytes)
                }}</span>
              </li>
            }
          </ul>
        } @else {
          <pera-empty [title]="catalog.t('common.attachments')" />
        }
      </div>
    </div>
  `,
})
export class CrmBriefAttachmentsComponent {
  private readonly folders = inject(DocumentFoldersService);
  private readonly documentsApi = inject(ProjectDocumentsService);
  protected readonly catalog = inject(CatalogService);
  protected readonly PERM = PERM;

  readonly projectId = input.required<string>();
  private folderId: string | null = null;

  protected readonly documents = signal<ProjectDocument[]>([]);
  protected readonly uploading = signal(false);

  constructor() {
    let loaded = false;
    effect(() => {
      if (loaded || !this.projectId()) return;
      loaded = true;
      this.load();
    });
  }

  private load(): void {
    const projectId = this.projectId();
    if (!projectId) return;
    this.folders.getByProject(projectId).subscribe((folders) => {
      const folder = folders.find((f) => f.name === FOLDER_NAME);
      this.folderId = folder?.id ?? null;
      if (folder) {
        this.documentsApi.getByFolder(folder.id).subscribe((docs) => this.documents.set(docs));
      }
    });
  }

  protected sizeLabel(bytes: number): string {
    return bytes < 1024 * 1024
      ? `${Math.ceil(bytes / 1024)} KB`
      : `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
  }

  protected onFileChosen(event: Event): void {
    const input = event.target as HTMLInputElement;
    const file = input.files?.[0];
    input.value = '';
    if (!file) return;
    this.uploading.set(true);
    this.documentsApi.upload(this.projectId(), file, this.folderId).subscribe({
      next: () => {
        this.uploading.set(false);
        this.load();
      },
      error: () => this.uploading.set(false),
    });
  }
}
