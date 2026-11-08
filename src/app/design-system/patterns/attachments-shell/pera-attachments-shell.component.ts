import { ChangeDetectionStrategy, Component, computed, input, output, signal } from '@angular/core';
import { DecimalPipe } from '@angular/common';

export interface AttachmentFolder {
  id: string;
  /** Display label. Auto-generated date folders use `YYYY-MM-DD`. */
  label: string;
  /** Optional Arabic subtitle (rendered with `.ar` per template). */
  labelAr?: string | null;
  /** Item count rendered on the right side of the rail row. */
  count?: number;
  /** Nest one level (template's `.at-folder.nested` style). */
  nested?: boolean;
  /** Optional section header text rendered before this folder (e.g. "ALBUMS"). */
  section?: string;
}

export interface AttachmentItem {
  id: string;
  name: string;
  /** lowercase extension w/o dot; used for the `.ext` badge and thumb variant. */
  ext: string;
  sizeBytes: number;
  uploadedBy?: string | null;
  uploadedOn?: string | null;
  /** Optional outbound link (e.g. linked task) — renders as a mono chip in list view. */
  linkLabel?: string | null;
  /** Belongs to which folder id. Empty means it appears in every folder. */
  folderId?: string | null;
  /** Pre-resolved thumbnail URL for images. Falls back to a styled placeholder when absent. */
  thumbUrl?: string | null;
  /** Locked: the row offers no delete and blocks bulk move/delete; a lock glyph shows instead. */
  locked?: boolean;
  /** Short version tag shown in list view (e.g. `v2`); absent for a first version. */
  versionLabel?: string | null;
}

export interface StorageUsage {
  usedBytes: number;
  totalBytes: number;
}

export type AttachmentView = 'grid' | 'list';

/**
 * Attachments shell — port of the locked `.at-shell` vocabulary from
 * `PERA App - Attachments.html`. Presentational only: it owns selection + view
 * state, the host owns folders, items, storage, and the side effects of every
 * output (upload / open / move / delete).
 *
 * Render this whenever a feature needs attachments: project Documents hub,
 * Stage / Task detail tabs, Invoice / Ledger evidence. Date-album folders
 * (per the FEATURE_PROMPT_STAGE_TASK_EMPLOYEE.md spec) are generated client-side
 * by the host and passed in as regular folders — there is no special "album"
 * mode here.
 */
