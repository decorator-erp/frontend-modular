import {
  ChangeDetectionStrategy,
  Component,
  OnDestroy,
  OnInit,
  computed,
  inject,
  signal,
} from '@angular/core';
import { Observable } from 'rxjs';
import { PERA_MODAL_DATA, PeraModalRef } from '../modal/modal.service';

export interface FilePreviewMetaItem {
  label: string;
  value: string;
  ar?: string | null;
}

export interface FilePreviewLink {
  /** Icon label or single-char glyph (template renders an icon column). */
  glyph?: string;
  label: string;
  sublabel?: string | null;
  /** Optional callback fired when the link row is clicked. */
  onOpen?: () => void;
}

export interface FilePreviewData {
  id: string;
  name: string;
  /** Lowercase ext (no dot). */
  ext: string;
  sizeBytes: number;
  uploadedOn?: string | null;
  uploadedBy?: string | null;
  meta?: FilePreviewMetaItem[];
  links?: FilePreviewLink[];
  /** Returns the file as a Blob; the drawer holds the object URL until close. */
  fetchBlob: () => Observable<Blob>;
  /** Optional callback fired by the Download button — usually identical to clicking the file in the host shell. */
  onDownload?: () => void;
}

/**
 * File preview drawer — port of `.pv-shell` from `PERA App - Attachments.html`.
 * Variation A (side drawer with metadata rail). Images render inline from the
 * fetched blob; PDFs render in an `<iframe>`; other types show a download
 * prompt. Built as its own host component (not on top of `pera-drawer`) so the
 * width fits a real document preview.
 */
