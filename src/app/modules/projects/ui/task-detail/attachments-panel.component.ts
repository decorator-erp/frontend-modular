import {
  ChangeDetectionStrategy,
  Component,
  OnInit,
  computed,
  inject,
  input,
  signal,
} from '@angular/core';
import { HttpErrorResponse } from '@angular/common/http';
import { TaskAttachmentService } from '../../data/task-attachment.service';
import { ErrorHandlerService, friendly } from '@platform/http/error-handler.service';
import { ToastService } from '@platform/feedback/toast.service';
import { TaskAttachment } from '../../model/project.model';
import { PermissionsService } from '@platform/permissions';
import { PERM } from '@platform/permissions';
import { ProjectAccessStore } from '../../stores/project-access.store';
import { claimCheck } from '../../model/project-access';
import { ModalService } from '@ds';
import {
  DocumentationModalComponent,
  DocumentationModalData,
} from './documentation-modal.component';
import { FilesFolderModalComponent, FilesFolderModalData } from './files-folder-modal.component';

/** File-type bucket → ext-badge token + thumb glyph. Keeps badge colours off raw hex. */
type AttKind = 'pdf' | 'dwg' | 'sheet' | 'image' | 'other';

/** Presentational folder keys — a flat attachment list grouped by content kind. */
type FolderKey = 'drawings' | 'schedules' | 'references' | 'other';

export interface AttTile {
  id: string;
  name: string;
  ext: string;
  /** "{size} · {date}" sub line, pre-formatted. */
  sub: string;
  kind: AttKind;
  /** DS token background for the ext badge, e.g. `bg-danger`. */
  badgeBg: string;
  /** Uppercase badge text, capped to keep the chip tidy. */
  badge: string;
  sizeBytes: number;
  uploadedOn: string | null;
  isImage: boolean;
  /** Sync W2-3: a locked document has no delete (lock glyph instead). */
  locked?: boolean;
  /** Sync W2-3: revision number; `v{n}` shows when it is above 1. */
  version?: number;
}

interface FolderDef {
  key: FolderKey;
  name: string;
  kinds: AttKind[];
}

const IMAGE_EXTS = ['jpg', 'jpeg', 'png', 'gif', 'webp', 'heic', 'bmp', 'svg'];
const SHEET_EXTS = ['xlsx', 'xls', 'csv', 'ods'];

/**
 * The design's four folders don't survive a flat task documents list
 * (References vs Site photos are indistinguishable by extension), so this is a
 * presentational grouping by content kind — Drawings, Schedules, References,
 * Other — not a fake folder API. See docs/DMS_TASK_DETAIL_BACKEND_GAPS.md.
 */
const FOLDERS: FolderDef[] = [
  { key: 'drawings', name: 'Drawings', kinds: ['pdf', 'dwg'] },
  { key: 'schedules', name: 'Schedules', kinds: ['sheet'] },
  { key: 'references', name: 'References', kinds: ['image'] },
  { key: 'other', name: 'Other files', kinds: ['other'] },
];

/**
 * Task files browser — the task's documents (`GET /api/project-tasks/{taskId}/documents`). Renders the SAME
 * flat content-kind folder grid as the Stage Detail Files panel
 * (`DmsStageFilesComponent`): a self-contained panel (header with folder count +
 * a Documentation action) over a hairline 2-up folder grid that hides empty
 * buckets. Opening a folder pops the shared `FilesFolderModalComponent` floating
 * window (tile grid + in-place preview, delete/download). The header carries a
 * Documentation action (project-documents) and an Upload action (manage-tasks
 * only) that uploads through `TaskAttachmentService.upload` (`POST /api/project-tasks/{taskId}/documents`).
 */
