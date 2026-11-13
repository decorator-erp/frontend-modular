import {
  ChangeDetectionStrategy,
  Component,
  computed,
  effect,
  inject,
  input,
  output,
  signal,
} from '@angular/core';
import { NgTemplateOutlet } from '@angular/common';
import { CdkConnectedOverlay, CdkOverlayOrigin } from '@angular/cdk/overlay';
import { PermissionsService } from '@platform/permissions/permissions.service';
import { PeraIconComponent } from '../../components/icon/pera-icon.component';
import { PeraButtonComponent } from '../../components/button/pera-button.component';
import { PeraDropdownComponent } from '../../components/dropdown/pera-dropdown.component';
import { PeraSkeletonComponent } from '../skeleton/pera-skeleton.component';
import { PeraEmptyComponent } from '../empty-state/pera-empty.component';
import { PeraPaginationComponent } from '../pagination/pera-pagination.component';
import {
  ColumnDef,
  TableBulkAction,
  TableEmpty,
  TableExportFormat,
  TableRowAction,
  TableSort,
} from './column-def';

/**
 * `default` preserves the table's original rhythm. `compact` matches the hubs
 * prototype (`DMS Module Hubs.dc.html`): --fs-caption cell text and cell padding
 * snapped to the spacing ladder (8px block / 12px inline). `comfortable` is the
 * roomy variant the density toggle offers — and, since RD-1, the default: taller rows, zebra
 * stripes and an accent hover (the owner's "comfortable tables" pick).
 */
type Density = 'default' | 'comfortable' | 'compact';

/** Label tier for every column header — applied in ONE place (FR-008 / SC-006). */
const HEADER_LABEL = 'uppercase tracking-wide fs-label font-semibold text-text-muted';