@Component({
  selector: 'pera-file-preview-drawer',
  changeDetection: ChangeDetectionStrategy.OnPush,
  host: { class: 'block h-full bg-surface' },
  template: `
    <div class="pv-shell">
      <!-- ===== Canvas ===== -->
      <section class="pv-canvas">
        <header class="pv-canvas-head">
          <div class="nm">
            {{ data.name }}
            <span class="sub"
              >{{ formatBytes(data.sizeBytes) }} · {{ data.ext.toUpperCase() }}</span
            >
          </div>
          <div class="pv-tools">
            <button class="b" type="button" (click)="zoomOut()" title="Zoom out">−</button>
            <button class="b" type="button" (click)="zoomIn()" title="Zoom in">+</button>
            <button class="b" type="button" (click)="data.onDownload?.()" title="Download">
              <svg
                width="14"
                height="14"
                viewBox="0 0 24 24"
                fill="none"
                stroke="currentColor"
                stroke-width="1.8"
              >
                <path d="M12 4v12M6 14l6 6 6-6M4 22h16" />
              </svg>
            </button>
            <button class="b" type="button" (click)="close()" title="Close">×</button>
          </div>
        </header>
        <div class="pv-paper">
          @if (loading()) {
            <div class="text-text-muted font-mono fs-label">Loading…</div>
          } @else if (error()) {
            <div class="text-danger font-mono fs-label">{{ error() }}</div>
          } @else if (objectUrl()) {
            @if (isImage()) {
              <img
                [src]="objectUrl()"
                [alt]="data.name"
                [style.transform]="'scale(' + zoom() + ')'"
                class="max-w-full max-h-[var(--h-drawer)] transition-transform"
              />
            } @else if (isPdf()) {
              <iframe [src]="safeIframeUrl()" class="w-full h-[var(--h-drawer)] border-0"></iframe>
            } @else {
              <div class="flex flex-col items-center gap-2 text-text-muted">
                <div class="font-mono fs-label uppercase">
                  No inline preview for .{{ data.ext }}
                </div>
                <button
                  type="button"
                  class="font-mono fs-label uppercase border border-border bg-surface px-3 py-1.5 cursor-pointer"
                  (click)="data.onDownload?.()"
                >
                  Download to view
                </button>
              </div>
            }
          }
        </div>
      </section>

      <!-- ===== Rail ===== -->
      <aside class="pv-rail">
        <header class="pv-rail-head">
          <div class="ttl">Details</div>
          <button class="x" type="button" (click)="close()" aria-label="Close">×</button>
        </header>
        <div class="pv-meta">
          <div class="k">SIZE</div>
          <div class="v">{{ formatBytes(data.sizeBytes) }}</div>
          <div class="k">TYPE</div>
          <div class="v">{{ data.ext.toUpperCase() }}</div>
          @if (data.uploadedOn) {
            <div class="k">UPLOADED</div>
            <div class="v">{{ shortDate(data.uploadedOn) }}</div>
          }
          @if (data.uploadedBy) {
            <div class="k">BY</div>
            <div class="v">{{ data.uploadedBy }}</div>
          }
          @for (m of data.meta ?? []; track m.label) {
            <div class="k">{{ m.label }}</div>
            <div class="v">
              {{ m.value }}
              @if (m.ar) {
                <span class="ar">{{ m.ar }}</span>
              }
            </div>
          }
        </div>
        @if (data.links?.length) {
          <div class="pv-sect-h"><span>LINKED</span></div>
          @for (l of data.links!; track l.label) {
            <div class="pv-link" (click)="l.onOpen?.()">
              <span class="ic">{{ l.glyph || '↗' }}</span>
              <div class="nm">
                {{ l.label }}
                @if (l.sublabel) {
                  <span class="sub">{{ l.sublabel }}</span>
                }
              </div>
            </div>
          }
        }
        <div class="pv-act">
          <button type="button" class="act primary" (click)="data.onDownload?.()">Download</button>
          <button type="button" class="act" (click)="close()">Close</button>
        </div>
      </aside>
    </div>
  `,
  styles: [
    `
      :host {
        display: block;
        height: 100vh;
        width: 100vw;
        max-width: 1100px;
      }

      .pv-shell {
        display: grid;
        grid-template-columns: 1fr 380px;
        height: 100%;
        background: var(--surface);
      }
      .pv-canvas {
        background: var(--color-border-soft);
        padding: 24px 28px;
        display: flex;
        flex-direction: column;
        min-width: 0;
      }
      .pv-canvas-head {
        display: flex;
        align-items: center;
        justify-content: space-between;
        margin-bottom: 14px;
      }
      .pv-canvas-head .nm {
        font-size: 14px;
        font-weight: 600;
        color: var(--color-text-primary);
        overflow: hidden;
        text-overflow: ellipsis;
      }
      .pv-canvas-head .nm .sub {
        display: block;
        font-family: var(--mono);
        font-size: 10px;
        color: var(--color-text-muted);
        margin-top: 3px;
        font-weight: 400;
      }
      .pv-tools {
        display: flex;
        gap: 4px;
      }
      .pv-tools .b {
        width: 30px;
        height: 30px;
        display: flex;
        align-items: center;
        justify-content: center;
        background: var(--surface);
        border: 1px solid var(--color-border);
        color: var(--color-text-secondary);
        cursor: pointer;
        font-size: 16px;
        line-height: 1;
      }
      .pv-tools .b:hover {
        color: var(--color-text-primary);
      }
      .pv-paper {
        flex: 1;
        background: var(--surface);
        border: 1px solid var(--color-border);
        display: flex;
        align-items: center;
        justify-content: center;
        position: relative;
        min-height: 500px;
        padding: 32px;
        overflow: auto;
      }

      .pv-rail {
        background: var(--surface);
        border-left: 1px solid var(--color-border);
        display: flex;
        flex-direction: column;
      }
      .pv-rail-head {
        padding: 16px 20px;
        border-bottom: 1px solid var(--color-border);
        display: flex;
        align-items: center;
        justify-content: space-between;
      }
      .pv-rail-head .ttl {
        font-size: 14px;
        font-weight: 600;
      }
      .pv-rail-head .x {
        color: var(--color-text-muted);
        cursor: pointer;
        width: 24px;
        height: 24px;
        display: flex;
        align-items: center;
        justify-content: center;
        background: transparent;
        border: 0;
        font-size: 18px;
        line-height: 1;
      }
      .pv-rail-head .x:hover {
        color: var(--color-text-primary);
      }
      .pv-meta {
        padding: 16px 20px;
        border-bottom: 1px solid var(--color-border);
        display: grid;
        grid-template-columns: 90px 1fr;
        row-gap: 11px;
        column-gap: 14px;
        font-size: 12.5px;
      }
      .pv-meta .k {
        font-family: var(--mono);
        font-size: 10px;
        color: var(--color-text-muted);
      }
      .pv-meta .v {
        color: var(--color-text-primary);
        font-weight: 500;
      }
      .pv-meta .v .ar {
        font-family: var(--font-arabic, var(--mono));
        font-size: 11px;
        color: var(--color-text-muted);
        display: block;
        margin-top: 2px;
        direction: rtl;
        font-weight: 400;
      }
      .pv-sect-h {
        padding: 14px 20px 4px;
        font-family: var(--mono);
        font-size: 9.5px;
        color: var(--color-text-muted);
      }
      .pv-link {
        display: grid;
        grid-template-columns: 20px 1fr;
        gap: 10px;
        padding: 9px 20px;
        align-items: center;
        border-bottom: 1px solid var(--color-border-soft);
        font-size: 12.5px;
        cursor: pointer;
      }
      .pv-link:hover {
        background: var(--color-hover, var(--color-border-soft));
      }
      .pv-link .ic {
        color: var(--color-text-muted);
      }
      .pv-link .nm {
        font-weight: 500;
      }
      .pv-link .nm .sub {
        display: block;
        font-family: var(--mono);
        font-size: 10px;
        color: var(--color-text-muted);
        margin-top: 2px;
        font-weight: 400;
      }
      .pv-act {
        padding: 16px 20px;
        display: flex;
        gap: 8px;
        margin-top: auto;
        border-top: 1px solid var(--color-border);
      }
      .pv-act .act {
        flex: 1;
        appearance: none;
        border: 1px solid var(--color-border);
        background: var(--surface);
        padding: 8px 12px;
        font-size: 12.5px;
        cursor: pointer;
      }
      .pv-act .act:hover {
        background: var(--color-hover, var(--color-border-soft));
      }
      .pv-act .act.primary {
        background: var(--color-text-primary);
        color: var(--surface);
        border-color: var(--color-text-primary);
      }
    `,
  ],
})
export class PeraFilePreviewDrawerComponent implements OnInit, OnDestroy {
  readonly data = inject(PERA_MODAL_DATA) as FilePreviewData;
  private readonly ref = inject(PeraModalRef) as PeraModalRef<void>;

