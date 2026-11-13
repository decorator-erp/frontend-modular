import {
  ChangeDetectionStrategy,
  Component,
  OnInit,
  computed,
  inject,
  input,
  signal,
} from '@angular/core';
import { TaskAttachmentService } from '../../../data/task-attachment.service';
import { TaskAttachment } from '../../../model/project.model';
import { PermissionsService } from '@platform/permissions';
import { PERM } from '@platform/permissions';
import { ProjectAccessStore } from '../../../stores/project-access.store';
import { claimCheck } from '../../../model/project-access';
import { ModalService } from '@ds';
import { AttTile } from '../../task-detail/attachments-panel.component';
import { bt, PNL, PNL_H, PNL_H_C, PNL_H_T } from './dms-stage-chrome';
import {
  FilesFolderModalComponent,
  FilesFolderModalData,
} from '../../task-detail/files-folder-modal.component';
import {
  DocumentationModalComponent,
  DocumentationModalData,
} from '../../task-detail/documentation-modal.component';
import { CatalogService } from '@platform/i18n/catalog.service';
import type { CatalogKey } from '@platform/i18n/catalog/en';
import {
  DocumentVersion,
  DocumentVersionsService,
  latestPerLineage,
} from '../../../data/document-versions.service';
import {
  DocumentVersionsDialogComponent,
  DocumentVersionsDialogData,
} from '../../documents/document-versions-dialog.component';
import {
  StageUploadDialogComponent,
  StageUploadDialogData,
} from '../../documents/stage-upload-dialog.component';
import {
  ScopedFolderDialogComponent,
  ScopedFolderDialogData,
} from '../../documents/scoped-folder-dialog.component';

type AttKind = 'pdf' | 'dwg' | 'sheet' | 'image' | 'other';
type FolderKey = 'drawings' | 'schedules' | 'references' | 'other';

interface FolderDef {
  key: FolderKey;
  name: string;
  kinds: AttKind[];
}

const IMAGE_EXTS = ['jpg', 'jpeg', 'png', 'gif', 'webp', 'heic', 'bmp', 'svg'];
const SHEET_EXTS = ['xlsx', 'xls', 'csv', 'ods'];
const FOLDERS: FolderDef[] = [
  { key: 'drawings', name: 'Drawings', kinds: ['pdf', 'dwg'] },
  { key: 'schedules', name: 'Schedules', kinds: ['sheet'] },
  { key: 'references', name: 'References', kinds: ['image'] },
  { key: 'other', name: 'Other files', kinds: ['other'] },
];

/**
 * Stage Files browser — the `.pnl` "Files" block from the DMS Stage Detail
 * design, mirroring the **Task Detail** Files panel (the agreed pattern): a
 * content-kind folder grid built from the stage's attachments
 * (`GET /api/project-stages/{stageId}/documents`), hiding empty buckets. Opening a
 * folder pops the shared `FilesFolderModalComponent` floating window (tile grid +
 * in-place preview), not an in-panel grid or a side drawer. The panel + head
 * "Documentation" buttons open the project-documents browser (where uploads live,
 * gated on `projects.manageDocuments`). Styling extends the parent `.dms-stage`;
 * the `.fl-*` folder chrome is ported here.
 */