@Component({
  selector: 'pera-data-table',
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [
    NgTemplateOutlet,
    CdkConnectedOverlay,
    CdkOverlayOrigin,
    PeraIconComponent,
    PeraButtonComponent,
    PeraDropdownComponent,
    PeraSkeletonComponent,
    PeraEmptyComponent,
    PeraPaginationComponent,
  ],
  host: { class: 'block' },
  template: `
    <!-- Table tools: density · columns · export -->
    @if (toolbarVisible()) {
      <div class="flex items-center justify-end gap-1 mb-2">
        <button
          type="button"
          class="inline-flex items-center justify-center w-7 h-7 text-text-muted hover:bg-hover hover:text-text-primary
                 cursor-pointer outline-none focus-visible:outline-2 focus-visible:outline-accent"
          [attr.aria-label]="
            effectiveDensity() === 'comfortable' ? 'Compact rows' : 'Comfortable rows'
          "
          (click)="toggleDensity()"
        >
          <pera-icon name="menu" [size]="15" />
        </button>

        <pera-dropdown [closeOnSelect]="false" [minWidth]="180">
          <button
            trigger
            type="button"
            class="inline-flex items-center justify-center w-7 h-7 text-text-muted hover:bg-hover hover:text-text-primary
                   cursor-pointer outline-none focus-visible:outline-2 focus-visible:outline-accent"
            aria-label="Toggle columns"
          >
            <pera-icon name="eye" [size]="15" />
          </button>
          @for (col of columns(); track col.key) {
            <label
              class="flex items-center gap-2 px-3 py-1.5 cursor-pointer hover:bg-hover text-text-primary font-sans"
            >
              <input
                type="checkbox"
                class="w-3.5 h-3.5 accent-[var(--color-accent)]"
                [checked]="!hiddenKeys().has(col.key)"
                (change)="toggleColumn(col.key)"
              />
              {{ col.header }}
            </label>
          }
        </pera-dropdown>

        @if (exportable()) {
          <pera-dropdown [minWidth]="140">
            <button
              trigger
              type="button"
              class="inline-flex items-center justify-center w-7 h-7 text-text-muted hover:bg-hover hover:text-text-primary
                     cursor-pointer outline-none focus-visible:outline-2 focus-visible:outline-accent"
              aria-label="Export"
            >
              <pera-icon name="file-text" [size]="15" />
            </button>
            <button
              type="button"
              role="menuitem"
              class="w-full text-start px-3 py-1.5 hover:bg-hover cursor-pointer"
              (click)="export.emit('csv')"
            >
              CSV
            </button>
            <button
              type="button"
              role="menuitem"
              class="w-full text-start px-3 py-1.5 hover:bg-hover cursor-pointer"
              (click)="export.emit('xlsx')"
            >
              Excel
            </button>
            <button
              type="button"
              role="menuitem"
              class="w-full text-start px-3 py-1.5 hover:bg-hover cursor-pointer"
              (click)="export.emit('pdf')"
            >
              PDF
            </button>
          </pera-dropdown>
        }
      </div>
    }

    <!-- Bulk-action toolbar -->
    @if (selectable() && selection().size > 0) {
      <div
        class="flex items-center gap-2 px-3 py-2 bg-accent-soft border border-border mb-2 flex-wrap"
      >
        <span class="fs-body-sm font-medium text-accent">{{ selection().size }} selected</span>
        @for (action of allowedBulkActions(); track action.label) {
          <pera-button size="xs" variant="secondary" (click)="action.action(selection())">
            {{ action.label }}
          </pera-button>
        }
        <ng-content select="[bulkBar]" />
        <pera-button size="xs" variant="ghost" (click)="clearSelection()">Clear</pera-button>
      </div>
    }

    @if (loading()) {
      <div class="flex flex-col gap-2" aria-busy="true">
        @for (i of skeletonRows; track i) {
          <pera-skeleton [height]="effectiveDensity() === 'comfortable' ? 40 : 32" />
        }
      </div>
    } @else if (error()) {
      <div
        class="border border-border bg-surface rounded-card px-6 py-10 flex flex-col items-center text-center gap-2"
        role="alert"
      >
        <pera-icon name="x" [size]="20" class="text-danger" />
        <p class="text-sm font-medium text-text-primary">{{ error() }}</p>
        @if (hasRetry()) {
          <pera-button size="sm" variant="secondary" (click)="retry.emit()">Retry</pera-button>
        }
      </div>
    } @else if (rows().length === 0) {
      <pera-empty
        [title]="empty()?.title || 'Nothing here yet'"
        [description]="empty()?.description"
        [cta]="empty()?.cta"
      />
    } @else {
      <!-- Desktop table -->
      <div class="max-md:hidden overflow-x-auto border border-border bg-surface rounded-card">
        <table class="w-full border-collapse text-sm">
          <thead>
            <tr class="border-b border-border">
              @if (selectable()) {
                <th
                  class="w-10 px-3 py-2 sticky top-0 z-10 bg-surface-muted"
                  [class.start-0]="stickyFirstCol()"
                  [class.z-20]="stickyFirstCol()"
                >
                  <input
                    type="checkbox"
                    class="w-4 h-4 accent-[var(--color-accent)]"
                    [checked]="allSelected()"
                    [indeterminate]="someSelected()"
                    (change)="toggleAll()"
                    aria-label="Select all rows"
                  />
                </th>
              }
              @for (col of visibleColumns(); track col.key; let first = $first) {
                <!-- Every column header is the label tier. The classes go on the
                     RENDERED text in both branches, not just the th cell: the sortable
                     branch is a button element, which does not reliably inherit
                     text-transform, and that is what made the casing look mixed. -->
                <th
                  class="px-3 py-2 text-start whitespace-nowrap sticky top-0 z-10 bg-surface-muted {{
                    HEADER_LABEL
                  }}"
                  [class.start-0]="stickyFirstCol() && first && !selectable()"
                  [class.z-20]="stickyFirstCol() && first && !selectable()"
                  [style.width.px]="col.width"
                  [style.minWidth.px]="col.minWidth"
                >
                  @if (col.sortable) {
                    <button
                      type="button"
                      class="inline-flex items-center gap-1 cursor-pointer hover:text-text-primary outline-none
                             focus-visible:outline-2 focus-visible:outline-accent {{
                        HEADER_LABEL
                      }}"
                      (click)="toggleSort(col.key)"
                    >
                      {{ col.header }}
                      @if (sortBy() === col.key) {
                        <pera-icon
                          [name]="sortDir() === 'asc' ? 'arrow-up' : 'arrow-down'"
                          [size]="12"
                        />
                      }
                    </button>
                  } @else {
                    <span [class]="HEADER_LABEL">{{ col.header }}</span>
                  }
                </th>
              }
              @if (rowActions().length > 0) {
                <th class="w-10 px-3 py-2 sticky top-0 z-10 bg-surface-muted">
                  <span class="sr-only">Actions</span>
                </th>
              }
            </tr>
          </thead>
          <tbody>
            @for (row of rows(); track rowKey(row, $index)) {
              <tr
                class="border-b last:border-b-0 transition-colors"
                [class.cursor-pointer]="hasRowClick()"
                [class.border-border]="effectiveDensity() !== 'comfortable'"
                [class.hover:bg-hover]="effectiveDensity() !== 'comfortable'"
                [class.h-8]="effectiveDensity() === 'default'"
                [class.h-11]="effectiveDensity() === 'comfortable'"
                [class.odd:bg-surface-muted/60]="effectiveDensity() === 'comfortable'"
                [class.border-transparent]="effectiveDensity() === 'comfortable'"
                [class.hover:bg-accent-soft]="effectiveDensity() === 'comfortable'"
                [attr.data-density]="effectiveDensity()"
                (click)="rowClick.emit(row)"
              >
                @if (selectable()) {
                  <td
                    class="px-3"
                    [class.sticky]="stickyFirstCol()"
                    [class.start-0]="stickyFirstCol()"
                    [class.bg-surface]="stickyFirstCol()"
                    (click)="$event.stopPropagation()"
                  >
                    <input
                      type="checkbox"
                      class="w-4 h-4 accent-[var(--color-accent)]"
                      [checked]="selection().has(rowKey(row, $index))"
                      (change)="toggleRow(row, $index)"
                      [attr.aria-label]="'Select row'"
                    />
                  </td>
                }
                @for (col of visibleColumns(); track col.key; let first = $first) {
                  <td
                    [class]="cellClass()"
                    [style.padding]="cellPadding()"
                    [class.sticky]="stickyFirstCol() && first && !selectable()"
                    [class.start-0]="stickyFirstCol() && first && !selectable()"
                    [class.bg-surface]="stickyFirstCol() && first && !selectable()"
                  >
                    @if (col.template) {
                      <ng-container *ngTemplateOutlet="col.template; context: { $implicit: row }" />
                    } @else {
                      <span class="text-text-primary">{{ cellValue(row, col) }}</span>
                    }
                  </td>
                }
                @if (rowActions().length > 0) {
                  <td class="px-3 text-end" (click)="$event.stopPropagation()">
                    <ng-container
                      *ngTemplateOutlet="
                        actionsMenu;
                        context: { $implicit: row, id: rowKey(row, $index) }
                      "
                    />
                  </td>
                }
              </tr>
            }
          </tbody>
        </table>
      </div>

      <!-- Mobile stacked cards -->
      <div class="md:hidden flex flex-col gap-2">
        @for (row of rows(); track rowKey(row, $index)) {
          <div
            class="bg-surface border border-border rounded-card p-3 flex flex-col gap-2"
            (click)="rowClick.emit(row)"
          >
            <div class="flex items-start justify-between gap-2">
              <div class="flex items-center gap-2 min-w-0">
                @if (selectable()) {
                  <input
                    type="checkbox"
                    class="w-4 h-4 accent-[var(--color-accent)] shrink-0"
                    [checked]="selection().has(rowKey(row, $index))"
                    (change)="toggleRow(row, $index)"
                    (click)="$event.stopPropagation()"
                    [attr.aria-label]="'Select row'"
                  />
                }
              </div>
              @if (rowActions().length > 0) {
                <span (click)="$event.stopPropagation()">
                  <ng-container
                    *ngTemplateOutlet="
                      actionsMenu;
                      context: { $implicit: row, id: 'm-' + rowKey(row, $index) }
                    "
                  />
                </span>
              }
            </div>
            @for (col of visibleColumns(); track col.key) {
              @if (!col.hideOnMobile) {
                <div class="flex items-start justify-between gap-3 text-sm">
                  <span class="shrink-0 pt-0.5 {{ HEADER_LABEL }}">{{ col.header }}</span>
                  <span class="text-end min-w-0 [overflow-wrap:anywhere]">
                    @if (col.template) {
                      <ng-container *ngTemplateOutlet="col.template; context: { $implicit: row }" />
                    } @else {
                      {{ cellValue(row, col) }}
                    }
                  </span>
                </div>
              }
            }
          </div>
        }
      </div>

      <!-- Cursor "load more" (cursor pagination) -->
      @if (nextCursor()) {
        <div class="mt-3 flex justify-center">
          <pera-button size="sm" variant="secondary" (click)="loadMore.emit()"
            >Load more</pera-button
          >
        </div>
      }

      <!-- Offset pagination -->
      @if (totalCount() !== undefined && totalCount()! > 0) {
        <div class="mt-3">
          <pera-pagination
            [page]="page() || 1"
            [pageSize]="pageSize() || 20"
            [totalCount]="totalCount()!"
            (pageChange)="pageChange.emit($event)"
          />
        </div>
      }
    }

    <!-- Row actions menu template -->
    <ng-template #actionsMenu let-row let-id="id">
      <button
        type="button"
        cdkOverlayOrigin
        #menuOrigin="cdkOverlayOrigin"
        class="inline-flex p-1 text-text-muted hover:text-text-primary hover:bg-hover
               cursor-pointer outline-none focus-visible:outline-2 focus-visible:outline-accent"
        aria-label="Row actions"
        [attr.aria-expanded]="openMenuId() === id"
        (click)="toggleMenu(id)"
      >
        <pera-icon name="more-horizontal" [size]="16" />
      </button>
      <ng-template
        cdkConnectedOverlay
        [cdkConnectedOverlayOrigin]="menuOrigin"
        [cdkConnectedOverlayOpen]="openMenuId() === id"
        [cdkConnectedOverlayHasBackdrop]="true"
        cdkConnectedOverlayBackdropClass="cdk-overlay-transparent-backdrop"
        (backdropClick)="closeMenu()"
        (detach)="closeMenu()"
      >
        <div class="bg-surface border border-border rounded-lg shadow-md py-1 min-w-40" role="menu">
          @for (action of allowedRowActions(); track action.label) {
            @if (!action.visible || action.visible(row)) {
              <button
                type="button"
                role="menuitem"
                class="w-full text-start px-3 py-1.5 text-sm cursor-pointer hover:bg-hover"
                [class.text-danger]="action.tone === 'danger'"
                (click)="runAction(action, row)"
              >
                {{ action.label }}
              </button>
            }
          }
        </div>
      </ng-template>
    </ng-template>
  `,
})
export class PeraDataTableComponent<T> {
  private readonly permissions = inject(PermissionsService);

