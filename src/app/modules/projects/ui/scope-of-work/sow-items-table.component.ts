import {
  ChangeDetectionStrategy,
  Component,
  ElementRef,
  afterRenderEffect,
  inject,
  input,
  output,
  signal,
} from '@angular/core';
import { FormsModule } from '@angular/forms';
import { RouterLink } from '@angular/router';
import {
  PeraEmptyComponent,
  PeraIconComponent,
  PeraInputComponent,
  PeraMoneyInputComponent,
} from '@ds';
import type { CatalogKey } from '@platform/i18n/catalog/en';
import { CatalogService } from '@platform/i18n/catalog.service';
import { ScopeOfWorkItem, UpdateScopeOfWorkItemRequest } from '../../model/scope-of-work.model';
import { InnerInputLabelDirective } from './inner-input-label.directive';

/** One inline edit, ready for `PUT …/items/{itemId}`. */
export interface SowItemUpdate {
  itemId: string;
  request: UpdateScopeOfWorkItemRequest;
}

/** Server limits (`UpdateScopeOfWorkItemCommandValidator`, C §8.4.15). */
const NAME_MAX = 200;
const FEE_MAX = 1_000_000_000_000;

const ICON_BUTTON =
  'inline-flex items-center justify-center h-8 w-8 text-text-secondary hover:bg-surface-muted ' +
  'outline-none focus-visible:outline-2 focus-visible:outline-accent ' +
  'disabled:opacity-30 disabled:cursor-not-allowed cursor-pointer';
const CELL = 'px-3 py-2 align-middle border-b border-border';
const HEAD = 'px-3 py-2 fs-caption font-semibold text-text-muted text-start bg-surface-muted';

/**
 * Scope-of-work items (B2-B5, B13): inline name and fee, move up/down, remove, the
 * `sourceMissing` warning and, once confirmed, the created-stage link. Presentational: it
 * emits, the page calls the store. Each edit commits on `change` and always re-sends the
 * stored `description`, which the full-replace PUT would otherwise clear (C §8.4.4).
 */
