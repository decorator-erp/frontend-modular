import { CatalogService } from '@platform/i18n/catalog.service';
import {
  ChangeDetectionStrategy,
  Component,
  OnDestroy,
  computed,
  effect,
  inject,
  signal,
} from '@angular/core';
import { HttpErrorResponse } from '@angular/common/http';
import { TaskAttachmentService } from '../../data/task-attachment.service';
import { ErrorHandlerService, friendly } from '@platform/http/error-handler.service';
import { ToastService } from '@platform/feedback/toast.service';
import {
  ConfirmService,
  PERA_MODAL_DATA,
  PeraButtonComponent,
  PeraModalComponent,
  PeraModalFooterDirective,
  PeraModalRef,
} from '@ds';
import type { AttTile } from './attachments-panel.component';

export interface FilesFolderModalData {
  taskId: string;
  folderName: string;
  files: AttTile[];
  /** UI-1: deleting a file needs `documents.delete`. */
  canDelete: boolean;
}

/**
 * Files folder window — a centered floating overlay (the `DMS Task Detail`
 * `.ovl` pattern) that shows a folder's contents as a tile grid and, on click,
 * previews the selected file in place (image blob inline, doc placeholder +
 * Download) with a back link. Replaces the in-panel two-level browse and the old
 * side drawer. Image thumbnails + previews come from the authed download blob
 * (§7.3). Closes with `true` if anything was deleted so the host refetches.
 */