  readonly columns = input<ColumnDef<T>[]>([]);
  readonly rows = input<T[]>([]);
  readonly loading = input(false);
  readonly error = input<string | null>(null);
  readonly empty = input<TableEmpty | undefined>(undefined);
  readonly sortBy = input<string | null>(null);
  readonly sortDir = input<'asc' | 'desc'>('asc');
  readonly page = input<number | undefined>(undefined);
  readonly pageSize = input<number | undefined>(undefined);
  readonly totalCount = input<number | undefined>(undefined);
  readonly nextCursor = input<string | null>(null);
  readonly selectable = input(false);
  readonly rowId = input<((row: T) => string) | undefined>(undefined);
  readonly bulkActions = input<TableBulkAction[]>([]);
  readonly rowActions = input<TableRowAction<T>[]>([]);
  /** Row rhythm. `default` is today's behaviour; `compact` matches the prototype. */
  /** RD-1: tables are comfortable by default (taller rows, zebra stripes); users can still switch. */
  readonly density = input<Density>('comfortable');
  readonly hasRowClick = input(false);
  readonly hasRetry = input(false);
  /** Stable key — persists density + hidden columns to localStorage and shows the tools row. */
  readonly tableKey = input<string | null>(null);
  readonly showTools = input(false);
  readonly exportable = input(false);
  readonly stickyFirstCol = input(false);