@Component({
  selector: 'app-sow-items-table',
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [
    FormsModule,
    RouterLink,
    InnerInputLabelDirective,
    PeraEmptyComponent,
    PeraIconComponent,
    PeraInputComponent,
    PeraMoneyInputComponent,
  ],
  host: { class: 'block' },
  template: `
    @if (items().length === 0) {
      <pera-empty [title]="catalog.t('sow.empty')" iconName="inbox" />
    } @else {
      <div class="overflow-x-auto">
        <table class="w-full border-collapse text-sm">
          <thead>
            <tr>
              <th scope="col" class="${HEAD} w-12">#</th>
              <th scope="col" class="${HEAD}">{{ catalog.t('sow.colName') }}</th>
              <th scope="col" class="${HEAD}">{{ catalog.t('sow.colFrom') }}</th>
              <th scope="col" class="${HEAD} w-44 text-end">{{ catalog.t('sow.colFee') }}</th>
              @if (editable()) {
                <th scope="col" class="${HEAD} w-28">
                  <span class="sr-only">{{ catalog.t('sow.colActions') }}</span>
                </th>
              }
            </tr>
          </thead>
          <tbody>
            @for (item of items(); track item.id; let i = $index, first = $first, last = $last) {
              <tr [attr.data-item-id]="item.id">
                <td class="${CELL} font-mono text-text-muted">{{ item.order }}</td>
                <td class="${CELL} min-w-56">
                  <pera-input
                    [appInnerInputLabel]="catalog.t('sow.nameOf', { n: item.order })"
                    [ngModel]="current(item).name"
                    [disabled]="!editable()"
                    [error]="errors()[item.id + ':name'] ? 'invalid' : undefined"
                    (change)="onName(item, $event)"
                  />
                  @if (errors()[item.id + ':name']; as key) {
                    <p class="m-0 mt-1 fs-caption text-danger" role="alert">{{ catalog.t(key) }}</p>
                  }
                  @if (item.sourceMissing) {
                    <p class="m-0 mt-1 flex items-start gap-1 fs-caption text-warning">
                      <pera-icon name="alert-triangle" [size]="14" class="shrink-0 mt-0.5" />
                      <span>{{ catalog.t('sow.sourceMissing') }}</span>
                    </p>
                  }
                  @if (confirmed() && item.createdStageId) {
                    <a
                      class="inline-block mt-1 fs-caption text-accent hover:underline"
                      [routerLink]="['/projects', projectId(), 'stages', item.createdStageId]"
                      >{{ catalog.t('sow.stageCreated', { n: item.order }) }}</a
                    >
                  }
                </td>
                <td class="${CELL} text-text-muted whitespace-nowrap">
                  {{ item.sourceTemplateName ?? '—' }}
                </td>
                <td class="${CELL}">
                  <pera-money-input
                    [appInnerInputLabel]="catalog.t('sow.feeOf', { n: item.order })"
                    [ngModel]="current(item).fee"
                    [disabled]="!editable()"
                    [error]="errors()[item.id + ':fee'] ? 'invalid' : undefined"
                    (change)="onFee(item, $event)"
                  />
                  @if (errors()[item.id + ':fee']; as key) {
                    <p class="m-0 mt-1 fs-caption text-danger" role="alert">{{ catalog.t(key) }}</p>
                  }
                </td>
                @if (editable()) {
                  <td class="${CELL} whitespace-nowrap text-end">
                    <button
                      type="button"
                      class="${ICON_BUTTON}"
                      data-action="up"
                      [disabled]="first || pending()"
                      [attr.aria-label]="catalog.t('sow.moveUp', { n: item.order })"
                      (click)="move(i, -1)"
                    >
                      <pera-icon name="arrow-up" [size]="16" aria-hidden="true" />
                    </button>
                    <button
                      type="button"
                      class="${ICON_BUTTON}"
                      data-action="down"
                      [disabled]="last || pending()"
                      [attr.aria-label]="catalog.t('sow.moveDown', { n: item.order })"
                      (click)="move(i, 1)"
                    >
                      <pera-icon name="arrow-down" [size]="16" aria-hidden="true" />
                    </button>
                    <button
                      type="button"
                      class="${ICON_BUTTON} hover:text-danger"
                      data-action="remove"
                      [disabled]="pending()"
                      [attr.aria-label]="catalog.t('sow.remove', { n: item.order })"
                      (click)="onRemove(item.id, i)"
                    >
                      <pera-icon name="trash" [size]="16" aria-hidden="true" />
                    </button>
                  </td>
                }
              </tr>
            }
          </tbody>
        </table>
      </div>
    }
  `,
})
export class SowItemsTableComponent {
  protected readonly catalog = inject(CatalogService);

  readonly items = input.required<ScopeOfWorkItem[]>();
  /** `scope.manage`, a Draft and a Stage-workflow project (B11, B12, B15). */
  readonly editable = input(false);
  /** Confirmed: each item links to the stage confirm created (B11). */
  readonly confirmed = input(false);
  readonly projectId = input('');
  /** FINDING-7-2: each item's body as last sent and not yet reloaded (the store's `itemDrafts`). */
  readonly drafts = input<Record<string, UpdateScopeOfWorkItemRequest>>({});
  /**
   * FINDING-7-14: a write or the reload after it is in flight (the store's saving || reloading).
   * crm-prod M6: move and remove wait for it too, so a quick second press can't act on stale rows.
   */
  readonly pending = input(false);

  readonly updateItem = output<SowItemUpdate>();
  /** Every item id, in the new order (B4). */
  readonly reorder = output<string[]>();
  readonly remove = output<string>();

  /** Client-side check failures, keyed `<itemId>:name|fee`. */
  protected readonly errors = signal<Record<string, CatalogKey>>({});

