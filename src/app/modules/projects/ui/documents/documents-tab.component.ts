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
import {
  DocumentFolder,
  DocumentFoldersService,
  ProjectDocument,
  ProjectDocumentsService,
} from '../../data/documents.service';
import { ErrorHandlerService, friendly } from '@platform/http/error-handler.service';
import { ToastService } from '@platform/feedback/toast.service';
import { PermissionsService } from '@platform/permissions';
import { PERM } from '@platform/permissions';
import { ProjectAccessStore } from '../../stores/project-access.store';
import { claimCheck } from '../../model/project-access';
import {
  AttachmentFolder,
  AttachmentItem,
  ConfirmService,
  DrawerService,
  PeraAttachmentsShellComponent,
  PeraFilePreviewDrawerComponent,
} from '@ds';

/**
 * Documents tab — renders through `pera-attachments-shell` (Step 4 — locked
 * template port). Replaces the previous folder-tree + file-list pair. Folders
 * come from `/api/projects/{id}/document-folders` (root + immediate children
 * fetched lazily); files come from `/api/document-folders/{id}/documents` for the
 * selected folder, or `/api/projects/{id}/documents` for the "All files" root.
 */
@Component({
  selector: 'app-documents-tab',
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [PeraAttachmentsShellComponent],
  template: `
    <pera-attachments-shell
      [folders]="folders()"
      [items]="items()"
      [selectedFolderId]="selectedFolderId()"
      [canManage]="canManage()"
      defaultView="list"
      uploadHint="Drag files here. PDFs, drawings, photos all welcome."
      (folderSelect)="onFolderSelect($event)"
      (folderCreate)="onFolderCreate()"
      (upload)="onUpload($event)"
      (itemOpen)="openPreview($event)"
      (itemDelete)="onDelete($event)"
      (bulkDelete)="onBulkDelete($event)"
    />
  `,
})
export class DocumentsTabComponent implements OnInit {
  readonly projectId = input.required<string>();
  /** Folder to open on mount (e.g. when launched scoped from a Files panel). */
  readonly initialFolderId = input<string | null>(null);

  private readonly foldersApi = inject(DocumentFoldersService);
  private readonly docsApi = inject(ProjectDocumentsService);
  private readonly errors = inject(ErrorHandlerService);
  private readonly toast = inject(ToastService);
  private readonly confirm = inject(ConfirmService);
  private readonly drawer = inject(DrawerService);
  private readonly perms = inject(PermissionsService);

  private readonly access = inject(ProjectAccessStore);

  /**
   * crmp P1-B: project documents are the Documents area at project level; a grantee's
   * `documents.upload` comes from the grant (a stage-limited grant has none here). Members: the token.
   */
  readonly canManage = computed(() =>
    claimCheck(this.access.project(this.projectId())()?.myAccess, 'Documents', (p) =>
      this.perms.can(p),
    )(PERM.documents.upload),
  );

  readonly rootFolders = signal<DocumentFolder[]>([]);
  readonly documents = signal<ProjectDocument[]>([]);
  readonly selectedFolderId = signal<string | null>('all');

  readonly folders = computed<AttachmentFolder[]>(() => [
    { id: 'all', label: 'All files', count: this.documents().length },
    ...this.rootFolders().map((f) => ({
      id: f.id,
      label: f.name,
      count: this.documents().filter((d) => d.folderId === f.id).length,
    })),
  ]);

  readonly items = computed<AttachmentItem[]>(() =>
    this.documents().map((d) => ({
      id: d.id,
      name: d.fileName,
      ext: d.fileName.split('.').pop()?.toLowerCase() ?? '',
      sizeBytes: d.sizeBytes,
      uploadedOn: d.createdAtUtc,
      folderId: d.folderId ?? 'all',
    })),
  );

  ngOnInit(): void {
    const initial = this.initialFolderId();
    if (initial) this.selectedFolderId.set(initial);
    this.load();
  }

  load(): void {
    this.foldersApi.getByProject(this.projectId()).subscribe((list) => this.rootFolders.set(list));
    this.docsApi.getByProject(this.projectId()).subscribe((list) => this.documents.set(list));
  }

  onFolderSelect(id: string): void {
    this.selectedFolderId.set(id);
  }

  onFolderCreate(): void {
    const name = window.prompt('Folder name?');
    if (!name?.trim()) return;
    this.foldersApi.create(this.projectId(), name.trim(), null).subscribe({
      next: () => {
        this.toast.show({ tone: 'success', message: 'Folder created' });
        this.load();
      },
      error: (err: HttpErrorResponse) =>
        this.toast.show({ tone: 'danger', message: friendly(this.errors.parse(err)) }),
    });
  }

  onUpload(files: File[]): void {
    files.forEach((f) => this.uploadOne(f));
  }

  private uploadOne(file: File): void {
    const folderId = this.selectedFolderId();

    // Was the only raw-HttpClient-in-a-component in the codebase. It asked for
    // `reportProgress: true` and then discarded every progress event, so nothing is lost
    // by dropping the event stream — the observable behaviour is identical (SC-009).
    this.docsApi.upload(this.projectId(), file, folderId !== 'all' ? folderId : null).subscribe({
      next: () => {
        this.toast.show({ tone: 'success', message: `Uploaded ${file.name}` });
        this.load();
      },
      error: (err: HttpErrorResponse) =>
        this.toast.show({ tone: 'danger', message: friendly(this.errors.parse(err)) }),
    });
  }

  openPreview(item: AttachmentItem): void {
    this.drawer.open(PeraFilePreviewDrawerComponent, {
      data: {
        id: item.id,
        name: item.name,
        ext: item.ext,
        sizeBytes: item.sizeBytes,
        uploadedOn: item.uploadedOn,
        fetchBlob: () => this.docsApi.download(item.id),
        onDownload: () => this.download(item),
      },
    });
  }

  download(item: AttachmentItem): void {
    this.docsApi.download(item.id).subscribe({
      next: (blob) => {
        const url = URL.createObjectURL(blob);
        const a = document.createElement('a');
        a.href = url;
        a.download = item.name;
        a.click();
        URL.revokeObjectURL(url);
      },
      error: (err: HttpErrorResponse) =>
        this.toast.show({ tone: 'danger', message: friendly(this.errors.parse(err)) }),
    });
  }

  async onDelete(item: AttachmentItem): Promise<void> {
    const ok = await this.confirm.open({
      title: 'Delete document',
      body: `Delete "${item.name}"? This cannot be undone.`,
      confirmLabel: 'Delete',
      tone: 'danger',
    });
    if (!ok) return;
    this.docsApi.remove(item.id).subscribe({
      next: () => this.documents.update((list) => list.filter((d) => d.id !== item.id)),
      error: (err: HttpErrorResponse) =>
        this.toast.show({ tone: 'danger', message: friendly(this.errors.parse(err)) }),
    });
  }

  async onBulkDelete(ids: string[]): Promise<void> {
    if (!ids.length) return;
    const ok = await this.confirm.open({
      title: `Delete ${ids.length} documents`,
      body: 'This cannot be undone.',
      confirmLabel: 'Delete all',
      tone: 'danger',
    });
    if (!ok) return;
    ids.forEach((id) =>
      this.docsApi.remove(id).subscribe({
        next: () => this.documents.update((list) => list.filter((d) => d.id !== id)),
        error: (err: HttpErrorResponse) =>
          this.toast.show({ tone: 'danger', message: friendly(this.errors.parse(err)) }),
      }),
    );
  }
}