  readonly sortChange = output<TableSort>();
  readonly pageChange = output<number>();
  readonly loadMore = output<void>();
  readonly selectionChange = output<Set<string>>();
  readonly rowClick = output<T>();
  readonly export = output<TableExportFormat>();
  readonly retry = output<void>();

  readonly selection = signal<Set<string>>(new Set());
  readonly openMenuId = signal<string | null>(null);
  readonly skeletonRows = [1, 2, 3, 4, 5, 6];

  /** User overrides (persisted). Null = follow the `density` input / column defaults. */
  private readonly densityOverride = signal<Density | null>(null);
  private readonly hiddenOverride = signal<Set<string> | null>(null);
  private seeded = false;

  constructor() {
    // Inputs aren't bound at construction — seed persisted prefs once tableKey lands.
    effect(() => {
      const key = this.tableKey();
      if (this.seeded || !key) return;
      this.seeded = true;
      const d = this.readDensity();
      if (d) this.densityOverride.set(d);
      const h = this.readHidden();
      if (h) this.hiddenOverride.set(h);
    });
  }

  readonly effectiveDensity = computed(() => this.densityOverride() ?? this.density());

  protected readonly HEADER_LABEL = HEADER_LABEL;

  /** Compact drops to the caption step; the other densities keep `text-sm`. */
  protected readonly cellClass = computed(() =>
    this.effectiveDensity() === 'compact' ? 'align-middle fs-caption' : 'align-middle text-sm',
  );