  /**
   * FINDING-7-6: the row action pressed, refocused once the reloaded rows render: the same
   * item's button (or its other enabled one), else the row now at that index. FINDING-7-14:
   * dropped if the action settles (`pending` seen, then false) with the rows unchanged, and
   * restored only while focus is on <body> or still inside the table.
   */
  private refocus: {
    id: string;
    index: number;
    action: string;
    items: ScopeOfWorkItem[];
    armed: boolean;
  } | null = null;
  private readonly host = inject<ElementRef<HTMLElement>>(ElementRef);

  constructor() {
    afterRenderEffect(() => {
      const items = this.items();
      const pending = this.pending();
      const target = this.refocus;
      if (!target) return;
      if (items === target.items) {
        if (pending) target.armed = true;
        else if (target.armed) this.refocus = null;
        return;
      }
      this.refocus = null;
      const root = this.host.nativeElement;
      const active = document.activeElement;
      if (active && active !== document.body && !root.contains(active)) return;
      const rows = root.querySelectorAll('tbody tr');
      const row =
        root.querySelector(`tr[data-item-id="${target.id}"]`) ??
        rows[Math.min(target.index, rows.length - 1)];
      const enabled = (sel: string) => row?.querySelector<HTMLElement>(`${sel}:not(:disabled)`);
      (enabled(`[data-action="${target.action}"]`) ?? enabled('button'))?.focus();
    });
  }

  protected onRemove(itemId: string, index: number): void {
    if (this.pending()) return;
    this.refocus = { id: itemId, index, action: 'remove', items: this.items(), armed: false };
    this.remove.emit(itemId);
  }

  protected onName(item: ScopeOfWorkItem, event: Event): void {
    if (!this.editable()) return;
    const name = valueOf(event).trim();
    if (name.length < 1 || name.length > NAME_MAX) {
      this.setError(`${item.id}:name`, 'sow.nameInvalid');
      return;
    }
    this.setError(`${item.id}:name`, null);
    if (name !== this.current(item).name) this.emitUpdate(item, { name });
  }

  protected onFee(item: ScopeOfWorkItem, event: Event): void {
    if (!this.editable()) return;
    const raw = valueOf(event).replace(/[,\s]/g, '');
    const fee = raw === '' ? NaN : Number(raw);
    if (!Number.isFinite(fee) || fee < 0 || fee > FEE_MAX) {
      this.setError(`${item.id}:fee`, 'sow.feeInvalid');
      return;
    }
    this.setError(`${item.id}:fee`, null);
    if (fee !== this.current(item).fee) this.emitUpdate(item, { fee });
  }

  protected move(index: number, delta: -1 | 1): void {
    if (this.pending()) return;
    const ids = this.items().map((i) => i.id);
    const target = index + delta;
    if (target < 0 || target >= ids.length) return;
    [ids[index], ids[target]] = [ids[target], ids[index]];
    const action = delta < 0 ? 'up' : 'down';
    this.refocus = { id: ids[target], index: target, action, items: this.items(), armed: false };
    this.reorder.emit(ids);
  }

  /**
   * FINDING-7-2: the item's latest body: its unsaved draft, else the stored values.
   * FINDING-7-4: the inputs show it too, so a failed save (draft dropped) reverts its input.
   */
  protected current(item: ScopeOfWorkItem): UpdateScopeOfWorkItemRequest {
    return (
      this.drafts()[item.id] ?? { name: item.name, description: item.description, fee: item.fee }
    );
  }

  /** FINDING-7-2: built on the draft, so a fee edit made before a name save reloads keeps it. */
  private emitUpdate(item: ScopeOfWorkItem, change: Partial<UpdateScopeOfWorkItemRequest>): void {
    this.updateItem.emit({ itemId: item.id, request: { ...this.current(item), ...change } });
  }

  private setError(key: string, value: CatalogKey | null): void {
    this.errors.update((all) => {
      const next = { ...all };
      if (value) next[key] = value;
      else delete next[key];
      return next;
    });
  }
}

function valueOf(event: Event): string {
  const target = event.target as HTMLInputElement | null;
  return target?.value ?? '';
}