@Component({
  selector: 'pera-attachments-shell',
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [DecimalPipe],
  template: `
    <div class="at-shell">
      <!-- ===== LEFT RAIL ===== -->
      <aside class="at-rail">
        <header class="at-rail-head">
          <span class="lbl">FOLDERS</span>
          @if (canManage()) {
            <button type="button" class="plus" (click)="folderCreate.emit()" title="New folder">
              +
            </button>
          }
        </header>

        @for (f of folders(); track f.id) {
          @if (f.section) {
            <div class="at-rail-sect">{{ f.section }}</div>
          }
          <div
            class="at-folder"
            [class.active]="f.id === selectedFolderId()"
            [class.nested]="f.nested"
            (click)="folderSelect.emit(f.id)"
          >
            <span class="ic">
              <svg
                width="14"
                height="14"
                viewBox="0 0 24 24"
                fill="none"
                stroke="currentColor"
                stroke-width="1.6"
              >
                <path
                  d="M3 7a2 2 0 0 1 2-2h4l2 2h8a2 2 0 0 1 2 2v9a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2V7z"
                />
              </svg>
            </span>
            <span class="nm"
              >{{ f.label }}
              @if (f.labelAr) {
                <span class="ar">{{ f.labelAr }}</span>
              }
            </span>
            @if (f.count != null) {
              <span class="ct">{{ f.count }}</span>
            }
          </div>
        }

        @if (storage(); as st) {
          <div class="at-storage">
            <div class="k">STORAGE</div>
            <div class="v">
              {{ formatBytes(st.usedBytes) }}
              <span class="sub">/ {{ formatBytes(st.totalBytes) }}</span>
            </div>
            <div class="bar"><div class="fl" [style.width.%]="storagePct(st)"></div></div>
            <div class="lg">
              <span>{{ storagePct(st) | number: '1.0-0' }}% used</span>
              <span>{{ formatBytes(Math.max(0, st.totalBytes - st.usedBytes)) }} free</span>
            </div>
          </div>
        }
      </aside>

      <!-- ===== RIGHT CANVAS ===== -->
      <section class="at-canvas">
        <header class="at-bar">
          <div class="at-bar-l">
            <div class="at-bcrumb">
              <span class="now"
                >{{ activeFolder()?.label || 'All files' }}
                @if (activeFolder()?.labelAr) {
                  <span class="ar">{{ activeFolder()?.labelAr }}</span>
                }
              </span>
              <span class="sep">·</span>
              <span class="ct">{{ visibleItems().length }} items</span>
            </div>
          </div>
          <div class="at-bar-r">
            <div class="at-search">
              <svg
                width="13"
                height="13"
                viewBox="0 0 24 24"
                fill="none"
                stroke="currentColor"
                stroke-width="2"
              >
                <circle cx="11" cy="11" r="7" />
                <path d="M21 21l-4.35-4.35" />
              </svg>
              <input
                type="search"
                placeholder="Search files"
                [value]="query()"
                (input)="onQuery($event)"
              />
            </div>
            <div class="at-viewtog">
              <button
                type="button"
                [class.on]="view() === 'list'"
                (click)="setView('list')"
                title="List view"
              >
                <svg
                  width="13"
                  height="13"
                  viewBox="0 0 24 24"
                  fill="none"
                  stroke="currentColor"
                  stroke-width="2"
                >
                  <path d="M3 6h18M3 12h18M3 18h18" />
                </svg>
              </button>
              <button
                type="button"
                [class.on]="view() === 'grid'"
                (click)="setView('grid')"
                title="Grid view"
              >
                <svg
                  width="13"
                  height="13"
                  viewBox="0 0 24 24"
                  fill="none"
                  stroke="currentColor"
                  stroke-width="2"
                >
                  <rect x="3" y="3" width="7" height="7" />
                  <rect x="14" y="3" width="7" height="7" />
                  <rect x="3" y="14" width="7" height="7" />
                  <rect x="14" y="14" width="7" height="7" />
                </svg>
              </button>
            </div>
          </div>
        </header>

        @if (canManage()) {
          <div
            class="at-drop"
            [class.dragover]="dragging()"
            (dragover)="onDragOver($event)"
            (dragleave)="dragging.set(false)"
            (drop)="onDrop($event)"
            (click)="filePicker.click()"
          >
            <div class="at-drop-ic">
              <svg
                width="18"
                height="18"
                viewBox="0 0 24 24"
                fill="none"
                stroke="currentColor"
                stroke-width="1.7"
              >
                <path d="M12 4v12M6 10l6-6 6 6" />
                <path d="M4 20h16" />
              </svg>
            </div>
            <div>
              <div class="t">Drop files here, or click to browse</div>
              <div class="m">{{ uploadHint() }}</div>
            </div>
            <button
              type="button"
              class="at-upload-btn"
              (click)="$event.stopPropagation(); filePicker.click()"
            >
              Upload
            </button>
            <input #filePicker type="file" multiple class="hidden" (change)="onPicked($event)" />
          </div>
        }

        @if (selectedIds().size > 0) {
          <div class="at-bulk">
            <span class="ct">{{ selectedIds().size }} selected</span>
            <div class="acts">
              <button class="ak" (click)="bulkDownload.emit(selectedIdsArray())">Download</button>
              @if (canManage() && !selectionLocked()) {
                <button class="ak" (click)="bulkMove.emit(selectedIdsArray())">Move</button>
                <button
                  class="ak solid"
                  (click)="bulkDelete.emit(selectedIdsArray()); clearSelection()"
                >
                  Delete
                </button>
              }
            </div>
          </div>
        }

        @if (view() === 'list') {
          <div class="at-list">
            <div class="at-list-head">
              <span></span>
              <span></span>
              <span>NAME</span>
              <span>SIZE</span>
              <span>LINKED</span>
              <span></span>
              <span>UPDATED</span>
              <span></span>
            </div>
            @for (i of visibleItems(); track i.id) {
              <div class="at-row" [class.sel]="selectedIds().has(i.id)" (click)="itemOpen.emit(i)">
                <span
                  class="at-cb"
                  [class.on]="selectedIds().has(i.id)"
                  (click)="$event.stopPropagation(); toggleSelect(i.id)"
                >
                  @if (selectedIds().has(i.id)) {
                    <svg
                      width="9"
                      height="9"
                      viewBox="0 0 24 24"
                      fill="none"
                      stroke="currentColor"
                      stroke-width="3"
                    >
                      <path d="M5 12l4 4L19 6" />
                    </svg>
                  }
                </span>
                <span class="at-ic" [class.img]="isImage(i.ext)">
                  {{ icon(i.ext) }}
                  <span class="ext">{{ i.ext.toUpperCase() }}</span>
                </span>
                <span class="at-name"
                  >{{ i.name }}
                  @if (i.uploadedBy) {
                    <span class="sub">{{ i.uploadedBy }}</span>
                  }
                </span>
                <span class="at-size">{{ formatBytes(i.sizeBytes) }}</span>
                <span>
                  @if (i.linkLabel) {
                    <span class="at-link"><span class="dot"></span>{{ i.linkLabel }}</span>
                  }
                </span>
                <span>
                  @if (i.versionLabel) {
                    <span class="font-mono fs-label text-text-muted" data-version>{{
                      i.versionLabel
                    }}</span>
                  }
                </span>
                <span class="at-when">{{ shortDate(i.uploadedOn) }}</span>
                @if (i.locked) {
                  <span
                    class="at-act inline-flex items-center justify-center cursor-default"
                    [title]="lockedLabel()"
                    [attr.aria-label]="lockedLabel()"
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
                } @else if (canManage()) {
                  <button
                    type="button"
                    class="at-act"
                    (click)="$event.stopPropagation(); itemDelete.emit(i)"
                    title="Delete"
                  >
                    ×
                  </button>
                } @else {
                  <span></span>
                }
              </div>
            } @empty {
              <p class="m-0 px-6 py-8 text-center text-text-muted text-xs leading-normal">
                No files in this folder. Drag some in or use Upload.
              </p>
            }
          </div>
        } @else {
          <div class="at-grid">
            @for (i of visibleItems(); track i.id) {
              <div class="at-card" [class.sel]="selectedIds().has(i.id)" (click)="itemOpen.emit(i)">
                <div class="thumb" [class.img]="isImage(i.ext)" [class.pdf]="i.ext === 'pdf'">
                  <span class="ext">{{ i.ext.toUpperCase() }}</span>
                  @if (i.thumbUrl) {
                    <img [src]="i.thumbUrl" [alt]="i.name" />
                  } @else if (!isImage(i.ext)) {
                    <div class="ph-lines">
                      <span></span><span></span><span class="s"></span><span></span
                      ><span class="s"></span>
                    </div>
                  }
                </div>
                <div class="body">
                  <div class="nm">{{ i.name }}</div>
                  <div class="mt">
                    <span>{{ formatBytes(i.sizeBytes) }}</span>
                    @if (i.linkLabel) {
                      <span class="lk">↗ {{ i.linkLabel }}</span>
                    }
                  </div>
                </div>
              </div>
            } @empty {
              <p
                class="m-0 col-span-full px-6 py-8 text-center text-text-muted text-xs leading-normal"
              >
                No files in this folder.
              </p>
            }
          </div>
        }
      </section>
    </div>
  `,
  styles: [
    `
      :host {
        display: block;
      }

      /* === Locked classes copied 1:1 from PERA App - Attachments.html === */
      .at-shell {
        display: grid;
        grid-template-columns: 260px 1fr;
        min-height: 560px;
        border-top: 1px solid var(--color-border);
      }

      .at-rail {
        background: var(--surface);
        border-right: 1px solid var(--color-border);
        padding: 18px 0 24px;
      }
      .at-rail-head {
        padding: 0 18px 12px;
        display: flex;
        align-items: center;
        justify-content: space-between;
      }
      .at-rail-head .lbl {
        font-family: var(--mono);
        font-size: 9.5px;
        color: var(--color-text-muted);
        letter-spacing: 0.04em;
      }
      .at-rail-head .plus {
        width: 22px;
        height: 22px;
        display: flex;
        align-items: center;
        justify-content: center;
        color: var(--color-text-muted);
        border: 1px solid var(--color-border);
        background: transparent;
        cursor: pointer;
        font-size: 14px;
        line-height: 1;
      }
      .at-rail-head .plus:hover {
        color: var(--color-accent);
        border-color: var(--color-accent);
      }
      .at-folder {
        display: grid;
        grid-template-columns: 14px 1fr auto;
        gap: 9px;
        align-items: center;
        padding: 6px 18px;
        font-size: 12.5px;
        color: var(--color-text-secondary);
        cursor: pointer;
        position: relative;
        transition:
          background 0.12s,
          color 0.12s;
      }
      .at-folder:hover {
        background: var(--color-hover, var(--color-border-soft));
        color: var(--color-text-primary);
      }
      .at-folder.active {
        background: var(--color-accent-soft, var(--color-border-soft));
        color: var(--color-text-primary);
        font-weight: 500;
      }
      .at-folder.active::before {
        content: '';
        position: absolute;
        left: 0;
        top: 4px;
        bottom: 4px;
        width: 2px;
        background: var(--color-accent);
      }
      .at-folder .ic {
        color: var(--color-text-muted);
        display: flex;
      }
      .at-folder.active .ic {
        color: var(--color-accent);
      }
      .at-folder .ct {
        font-family: var(--mono);
        font-size: 10px;
        color: var(--color-text-muted);
      }
      .at-folder.nested {
        padding-left: 36px;
        font-size: 12px;
      }
      .at-folder .ar {
        font-family: var(--font-arabic, var(--mono));
        font-size: 11px;
        color: var(--color-text-muted);
        margin-left: 6px;
        direction: rtl;
      }
      .at-rail-sect {
        padding: 16px 18px 6px;
        font-family: var(--mono);
        font-size: 9.5px;
        color: var(--color-text-muted);
        display: flex;
        align-items: center;
        gap: 8px;
      }
      .at-rail-sect::after {
        content: '';
        flex: 1;
        height: 1px;
        background: var(--color-border);
      }
      .at-storage {
        padding: 14px 18px 0;
        border-top: 1px solid var(--color-border);
        margin: 18px 0 0;
      }
      .at-storage .k {
        font-family: var(--mono);
        font-size: 9.5px;
        color: var(--color-text-muted);
        margin-bottom: 6px;
      }
      .at-storage .v {
        font-size: 13px;
        font-weight: 500;
        margin-bottom: 8px;
      }
      .at-storage .v .sub {
        font-family: var(--mono);
        font-size: 10px;
        color: var(--color-text-muted);
        font-weight: 400;
        margin-left: 6px;
      }
      .at-storage .bar {
        height: 2px;
        background: var(--color-border-soft);
        position: relative;
        margin-bottom: 6px;
      }
      .at-storage .bar .fl {
        position: absolute;
        inset: 0 auto 0 0;
        background: var(--color-text-primary);
      }
      .at-storage .lg {
        font-family: var(--mono);
        font-size: 9.5px;
        color: var(--color-text-muted);
        display: flex;
        justify-content: space-between;
      }

      .at-canvas {
        background: var(--color-bg, var(--surface));
        display: flex;
        flex-direction: column;
      }
      .at-bar {
        padding: 14px 24px;
        display: flex;
        align-items: center;
        justify-content: space-between;
        gap: 16px;
        border-bottom: 1px solid var(--color-border);
        background: var(--surface);
        flex-wrap: wrap;
      }
      .at-bar-l {
        display: flex;
        align-items: center;
        gap: 14px;
      }
      .at-bcrumb {
        display: flex;
        align-items: baseline;
        gap: 8px;
        font-size: 13px;
        color: var(--color-text-secondary);
      }
      .at-bcrumb .now {
        color: var(--color-text-primary);
        font-weight: 600;
        font-size: 15px;
      }
      .at-bcrumb .now .ar {
        font-family: var(--font-arabic, var(--mono));
        font-size: 13px;
        color: var(--color-text-muted);
        font-weight: 500;
        margin-left: 8px;
        direction: rtl;
      }
      .at-bcrumb .sep {
        color: var(--color-text-muted);
        font-family: var(--mono);
      }
      .at-bcrumb .ct {
        font-family: var(--mono);
        font-size: 10.5px;
        color: var(--color-text-muted);
      }
      .at-bar-r {
        display: flex;
        align-items: center;
        gap: 8px;
      }
      .at-viewtog {
        display: inline-flex;
        border: 1px solid var(--color-border);
      }
      .at-viewtog button {
        width: 30px;
        height: 30px;
        background: var(--surface);
        border: 0;
        color: var(--color-text-muted);
        cursor: pointer;
        border-right: 1px solid var(--color-border);
        display: flex;
        align-items: center;
        justify-content: center;
      }
      .at-viewtog button:last-child {
        border-right: 0;
      }
      .at-viewtog button:hover {
        color: var(--color-text-primary);
      }
      .at-viewtog button.on {
        background: var(--color-text-primary);
        color: var(--surface);
      }
      .at-search {
        display: flex;
        align-items: center;
        gap: 8px;
        padding: 6px 11px;
        background: var(--color-bg, var(--surface));
        border: 1px solid var(--color-border);
        width: 240px;
      }
      .at-search svg {
        color: var(--color-text-muted);
      }
      .at-search input {
        flex: 1;
        background: none;
        border: 0;
        outline: 0;
        font-family: var(--sans);
        font-size: 12.5px;
        min-width: 0;
      }
      .at-search input::placeholder {
        color: var(--color-text-muted);
      }

      .at-drop {
        border: 1px dashed var(--color-border);
        background: var(--surface);
        margin: 18px 24px 0;
        padding: 18px 22px;
        display: grid;
        grid-template-columns: auto 1fr auto;
        gap: 16px;
        align-items: center;
        cursor: pointer;
        transition:
          border-color 0.15s,
          background 0.15s;
      }
      .at-drop:hover,
      .at-drop.dragover {
        border-color: var(--color-accent);
        background: var(--color-accent-soft, var(--color-border-soft));
      }
      .at-drop-ic {
        width: 36px;
        height: 36px;
        border: 1px solid var(--color-border);
        display: flex;
        align-items: center;
        justify-content: center;
        color: var(--color-text-secondary);
      }
      .at-drop .t {
        font-size: 13px;
        font-weight: 500;
      }
      .at-drop .m {
        font-family: var(--mono);
        font-size: 10px;
        color: var(--color-text-muted);
        margin-top: 3px;
      }
      .at-upload-btn {
        background: var(--color-text-primary);
        color: var(--surface);
        border: 0;
        padding: 8px 16px;
        font-family: var(--mono);
        font-size: 10.5px;
        text-transform: uppercase;
        letter-spacing: 0.04em;
        cursor: pointer;
      }
      .hidden {
        display: none;
      }

      .at-bulk {
        background: var(--color-text-primary);
        color: var(--surface);
        margin: 18px 24px 0;
        padding: 10px 16px;
        display: flex;
        align-items: center;
        justify-content: space-between;
        gap: 12px;
      }
      .at-bulk .ct {
        font-family: var(--mono);
        font-size: 11px;
      }
      .at-bulk .acts {
        display: flex;
        gap: 4px;
      }
      .at-bulk .ak {
        font-family: var(--mono);
        font-size: 10.5px;
        color: var(--surface);
        background: transparent;
        border: 1px solid rgba(255, 255, 255, 0.22);
        padding: 5px 10px;
        cursor: pointer;
      }
      .at-bulk .ak:hover {
        background: rgba(255, 255, 255, 0.12);
      }
      .at-bulk .ak.solid {
        background: var(--color-accent);
        border-color: var(--color-accent);
      }

      .at-list {
        margin: 18px 0 0;
      }
      .at-list-head {
        display: grid;
        grid-template-columns: 32px 26px 1fr 90px 110px 70px 120px 36px;
        gap: 12px;
        align-items: center;
        padding: 10px 24px;
        border-bottom: 1px solid var(--color-border);
        border-top: 1px solid var(--color-border-soft);
        font-family: var(--mono);
        font-size: 9.5px;
        color: var(--color-text-muted);
        background: var(--surface);
      }
      .at-row {
        display: grid;
        grid-template-columns: 32px 26px 1fr 90px 110px 70px 120px 36px;
        gap: 12px;
        align-items: center;
        padding: 10px 24px;
        border-bottom: 1px solid var(--color-border-soft);
        cursor: pointer;
        color: inherit;
        transition: background 0.12s;
      }
      .at-row:hover {
        background: var(--color-hover, var(--color-border-soft));
        box-shadow: inset 2px 0 0 var(--color-text-primary);
      }
      .at-row.sel {
        background: var(--color-accent-soft, var(--color-border-soft));
      }
      .at-cb {
        width: 14px;
        height: 14px;
        border: 1px solid var(--color-text-muted);
        display: flex;
        align-items: center;
        justify-content: center;
        cursor: pointer;
      }
      .at-cb.on {
        background: var(--color-text-primary);
        border-color: var(--color-text-primary);
        color: var(--surface);
      }
      .at-row:hover .at-cb {
        border-color: var(--color-text-primary);
      }
      .at-ic {
        width: 26px;
        height: 26px;
        display: flex;
        align-items: center;
        justify-content: center;
        border: 1px solid var(--color-border);
        background: var(--surface);
        position: relative;
        font-family: var(--mono);
        font-size: 9px;
        color: var(--color-text-muted);
      }
      .at-ic.img {
        background: linear-gradient(
          135deg,
          var(--color-accent-soft, var(--color-border-soft)) 0%,
          var(--surface) 100%
        );
        color: var(--color-accent);
      }
      .at-ic .ext {
        position: absolute;
        bottom: -1px;
        right: -1px;
        font-family: var(--mono);
        font-size: 7.5px;
        padding: 0 3px;
        background: var(--color-text-primary);
        color: var(--surface);
        line-height: 1.4;
      }
      .at-name {
        font-size: 13px;
        color: var(--color-text-primary);
        font-weight: 500;
        overflow: hidden;
        text-overflow: ellipsis;
        white-space: nowrap;
      }
      .at-name .sub {
        display: block;
        font-family: var(--mono);
        font-size: 10px;
        color: var(--color-text-muted);
        margin-top: 2px;
        font-weight: 400;
      }
      .at-size,
      .at-when {
        font-family: var(--mono);
        font-size: 11px;
        color: var(--color-text-secondary);
      }
      .at-link {
        display: inline-flex;
        align-items: center;
        gap: 5px;
        padding: 2px 7px;
        background: var(--surface);
        border: 1px solid var(--color-border);
        font-family: var(--mono);
        font-size: 10px;
        color: var(--color-text-secondary);
      }
      .at-link .dot {
        width: 5px;
        height: 5px;
        background: var(--color-accent);
        border-radius: 50%;
      }
      .at-act {
        width: 28px;
        height: 28px;
        background: transparent;
        border: 0;
        color: var(--color-text-muted);
        cursor: pointer;
        font-size: 14px;
      }
      .at-act:hover {
        color: var(--color-text-primary);
        background: var(--color-hover, var(--color-border-soft));
      }

      .at-grid {
        margin: 18px 24px 0;
        display: grid;
        grid-template-columns: repeat(auto-fill, minmax(180px, 1fr));
        gap: 14px;
      }
      .at-card {
        border: 1px solid var(--color-border);
        background: var(--surface);
        display: flex;
        flex-direction: column;
        cursor: pointer;
        color: inherit;
        transition: border-color 0.15s;
      }
      .at-card:hover {
        border-color: var(--color-text-primary);
      }
      .at-card.sel {
        border-color: var(--color-accent);
      }
      .at-card .thumb {
        aspect-ratio: 4/3;
        background: var(--color-bg, var(--surface));
        position: relative;
        display: flex;
        align-items: center;
        justify-content: center;
        color: var(--color-text-muted);
        border-bottom: 1px solid var(--color-border);
        overflow: hidden;
      }
      .at-card .thumb img {
        width: 100%;
        height: 100%;
        object-fit: cover;
      }
      .at-card .thumb.img {
        background: linear-gradient(
          135deg,
          color-mix(in srgb, var(--color-accent) 18%, var(--surface)) 0%,
          var(--surface) 100%
        );
      }
      .at-card .thumb.pdf {
        background: var(--color-border-soft);
      }
      .at-card .thumb .ext {
        position: absolute;
        top: 8px;
        left: 8px;
        font-family: var(--mono);
        font-size: 8.5px;
        padding: 2px 5px;
        background: var(--color-text-primary);
        color: var(--surface);
      }
      .at-card .thumb .ph-lines {
        position: absolute;
        inset: 22px 18px;
        border: 1px solid var(--color-border);
        padding: 6px;
        display: flex;
        flex-direction: column;
        gap: 4px;
      }
      .at-card .thumb .ph-lines span {
        display: block;
        height: 1px;
        background: var(--color-text-muted);
        opacity: 0.35;
      }
      .at-card .thumb .ph-lines span.s {
        width: 60%;
      }
      .at-card .body {
        padding: 9px 11px 11px;
      }
      .at-card .body .nm {
        font-size: 12.5px;
        font-weight: 500;
        line-height: 1.35;
        color: var(--color-text-primary);
        overflow: hidden;
        text-overflow: ellipsis;
        white-space: nowrap;
      }
      .at-card .body .mt {
        display: flex;
        align-items: center;
        justify-content: space-between;
        margin-top: 4px;
        font-family: var(--mono);
        font-size: 9.5px;
        color: var(--color-text-muted);
      }
      .at-card .body .mt .lk {
        color: var(--color-accent);
      }
    `,
  ],
})
export class PeraAttachmentsShellComponent {
  readonly folders = input<AttachmentFolder[]>([]);
  readonly items = input<AttachmentItem[]>([]);
  readonly storage = input<StorageUsage | null>(null);
  readonly selectedFolderId = input<string | null>(null);
  readonly defaultView = input<AttachmentView>('list');
  readonly uploadHint = input<string>('PDF, JPG, PNG, DWG — up to 25 MB each.');
  /** When false, all mutating controls (upload, new folder, delete, move) are hidden. */
  readonly canManage = input<boolean>(true);
  /** Tooltip / accessible label for a locked row's lock glyph (caller supplies the copy). */
  readonly lockedLabel = input<string>('Locked');