  /**
   * Compact padding is the prototype's 10px/14px snapped to the spacing ladder:
   * 8px block, 12px inline. Expressed as tokens, never as raw pixels.
   */
  protected readonly cellPadding = computed(() =>
    this.effectiveDensity() === 'compact' ? 'var(--space-2) var(--space-3)' : null,
  );

  readonly hiddenKeys = computed(() => {
    const override = this.hiddenOverride();
    if (override) return override;
    return new Set(
      this.columns()
        .filter((c) => c.hidden)
        .map((c) => c.key),
    );
  });

  readonly visibleColumns = computed(() =>
    this.columns().filter((c) => !this.hiddenKeys().has(c.key)),
  );

  readonly toolbarVisible = computed(
    () => this.showTools() || !!this.tableKey() || this.exportable(),
  );

  readonly allowedBulkActions = computed(() =>
    this.bulkActions().filter((a) => !a.capability || this.permissions.can(a.capability)),
  );
  readonly allowedRowActions = computed(() =>
    this.rowActions().filter((a) => !a.capability || this.permissions.can(a.capability)),
  );

  readonly allSelected = computed(
    () => this.rows().length > 0 && this.selection().size === this.rows().length,
  );
  readonly someSelected = computed(
    () => this.selection().size > 0 && this.selection().size < this.rows().length,
  );

  rowKey(row: T, index: number): string {
    const fn = this.rowId();
    return fn ? fn(row) : String(index);
  }

  cellValue(row: T, col: ColumnDef<T>): string {
    const v = col.value ? col.value(row) : (row as Record<string, unknown>)[col.key];
    return v === null || v === undefined || v === '' ? '—' : String(v);
  }

  toggleSort(key: string): void {
    const dir = this.sortBy() === key && this.sortDir() === 'asc' ? 'desc' : 'asc';
    this.sortChange.emit({ sortBy: key, sortDir: dir });
  }

  toggleDensity(): void {
    const next: Density = this.effectiveDensity() === 'comfortable' ? 'compact' : 'comfortable';
    this.densityOverride.set(next);
    this.writeKey('density', next);
  }

  toggleColumn(key: string): void {
    const next = new Set(this.hiddenKeys());
    next.has(key) ? next.delete(key) : next.add(key);
    this.hiddenOverride.set(next);
    this.writeKey('hidden', JSON.stringify([...next]));
  }

  toggleAll(): void {
    const next = this.allSelected()
      ? new Set<string>()
      : new Set(this.rows().map((row, i) => this.rowKey(row, i)));
    this.selection.set(next);
    this.selectionChange.emit(next);
  }

  toggleRow(row: T, index: number): void {
    const key = this.rowKey(row, index);
    const next = new Set(this.selection());
    next.has(key) ? next.delete(key) : next.add(key);
    this.selection.set(next);
    this.selectionChange.emit(next);
  }

  clearSelection(): void {
    this.selection.set(new Set());
    this.selectionChange.emit(this.selection());
  }

  toggleMenu(id: string): void {
    this.openMenuId.update((current) => (current === id ? null : id));
  }

  closeMenu(): void {
    this.openMenuId.set(null);
  }

  runAction(action: TableRowAction<T>, row: T): void {
    this.closeMenu();
    action.action(row);
  }

  // ---- localStorage persistence (per tableKey) -----------------------------

  private storageKey(suffix: string): string | null {
    const key = this.tableKey();
    return key ? `pera.table.${key}.${suffix}` : null;
  }

  private readDensity(): Density | null {
    const k = this.storageKey('density');
    if (!k) return null;
    try {
      const v = localStorage.getItem(k);
      return v === 'compact' || v === 'comfortable' ? v : null;
    } catch {
      return null;
    }
  }

  private readHidden(): Set<string> | null {
    const k = this.storageKey('hidden');
    if (!k) return null;
    try {
      const v = localStorage.getItem(k);
      if (!v) return null;
      const arr = JSON.parse(v) as string[];
      return Array.isArray(arr) ? new Set(arr) : null;
    } catch {
      return null;
    }
  }

  private writeKey(suffix: string, value: string): void {
    const k = this.storageKey(suffix);
    if (!k) return;
    try {
      localStorage.setItem(k, value);
    } catch {
      /* storage unavailable — keep the in-memory override */
    }
  }
}
