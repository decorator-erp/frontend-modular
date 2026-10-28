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
 * (`/api/task-attachments/by-stage/{stageId}`), hiding empty buckets. Opening a
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

  readonly canManage = computed(() => this.perms.can(PERM.stageTasks.manage));
  private readonly attachments = signal<TaskAttachment[]>([]);

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
  }

  /** Open the folder's files in the shared floating window; reload on close. */
  openFolder(f: FolderDef): void {
    const data: FilesFolderModalData = {
      taskId: this.stageId(),
      folderName: f.name,
      files: this.allTiles().filter((t) => f.kinds.includes(t.kind)),
      canManage: this.canManage(),
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