  readonly folderSelect = output<string>();
  readonly folderCreate = output<void>();
  readonly itemOpen = output<AttachmentItem>();
  readonly itemDelete = output<AttachmentItem>();
  readonly upload = output<File[]>();
  readonly bulkDownload = output<string[]>();
  readonly bulkMove = output<string[]>();
  readonly bulkDelete = output<string[]>();
  readonly viewChange = output<AttachmentView>();

  readonly view = signal<AttachmentView>('list');
  readonly query = signal('');
  readonly dragging = signal(false);
  readonly selectedIds = signal<Set<string>>(new Set());

  // expose to template
  readonly Math = Math;

  constructor() {
    queueMicrotask(() => this.view.set(this.defaultView()));
  }

  readonly activeFolder = computed(() => {
    const id = this.selectedFolderId();
    return id ? (this.folders().find((f) => f.id === id) ?? null) : null;
  });

  readonly visibleItems = computed(() => {
    const folder = this.activeFolder()?.id ?? null;
    const q = this.query().trim().toLowerCase();
    return this.items().filter((i) => {
      if (folder && i.folderId && i.folderId !== folder) return false;
      if (!q) return true;
      return i.name.toLowerCase().includes(q);
    });
  });

  setView(v: AttachmentView): void {
    this.view.set(v);
    this.viewChange.emit(v);
  }