@Component({
  selector: 'app-files-folder-modal',
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [PeraModalComponent, PeraModalFooterDirective, PeraButtonComponent],
  template: `
    <pera-modal [title]="title()" size="lg">
      @if (selected(); as f) {
        <!-- ===== VIEWER ===== -->
        <button
          type="button"
          class="inline-flex items-center gap-1.5 fs-caption text-text-muted hover:text-accent transition-colors mb-3"
          (click)="back()"
        >
          <svg
            width="12"
            height="12"
            viewBox="0 0 24 24"
            fill="none"
            stroke="currentColor"
            stroke-width="1.8"
            aria-hidden="true"
          >
            <path d="M15 18l-6-6 6-6" />
          </svg>
          {{ data.folderName }}
        </button>
        <div
          class="flex items-center justify-center bg-surface-muted border border-border-soft min-h-[clamp(var(--h-canvas),52vh,var(--h-panel))] overflow-hidden"
        >
          @if (f.isImage) {
            @if (selectedUrl(); as url) {
              <img
                [src]="url"
                [alt]="f.name"
                class="max-h-[60vh] max-w-full w-auto object-contain"
              />
            } @else {
              <span class="fs-caption text-text-muted animate-pulse py-12">Loading preview…</span>
            }
          } @else {
            <div class="flex flex-col items-center gap-3 py-14 px-6 text-center">
              <span
                class="px-3 py-1.5 fs-body-sm font-semibold tracking-wide text-bg"
                [class]="f.badgeBg"
                >{{ f.badge }}</span
              >
              <div class="fs-body-sm font-medium break-all">{{ f.name }}</div>
              <div class="fs-label text-text-muted tabular-nums">{{ f.sub }}</div>
              <p class="m-0 fs-label text-text-muted max-w-[var(--w-panel)]">
                No inline preview for this file type — download it to open.
              </p>
            </div>
          }
        </div>
      } @else if (files().length) {
        <!-- ===== GRID ===== -->
        <div class="grid grid-cols-3 md:grid-cols-4 gap-2.5">
          @for (t of files(); track t.id) {
            <div
              class="group relative border border-border bg-bg cursor-pointer transition-colors hover:border-text-muted focus:outline-none focus-visible:border-accent"
              role="button"
              tabindex="0"
              [attr.aria-label]="'Open ' + t.name"
              (click)="open(t)"
              (keydown.enter)="open(t)"
              (keydown.space)="$event.preventDefault(); open(t)"
            >
              <div
                class="relative flex items-center justify-center h-[var(--h-chart)] border-b border-border-soft bg-surface-muted overflow-hidden"
              >
                @if (t.isImage && thumbUrl(t.id); as url) {
                  <img
                    [src]="url"
                    [alt]="t.name"
                    class="absolute inset-0 w-full h-full object-cover"
                  />
                } @else {
                  @switch (t.kind) {
                    @case ('pdf') {
                      <svg
                        width="30"
                        height="30"
                        viewBox="0 0 24 24"
                        fill="none"
                        stroke="currentColor"
                        stroke-width="1.3"
                        class="text-danger"
                        aria-hidden="true"
                      >
                        <path d="M6 2h9l5 5v15H6z" />
                        <path d="M14 2v6h6" />
                      </svg>
                    }
                    @case ('dwg') {
                      <svg
                        width="30"
                        height="30"
                        viewBox="0 0 24 24"
                        fill="none"
                        stroke="currentColor"
                        stroke-width="1.3"
                        class="text-info"
                        aria-hidden="true"
                      >
                        <path d="M3 5h18v14H3z" />
                        <path d="M3 9h18M8 5v14" />
                      </svg>
                    }
                    @case ('sheet') {
                      <svg
                        width="30"
                        height="30"
                        viewBox="0 0 24 24"
                        fill="none"
                        stroke="currentColor"
                        stroke-width="1.3"
                        class="text-success"
                        aria-hidden="true"
                      >
                        <rect x="4" y="3" width="16" height="18" />
                        <path d="M8 8h8M8 12h8M8 16h5" />
                      </svg>
                    }
                    @case ('image') {
                      <svg
                        width="30"
                        height="30"
                        viewBox="0 0 24 24"
                        fill="none"
                        stroke="currentColor"
                        stroke-width="1.3"
                        class="text-accent animate-pulse"
                        aria-hidden="true"
                      >
                        <rect x="3" y="3" width="18" height="18" />
                        <circle cx="8.5" cy="8.5" r="1.5" />
                        <path d="M21 15l-5-5L5 21" />
                      </svg>
                    }
                    @default {
                      <svg
                        width="30"
                        height="30"
                        viewBox="0 0 24 24"
                        fill="none"
                        stroke="currentColor"
                        stroke-width="1.3"
                        class="text-text-muted"
                        aria-hidden="true"
                      >
                        <path d="M6 2h9l5 5v15H6z" />
                        <path d="M14 2v6h6" />
                      </svg>
                    }
                  }
                  <span
                    class="absolute bottom-2 start-2 px-1.5 py-0.5 fs-label font-semibold tracking-wide text-bg"
                    [class]="t.badgeBg"
                    >{{ t.badge }}</span
                  >
                }
                <span
                  class="absolute top-1.5 end-1.5 w-6 h-6 flex items-center justify-center bg-surface border border-border text-text-secondary [@media(hover:hover)]:opacity-0 [@media(hover:hover)]:group-hover:opacity-100 focus-visible:opacity-100 transition-opacity"
                >
                  <svg
                    width="12"
                    height="12"
                    viewBox="0 0 24 24"
                    fill="none"
                    stroke="currentColor"
                    stroke-width="1.8"
                    aria-hidden="true"
                  >
                    <path d="M15 3h6v6M9 21H3v-6M21 3l-7 7M3 21l7-7" />
                  </svg>
                </span>
              </div>
              <div class="px-2.5 py-2">
                <div class="flex items-start justify-between gap-1">
                  <div class="fs-label font-medium truncate" [title]="t.name">
                    {{ t.name }}
                  </div>
                  @if ((t.version ?? 1) > 1) {
                    <span class="shrink-0 font-mono fs-label text-text-muted" data-version
                      >v{{ t.version }}</span
                    >
                  }
                  @if (t.locked) {
                    <span
                      class="shrink-0 -me-0.5 text-text-muted"
                      [title]="catalog.t('docs.locked')"
                      [attr.aria-label]="catalog.t('docs.locked')"
                      data-locked
                    >
                      <svg
                        width="12"
                        height="12"
                        viewBox="0 0 24 24"
                        fill="none"
                        stroke="currentColor"
                        stroke-width="1.7"
                        aria-hidden="true"
                      >
                        <rect x="5" y="11" width="14" height="10" />
                        <path d="M8 11V7a4 4 0 0 1 8 0v4" />
                      </svg>
                    </span>
                  } @else if (data.canDelete) {
                    <button
                      type="button"
                      class="shrink-0 -me-0.5 text-text-muted hover:text-danger [@media(hover:hover)]:opacity-0 [@media(hover:hover)]:group-hover:opacity-100 focus-visible:opacity-100 transition-opacity"
                      [attr.aria-label]="'Delete ' + t.name"
                      (click)="remove(t, $event)"
                    >
                      <svg
                        width="12"
                        height="12"
                        viewBox="0 0 24 24"
                        fill="none"
                        stroke="currentColor"
                        stroke-width="1.8"
                        aria-hidden="true"
                      >
                        <path d="M3 6h18M8 6V4h8v2M19 6l-1 14H6L5 6" />
                      </svg>
                    </button>
                  }
                </div>
                <div class="fs-label text-text-muted tabular-nums mt-0.5 truncate">
                  {{ t.sub }}
                </div>
              </div>
            </div>
          }
        </div>
      } @else {
        <div class="py-12 text-center fs-caption text-text-muted">This folder is now empty.</div>
      }

      <div peraModalFooter class="flex items-center justify-between w-full gap-2">
        @if (selected(); as f) {
          <pera-button variant="ghost" (click)="back()">Back</pera-button>
          <pera-button variant="primary" (click)="download(f)">Download</pera-button>
        } @else {
          <span class="fs-label text-text-muted tabular-nums"
            >{{ files().length }} {{ files().length === 1 ? 'file' : 'files' }}</span
          >
          <pera-button variant="ghost" (click)="close()">Close</pera-button>
        }
      </div>
    </pera-modal>
  `,
})
export class FilesFolderModalComponent implements OnDestroy {
  private readonly api = inject(TaskAttachmentService);
  private readonly errors = inject(ErrorHandlerService);
  private readonly toast = inject(ToastService);
  private readonly confirm = inject(ConfirmService);
  private readonly modalRef = inject(PeraModalRef) as PeraModalRef<boolean>;
  readonly data = inject(PERA_MODAL_DATA) as FilesFolderModalData;
  protected readonly catalog = inject(CatalogService);