@Component({
  selector: 'app-attachments-panel',
  changeDetection: ChangeDetectionStrategy.OnPush,
  styles: [
    `
      :host {
        display: block;
      }
      /* Outer chrome mirrors the sibling card panels so it sits consistently among the task page's panels. */
      .afp {
        background: var(--surface);
        border: 1px solid var(--border);
        display: flex;
        flex-direction: column;
      }
      .afp-h {
        padding: 13px 20px;
        border-bottom: 1px solid var(--border);
        display: flex;
        align-items: center;
        justify-content: space-between;
        gap: 12px;
      }
      .afp-t {
        font-weight: 500;
        font-size: 13.5px;
        color: var(--color-text-primary);
        display: flex;
        align-items: center;
        gap: 10px;
      }
      .afp-c {
        font-family: var(--mono);
        font-size: 10.5px;
        color: var(--color-text-muted);
        padding: 1px 6px;
        background: var(--selected);
      }
      .afp-actions {
        display: flex;
        align-items: center;
        gap: 8px;
        flex-shrink: 0;
      }
      .afp-bt {
        display: inline-flex;
        align-items: center;
        gap: 6px;
        padding: 5px 10px;
        background: transparent;
        border: 1px solid var(--border);
        color: var(--color-text-secondary);
        font-size: 11.5px;
        font-weight: 500;
        cursor: pointer;
        transition:
          background 0.15s,
          border-color 0.15s,
          color 0.15s;
      }
      .afp-bt:hover {
        background: var(--hover);
        color: var(--color-text-primary);
        border-color: var(--color-text-muted);
      }
      .afp-bt svg {
        flex-shrink: 0;
      }
      .afp-picker {
        display: none;
      }
      /* Flat hairline folder grid — ported 1:1 from the Stage Files panel (.fl-*). */
      .fl-grid {
        display: grid;
        grid-template-columns: repeat(2, 1fr);
        gap: 1px;
        background: var(--border);
      }
      @media (max-width: 560px) {
        .fl-grid {
          grid-template-columns: 1fr;
        }
      }
      .fl-folder {
        background: var(--surface);
        padding: 13px 16px;
        display: flex;
        align-items: center;
        gap: 12px;
        cursor: pointer;
        transition: background 0.12s;
        border: 0;
        width: 100%;
        text-align: start;
        font: inherit;
        color: inherit;
      }
      .fl-folder:hover {
        background: var(--hover);
      }
      .fo-ic {
        color: var(--color-text-secondary);
        display: flex;
        flex-shrink: 0;
      }
      .fo-meta {
        flex: 1;
        min-width: 0;
      }
      .fo-n {
        font-size: 12.5px;
        font-weight: 500;
        white-space: nowrap;
        overflow: hidden;
        text-overflow: ellipsis;
        display: block;
      }
      .fo-s {
        font-size: 11px;
        color: var(--color-text-muted);
        margin-top: 1px;
        font-variant-numeric: tabular-nums;
        display: block;
      }
      .fo-chev {
        margin-left: auto;
        color: var(--color-text-muted);
        display: flex;
        flex-shrink: 0;
        transition: transform 0.12s;
      }
      .fl-folder:hover .fo-chev {
        transform: translateX(2px);
        color: var(--color-text-primary);
      }
      .fl-empty {
        padding: 24px 16px;
        font-size: 12px;
        color: var(--color-text-muted);
        text-align: center;
      }
    `,
  ],
  template: `
    <section class="afp">
      <div class="afp-h">
        <div class="afp-t">
          Files
          <span class="afp-c"
            >{{ visibleFolders().length }}
            {{ visibleFolders().length === 1 ? 'folder' : 'folders' }}</span
          >
        </div>
        <div class="afp-actions">
          <button type="button" class="afp-bt" (click)="openDocumentation()">
            <svg
              width="13"
              height="13"
              viewBox="0 0 24 24"
              fill="none"
              stroke="currentColor"
              stroke-width="1.7"
              aria-hidden="true"
            >
              <path d="M3 7h6l2 2h10v9a2 2 0 0 1-2 2H3z" />
            </svg>
            Documentation
          </button>
          @if (canUpload()) {
            <button type="button" class="afp-bt" (click)="picker.click()">
              <svg
                width="13"
                height="13"
                viewBox="0 0 24 24"
                fill="none"
                stroke="currentColor"
                stroke-width="1.7"
                aria-hidden="true"
              >
                <path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4M17 8l-5-5-5 5M12 3v12" />
              </svg>
              Upload
            </button>
          }
        </div>
      </div>
      <input #picker type="file" multiple class="afp-picker" (change)="onPick($event)" />

      @if (visibleFolders().length) {
        <div class="fl-grid">
          @for (f of visibleFolders(); track f.key) {
            <button type="button" class="fl-folder" (click)="openFolder(f)">
              <span class="fo-ic"
                ><svg
                  width="22"
                  height="22"
                  viewBox="0 0 24 24"
                  fill="none"
                  stroke="currentColor"
                  stroke-width="1.5"
                  aria-hidden="true"
                >
                  <path d="M3 7h6l2 2h10v9a2 2 0 0 1-2 2H3z" /></svg
              ></span>
              <span class="fo-meta">
                <span class="fo-n">{{ f.name }}</span>
                <span class="fo-s">{{ count(f) }} {{ count(f) === 1 ? 'file' : 'files' }}</span>
              </span>
              <span class="fo-chev"
                ><svg
                  width="14"
                  height="14"
                  viewBox="0 0 24 24"
                  fill="none"
                  stroke="currentColor"
                  stroke-width="1.7"
                  aria-hidden="true"
                >
                  <path d="M9 6l6 6-6 6" /></svg
              ></span>
            </button>
          }
        </div>
      } @else {
        <div class="fl-empty">This task has no files yet. Open Documentation to add files.</div>
      }
    </section>
  `,
})
export class AttachmentsPanelComponent implements OnInit {
  readonly taskId = input.required<string>();
  /** Stage context for the Documentation modal crumb (best-effort). */
  readonly stageName = input<string>('');
  readonly projectId = input<string>('');