@Component({
  selector: 'app-dms-stage-files',
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [],
  template: `
    <div [class]="PNL">
      <div [class]="PNL_H">
        <div [class]="PNL_H_T">
          Files
          <span [class]="PNL_H_C"
            >{{ visibleFolders().length }}
            {{ visibleFolders().length === 1 ? 'folder' : 'folders' }}</span
          >
        </div>
        <span class="flex-1"></span>
        @if (canUpload()) {
          <button type="button" [class]="BT_GH_SM" (click)="openUpload()" data-stage-upload>
            {{ t('stf.upload') }}
          </button>
          <button type="button" [class]="BT_GH_SM" (click)="openNewFolder()" data-stage-folder>
            {{ t('stf.newFolder') }}
          </button>
        }
        <button type="button" [class]="BT_GH_SM" (click)="openDocumentation()">
          <svg
            width="13"
            height="13"
            viewBox="0 0 24 24"
            fill="none"
            stroke="currentColor"
            stroke-width="1.7"
          >
            <path d="M3 7h6l2 2h10v9a2 2 0 0 1-2 2H3z" />
          </svg>
          Documentation
        </button>
      </div>

      @if (visibleFolders().length) {
        <div class="grid grid-cols-1 sm:grid-cols-2 gap-px bg-border border-t border-border-soft">
          @for (f of visibleFolders(); track f.key) {
            <button
              type="button"
              class="group bg-surface px-4 py-3 flex items-center gap-3 cursor-pointer transition-colors border-0 w-full text-start font-[inherit] hover:bg-hover"
              (click)="openFolder(f)"
            >
              <span class="flex shrink-0 text-text-secondary"
                ><svg
                  width="22"
                  height="22"
                  viewBox="0 0 24 24"
                  fill="none"
                  stroke="currentColor"
                  stroke-width="1.5"
                >
                  <path d="M3 7h6l2 2h10v9a2 2 0 0 1-2 2H3z" /></svg
              ></span>
              <span class="flex-1 min-w-0">
                <span class="block truncate fs-caption font-medium">{{ f.name }}</span>
                <span class="block mt-px fs-label text-text-muted tabular-nums"
                  >{{ count(f) }} {{ count(f) === 1 ? 'file' : 'files' }}</span
                >
              </span>
              <span
                class="ms-auto flex shrink-0 text-text-muted transition-transform group-hover:translate-x-0.5 group-hover:text-text-primary"
                ><svg
                  width="14"
                  height="14"
                  viewBox="0 0 24 24"
                  fill="none"
                  stroke="currentColor"
                  stroke-width="1.7"
                >
                  <path d="M9 6l6 6-6 6" /></svg
              ></span>
            </button>
          }
        </div>
      } @else {
        <div class="px-4 py-6 fs-caption text-text-muted text-center">
          This stage has no files yet. Open Documentation to add files.
        </div>
      }

      <!-- Sync F2: the stage's documents (newest version of each), with versions and review. -->
      @if (documents().length) {
        <ul
          class="m-0 p-0 list-none border-t border-border-soft divide-y divide-border-soft"
          data-stage-docs
        >
          @for (d of documents(); track d.id) {
            <li class="px-4 py-2 flex items-center gap-2.5" [attr.data-doc]="d.id">
              <span class="flex-1 min-w-0 truncate fs-caption">{{ d.fileName }}</span>
              @if (d.version > 1) {
                <span class="font-mono fs-micro text-text-muted">{{
                  t('docv.version', { n: d.version })
                }}</span>
              }
              @if (d.isLocked) {
                <span
                  class="font-mono fs-micro px-1.5 py-px border border-warning bg-warning-soft text-warning"
                  data-doc-locked
                  >{{ t('docv.locked') }}</span
                >
              }
              <button
                type="button"
                class="font-mono fs-micro text-accent hover:underline cursor-pointer"
                (click)="openVersions(d)"
                data-doc-versions
              >
                {{ t('stf.versions') }}
              </button>
            </li>
          }
        </ul>
      }
    </div>
  `,
})
export class DmsStageFilesComponent implements OnInit {
  protected readonly PNL = PNL;
  protected readonly PNL_H = PNL_H;
  protected readonly PNL_H_T = PNL_H_T;
  protected readonly PNL_H_C = PNL_H_C;
  protected readonly BT_GH_SM = bt('gh', true);

  readonly stageId = input.required<string>();
  readonly projectId = input.required<string>();
  readonly stageOrder = input<number>(0);
  readonly stageName = input<string>('');

  private readonly api = inject(TaskAttachmentService);
  private readonly modal = inject(ModalService);
  private readonly perms = inject(PermissionsService);

  private readonly access = inject(ProjectAccessStore);
  /** UI-1: deleting a file needs `documents.delete` (Documents area, this stage, for a grantee). */
  readonly canDelete = computed(() =>
    claimCheck(
      this.access.project(this.projectId())()?.myAccess,
      'Documents',
      (p) => this.perms.can(p),
      this.stageId(),
    )(PERM.documents.delete),
  );
  private readonly attachments = signal<TaskAttachment[]>([]);

  private readonly versionsApi = inject(DocumentVersionsService);
  private readonly catalog = inject(CatalogService);
  private readonly stageVersions = signal<DocumentVersion[]>([]);
  /** Sync F2: the newest version of each of the stage's documents. */
  readonly documents = computed(() => latestPerLineage(this.stageVersions()));

  /** Sync F2: stage uploads and folders need `documents.upload` (Documents area, this stage). */
  readonly canUpload = computed(() =>
    claimCheck(
      this.access.project(this.projectId())()?.myAccess,
      'Documents',
      (p) => this.perms.can(p),
      this.stageId(),
    )(PERM.documents.upload),
  );
  readonly canRequestReview = computed(() =>
    claimCheck(
      this.access.project(this.projectId())()?.myAccess,
      'Documents',
      (p) => this.perms.can(p),
      this.stageId(),
    )(PERM.documents.update),
  );

  t(key: CatalogKey, params?: Record<string, string | number>): string {
    return this.catalog.t(key, params);
  }