  onQuery(ev: Event): void {
    this.query.set((ev.target as HTMLInputElement).value);
  }

  onDragOver(ev: DragEvent): void {
    ev.preventDefault();
    this.dragging.set(true);
  }

  onDrop(ev: DragEvent): void {
    ev.preventDefault();
    this.dragging.set(false);
    const files = Array.from(ev.dataTransfer?.files ?? []);
    if (files.length) this.upload.emit(files);
  }

  onPicked(ev: Event): void {
    const input = ev.target as HTMLInputElement;
    const files = Array.from(input.files ?? []);
    if (files.length) this.upload.emit(files);
    input.value = '';
  }

  toggleSelect(id: string): void {
    const next = new Set(this.selectedIds());
    if (next.has(id)) next.delete(id);
    else next.add(id);
    this.selectedIds.set(next);
  }

  /** True when any selected row is locked — bulk move/delete are then withheld. */
  readonly selectionLocked = computed(() => {
    const ids = this.selectedIds();
    return this.items().some((i) => i.locked && ids.has(i.id));
  });

  clearSelection(): void {
    this.selectedIds.set(new Set());
  }

  selectedIdsArray(): string[] {
    return [...this.selectedIds()];
  }

  storagePct(s: StorageUsage): number {
    return s.totalBytes ? Math.min(100, (s.usedBytes / s.totalBytes) * 100) : 0;
  }

  formatBytes(bytes: number): string {
    if (bytes < 1024) return `${bytes} B`;
    if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
    if (bytes < 1024 * 1024 * 1024) return `${(bytes / 1024 / 1024).toFixed(1)} MB`;
    return `${(bytes / 1024 / 1024 / 1024).toFixed(2)} GB`;
  }

  shortDate(iso?: string | null): string {
    if (!iso) return '—';
    const d = new Date(iso);
    if (Number.isNaN(d.getTime())) return '—';
    return d.toLocaleDateString(undefined, { month: 'short', day: 'numeric', year: 'numeric' });
  }

  isImage(ext: string): boolean {
    return ['jpg', 'jpeg', 'png', 'gif', 'webp', 'bmp', 'svg'].includes(ext.toLowerCase());
  }

  icon(ext: string): string {
    return ext ? '' : '·';
  }
}