  readonly files = signal<AttTile[]>([]);
  readonly selected = signal<AttTile | null>(null);
  readonly selectedUrl = signal<string | null>(null);
  private readonly thumbs = signal<Map<string, string>>(new Map());
  private readonly requested = new Set<string>();
  private changed = false;

  readonly title = computed(() => (this.selected() ? this.selected()!.name : this.data.folderName));

  thumbUrl(id: string): string | null {
    return this.thumbs().get(id) ?? null;
  }

  constructor() {
    this.files.set(this.data.files);
    // Lazily fetch real thumbnails for the image tiles (authed blob, fetched once).
    effect(() => {
      for (const t of this.files()) {
        if (!t.isImage || this.requested.has(t.id)) continue;
        this.requested.add(t.id);
        this.api.download(t.id).subscribe({
          next: (blob) =>
            this.thumbs.update((m) => new Map(m).set(t.id, URL.createObjectURL(blob))),
          error: () => this.requested.delete(t.id),
        });
      }
    });
  }

  open(tile: AttTile): void {
    this.selected.set(tile);
    this.revokeSelected();
    if (!tile.isImage) return;
    const cached = this.thumbs().get(tile.id);
    if (cached) {
      this.selectedUrl.set(cached);
      return;
    }
    this.api.download(tile.id).subscribe({
      next: (blob) => this.selectedUrl.set(URL.createObjectURL(blob)),
      error: (err: HttpErrorResponse) =>
        this.toast.show({ tone: 'danger', message: friendly(this.errors.parse(err)) }),
    });
  }

  back(): void {
    this.selected.set(null);
    this.revokeSelected();
  }

  download(tile: AttTile): void {
    this.api.download(tile.id).subscribe({
      next: (blob) => {
        const url = URL.createObjectURL(blob);
        const a = document.createElement('a');
        a.href = url;
        a.download = tile.name;
        a.click();
        URL.revokeObjectURL(url);
      },
      error: (err: HttpErrorResponse) =>
        this.toast.show({ tone: 'danger', message: friendly(this.errors.parse(err)) }),
    });
  }

  async remove(tile: AttTile, event: Event): Promise<void> {
    if (tile.locked) return;
    event.stopPropagation();
    const ok = await this.confirm.open({
      title: 'Delete attachment',
      body: `Delete "${tile.name}"? This cannot be undone.`,
      confirmLabel: 'Delete',
      tone: 'danger',
    });
    if (!ok) return;
    this.api.remove(tile.id).subscribe({
      next: () => {
        this.changed = true;
        this.files.update((list) => list.filter((t) => t.id !== tile.id));
      },
      error: (err: HttpErrorResponse) =>
        this.toast.show({ tone: 'danger', message: friendly(this.errors.parse(err)) }),
    });
  }

  close(): void {
    this.modalRef.close(this.changed);
  }

  private revokeSelected(): void {
    const url = this.selectedUrl();
    // Only revoke one-off preview URLs; thumbnail cache URLs are revoked on destroy.
    if (url && ![...this.thumbs().values()].includes(url)) URL.revokeObjectURL(url);
    this.selectedUrl.set(null);
  }

  ngOnDestroy(): void {
    this.revokeSelected();
    for (const url of this.thumbs().values()) URL.revokeObjectURL(url);
  }
}