  readonly objectUrl = signal<string | null>(null);
  readonly loading = signal(true);
  readonly error = signal<string | null>(null);
  readonly zoom = signal(1);

  readonly isImage = computed(() =>
    ['jpg', 'jpeg', 'png', 'gif', 'webp', 'bmp', 'svg'].includes(this.data.ext.toLowerCase()),
  );
  readonly isPdf = computed(() => this.data.ext.toLowerCase() === 'pdf');
  readonly safeIframeUrl = computed(() => this.objectUrl());

  ngOnInit(): void {
    this.data.fetchBlob().subscribe({
      next: (blob) => {
        this.objectUrl.set(URL.createObjectURL(blob));
        this.loading.set(false);
      },
      error: () => {
        this.error.set('Could not load preview.');
        this.loading.set(false);
      },
    });
  }

  ngOnDestroy(): void {
    const url = this.objectUrl();
    if (url) URL.revokeObjectURL(url);
  }

  close(): void {
    this.ref.close();
  }
  zoomIn(): void {
    this.zoom.update((z) => Math.min(3, z + 0.25));
  }
  zoomOut(): void {
    this.zoom.update((z) => Math.max(0.5, z - 0.25));
  }

  formatBytes(bytes: number): string {
    if (bytes < 1024) return `${bytes} B`;
    if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
    return `${(bytes / 1024 / 1024).toFixed(1)} MB`;
  }

  shortDate(iso: string): string {
    const d = new Date(iso);
    if (Number.isNaN(d.getTime())) return iso;
    return d.toLocaleDateString(undefined, { month: 'short', day: 'numeric', year: 'numeric' });
  }
}