  private readonly allTiles = computed<AttTile[]>(() =>
    this.attachments().map((a) => {
      const ext = a.fileName.split('.').pop()?.toLowerCase() ?? '';
      const kind = this.kindFor(ext);
      return {
        id: a.id,
        name: a.fileName,
        ext,
        sub: `${this.formatSize(a.fileSizeBytes)} · ${this.formatDate(a.uploadedOnUtc)}`,
        kind,
        badgeBg: this.badgeBgFor(kind),
        badge: (ext || 'file').toUpperCase().slice(0, 4),
        sizeBytes: a.fileSizeBytes,
        uploadedOn: a.uploadedOnUtc,
        isImage: kind === 'image',
        locked: !!a.isLocked,
        version: a.version ?? 1,
      };
    }),
  );

  count(f: FolderDef): number {
    return this.allTiles().filter((t) => f.kinds.includes(t.kind)).length;
  }

  /** Only content-kind buckets that hold ≥ 1 attachment. */
  readonly visibleFolders = computed(() => FOLDERS.filter((f) => this.count(f) > 0));

  ngOnInit(): void {
    this.load();
  }

  load(): void {
    this.api.getByStage(this.stageId()).subscribe((list) => this.attachments.set(list));
    this.versionsApi.getByStage(this.stageId()).subscribe({
      next: (list) => this.stageVersions.set(list),
      error: () => this.stageVersions.set([]),
    });
  }

  /** Sync F2(d): `POST /project-stages/{id}/documents`. */
  async openUpload(): Promise<void> {
    const data: StageUploadDialogData = { stageId: this.stageId() };
    const ref = this.modal.open<boolean>(StageUploadDialogComponent, { size: 'md', data });
    if (await ref.afterClosed()) this.load();
  }

  /** Sync F2(e): `POST /project-stages/{id}/document-folders`. */
  async openNewFolder(): Promise<void> {
    const data: ScopedFolderDialogData = { scope: 'stage', scopeId: this.stageId() };
    const ref = this.modal.open<string>(ScopedFolderDialogComponent, { size: 'sm', data });
    if (await ref.afterClosed()) this.load();
  }

  /** Sync F2(a-c): versions, a new version and a review request. */
  async openVersions(d: DocumentVersion): Promise<void> {
    const data: DocumentVersionsDialogData = {
      documentId: d.id,
      projectId: this.projectId(),
      canUpload: this.canUpload(),
      canRequestReview: this.canRequestReview(),
    };
    const ref = this.modal.open<boolean>(DocumentVersionsDialogComponent, { size: 'lg', data });
    if (await ref.afterClosed()) this.load();
  }

  /** Open the folder's files in the shared floating window; reload on close. */
  openFolder(f: FolderDef): void {
    const data: FilesFolderModalData = {
      taskId: this.stageId(),
      folderName: f.name,
      files: this.allTiles().filter((t) => f.kinds.includes(t.kind)),
      canDelete: this.canDelete(),
    };
    void this.modal
      .open<boolean>(FilesFolderModalComponent, { size: 'lg', data })
      .afterClosed()
      .then(() => this.load());
  }

  openDocumentation(): void {
    const order = this.stageOrder();
    const data: DocumentationModalData = {
      projectId: this.projectId(),
      context: order
        ? `Stage ${String(order).padStart(2, '0')} · ${this.stageName()}`
        : this.stageName() || null,
      initialFolder: null,
    };
    this.modal.open(DocumentationModalComponent, { size: 'xl', data });
  }

  private kindFor(ext: string): AttKind {
    if (ext === 'pdf') return 'pdf';
    if (ext === 'dwg' || ext === 'dxf') return 'dwg';
    if (SHEET_EXTS.includes(ext)) return 'sheet';
    if (IMAGE_EXTS.includes(ext)) return 'image';
    return 'other';
  }

  private badgeBgFor(kind: AttKind): string {
    switch (kind) {
      case 'pdf':
        return 'bg-danger';
      case 'dwg':
        return 'bg-info';
      case 'sheet':
        return 'bg-success';
      case 'image':
        return 'bg-accent';
      default:
        return 'bg-text-muted';
    }
  }

  private formatSize(bytes: number): string {
    if (!bytes || bytes < 0) return '0 KB';
    if (bytes < 1024) return `${bytes} B`;
    const kb = bytes / 1024;
    if (kb < 1024) return `${Math.round(kb)} KB`;
    return `${(kb / 1024).toFixed(1)} MB`;
  }

  private formatDate(iso: string | null | undefined): string {
    if (!iso) return '—';
    const d = new Date(iso);
    if (Number.isNaN(d.getTime())) return '—';
    return d.toLocaleDateString('en-US', { month: 'short', day: 'numeric' });
  }
}
