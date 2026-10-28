import { ChangeDetectionStrategy, Component, inject, input, output, signal } from '@angular/core';
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
              <tr>
                <td class="${CELL} font-mono text-text-muted">{{ item.order }}</td>
                <td class="${CELL} min-w-56">
                  <pera-input
                    [appInnerInputLabel]="catalog.t('sow.nameOf', { n: item.order })"
                    [ngModel]="item.name"
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
                    [ngModel]="item.fee"
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
                      [disabled]="first"
                      [attr.aria-label]="catalog.t('sow.moveUp', { n: item.order })"
                      (click)="move(i, -1)"
                    >
                      <pera-icon name="arrow-up" [size]="16" aria-hidden="true" />
                    </button>
                    <button
                      type="button"
                      class="${ICON_BUTTON}"
                      [disabled]="last"
                      [attr.aria-label]="catalog.t('sow.moveDown', { n: item.order })"
                      (click)="move(i, 1)"
                    >
                      <pera-icon name="arrow-down" [size]="16" aria-hidden="true" />
                    </button>
                    <button
                      type="button"
                      class="${ICON_BUTTON} hover:text-danger"
                      [attr.aria-label]="catalog.t('sow.remove', { n: item.order })"
                      (click)="remove.emit(item.id)"
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

  readonly updateItem = output<SowItemUpdate>();
  /** Every item id, in the new order (B4). */
  readonly reorder = output<string[]>();
  readonly remove = output<string>();

  /** Client-side check failures, keyed `<itemId>:name|fee`. */
  protected readonly errors = signal<Record<string, CatalogKey>>({});

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
    const ids = this.items().map((i) => i.id);
    const target = index + delta;
    if (target < 0 || target >= ids.length) return;
    [ids[index], ids[target]] = [ids[target], ids[index]];
    this.reorder.emit(ids);
  }

  /** FINDING-7-2: the item's latest body: its unsaved draft, else the stored values. */
  private current(item: ScopeOfWorkItem): UpdateScopeOfWorkItemRequest {
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