  private readonly api = inject(TaskAttachmentService);
  private readonly errors = inject(ErrorHandlerService);
  private readonly toast = inject(ToastService);
  private readonly modal = inject(ModalService);
  private readonly perms = inject(PermissionsService);

  private readonly access = inject(ProjectAccessStore);

  /** UI-1: POST /api/project-tasks/{t}/documents needs `documents.upload` (Documents area for a grantee). */
  readonly canUpload = computed(() =>
    claimCheck(this.access.project(this.projectId())()?.myAccess, 'Documents', (p) =>
      this.perms.can(p),
    )(PERM.documents.upload),
  );
  /** UI-1: deleting a task file needs `documents.delete`. */
  readonly canDelete = computed(() =>
    claimCheck(this.access.project(this.projectId())()?.myAccess, 'Documents', (p) =>
      this.perms.can(p),
    )(PERM.documents.delete),
  );

  readonly FOLDERS = FOLDERS;
  readonly attachments = signal<TaskAttachment[]>([]);

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

  /** Only content-kind buckets that actually hold ≥ 1 attachment. */
  readonly visibleFolders = computed(() => FOLDERS.filter((f) => this.count(f) > 0));

  ngOnInit(): void {
    this.load();
  }

  load(): void {
    this.api.getByTask(this.taskId()).subscribe((list) => this.attachments.set(list));
  }

  onPick(event: Event): void {
    const input = event.target as HTMLInputElement;
    const files = input.files ? Array.from(input.files) : [];
    files.forEach((f) => this.uploadOne(f));
    input.value = '';
  }

  private uploadOne(file: File): void {
    this.api.upload(this.taskId(), file).subscribe({
      next: () => {
        this.toast.show({ tone: 'success', message: `Uploaded ${file.name}` });
        this.load();
      },
      error: (err: HttpErrorResponse) => {
        this.toast.show({ tone: 'danger', message: friendly(this.errors.parse(err)) });
      },
    });
  }

  /** Open the folder's files in the centered floating window; reload on close. */
  openFolder(f: FolderDef): void {
    const data: FilesFolderModalData = {
      taskId: this.taskId(),
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
    if (!this.projectId()) return;
    const data: DocumentationModalData = {
      projectId: this.projectId(),
      context: this.stageName() || null,
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
