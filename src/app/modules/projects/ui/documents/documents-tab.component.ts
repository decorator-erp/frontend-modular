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
  ProjectDocumentsService,
} from '../../data/documents.service';
import {
  DocumentVersion,
  DocumentVersionsService,
  latestPerLineage,
} from '../../data/document-versions.service';
import { CatalogService } from '@platform/i18n/catalog.service';
import {
  DocumentVersionsDialogComponent,
  DocumentVersionsDialogData,
} from './document-versions-dialog.component';
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
  ModalService,
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
      [lockedLabel]="catalog.t('docs.locked')"
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
  private readonly versionsApi = inject(DocumentVersionsService);
  private readonly modal = inject(ModalService);

  private readonly access = inject(ProjectAccessStore);
  protected readonly catalog = inject(CatalogService);

  /**
   * crmp P1-B: project documents are the Documents area at project level; a grantee's
   * `documents.upload` comes from the grant (a stage-limited grant has none here). Members: the token.
   */
  readonly canManage = computed(() =>
    claimCheck(this.access.project(this.projectId())()?.myAccess, 'Documents', (p) =>
      this.perms.can(p),
    )(PERM.documents.upload),
  );

  /** Sync F2(c): a review request needs `documents.update` (DocumentEndpoints.cs:46). */
  readonly canRequestReview = computed(() =>
    claimCheck(this.access.project(this.projectId())()?.myAccess, 'Documents', (p) =>
      this.perms.can(p),
    )(PERM.documents.update),
  );

  readonly rootFolders = signal<DocumentFolder[]>([]);
  /**
   * Sync F2: every active row — older versions stay active — so the shell shows the newest version
   * of each lineage; the rest are in the versions dialog.
   */
  readonly allVersions = signal<DocumentVersion[]>([]);
  readonly documents = computed(() => latestPerLineage(this.allVersions()));
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
      uploadedOn: d.uploadedOnUtc,
      folderId: d.folderId ?? 'all',
      // Sync W2-3: a locked document offers no delete/move (lock glyph); F2: the version/lock label.
      locked: !!d.isLocked,
      linkLabel: this.versionLabel(d),
    })),
  );

  ngOnInit(): void {
    const initial = this.initialFolderId();
    if (initial) this.selectedFolderId.set(initial);
    this.load();
  }

  load(): void {
    this.foldersApi.getByProject(this.projectId()).subscribe((list) => this.rootFolders.set(list));
    this.versionsApi.getByProject(this.projectId()).subscribe((list) => this.allVersions.set(list));
  }

  /** `v2 · Locked`, `Locked`, `v3` — or nothing for an unlocked v1. */
  private versionLabel(d: DocumentVersion): string | null {
    const parts: string[] = [];
    if (d.version > 1) parts.push(this.catalog.t('docv.version', { n: d.version }));
    if (d.isLocked) parts.push(this.catalog.t('docv.locked'));
    return parts.length ? parts.join(' · ') : null;
  }

  private find(id: string): DocumentVersion | undefined {
    return this.documents().find((d) => d.id === id);
  }

  /** Sync F2: versions, a new version and a review request; reloads when something changed. */
  async openVersions(documentId: string): Promise<void> {
    const data: DocumentVersionsDialogData = {
      documentId,
      projectId: this.projectId(),
      canUpload: this.canManage(),
      canRequestReview: this.canRequestReview(),
    };
    const ref = this.modal.open<boolean>(DocumentVersionsDialogComponent, { size: 'lg', data });
    if (await ref.afterClosed()) this.load();
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
        actions: [
          { label: this.catalog.t('docv.open'), run: () => void this.openVersions(item.id) },
        ],
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
    // Sync F2: a locked document is 409 `project_documents.Locked` on delete — say so up front.
    if (this.find(item.id)?.isLocked) {
      this.toast.show({
        tone: 'warning',
        message: this.catalog.t('docv.lockedNoDelete', { name: item.name }),
      });
      return;
    }
    const ok = await this.confirm.open({
      title: 'Delete document',
      body: `Delete "${item.name}"? This cannot be undone.`,
      confirmLabel: 'Delete',
      tone: 'danger',
    });
    if (!ok) return;
    this.docsApi.remove(item.id).subscribe({
      next: () => this.allVersions.update((list) => list.filter((d) => d.id !== item.id)),
      error: (err: HttpErrorResponse) =>
        this.toast.show({ tone: 'danger', message: friendly(this.errors.parse(err)) }),
    });
  }

  async onBulkDelete(selected: string[]): Promise<void> {
    // Sync F2: locked documents are skipped (and named), the rest go.
    const locked = selected.filter((id) => this.find(id)?.isLocked);
    for (const id of locked) {
      this.toast.show({
        tone: 'warning',
        message: this.catalog.t('docv.lockedNoDelete', { name: this.find(id)?.fileName ?? '' }),
      });
    }
    const ids = selected.filter((id) => !locked.includes(id));
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
        next: () => this.allVersions.update((list) => list.filter((d) => d.id !== id)),
        error: (err: HttpErrorResponse) =>
          this.toast.show({ tone: 'danger', message: friendly(this.errors.parse(err)) }),
      }),
    );
  }
}
