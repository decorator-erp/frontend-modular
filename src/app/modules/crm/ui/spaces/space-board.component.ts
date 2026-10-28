import {
  ChangeDetectionStrategy,
  Component,
  computed,
  effect,
  inject,
  Injector,
  input,
  output,
} from '@angular/core';
import { CatalogService } from '@platform/i18n/catalog.service';
import { CanDirective, PERM } from '@platform/permissions';
import { ToastService } from '@platform/feedback/toast.service';
import type { CatalogBreadcrumb, CrmSpace, SpaceItem } from '../../model';
import {
  ConfirmService,
  ModalService,
  PeraButtonComponent,
  PeraIconComponent,
  PeraStatusBadgeComponent,
} from '@ds';
import { CatalogStore } from '../../stores/catalog.store';
import { SpacesStore } from '../../stores/spaces.store';
import { domainErrorKey } from '../domain-error-key';
import { nextProvisionStatus, provisionStatusKey, provisionStatusTone } from './provision-status';
import {
  CrmEditItemAttributesDialogComponent,
  EditItemAttributesDialogData,
} from './edit-item-attributes-dialog.component';
import {
  CatalogItemDialogData,
  CrmCatalogItemDialogComponent,
} from '../admin/catalog/catalog-item-dialog.component';

interface BoardGroup {
  branch: CatalogBreadcrumb | null;
  items: SpaceItem[];
}

/** One resolved spec chip: `room` marks a room-level override winning over the item default. */
interface ResolvedSpec {
  label: string;
  value: string;
  room: boolean;
}

/**
 * A space's recorded items, grouped by their root branch. Each row shows an image
 * (icon fallback), name, a "from brief" chip when synced from an approved entry, its
 * spec/attribute chips, and an interactive provisioning badge that cycles on click.
 *
 * A CUSTOM row (`isCustom`) renders differently: the Custom chip, a category crumb (its
 * `path`'s last entry — a custom row's path ends at its OWN category, unlike a catalog
 * row's, which ends at the item), no spec chips, and no pencil — there is nothing to
 * edit attributes against. Status cycling and remove are identical either way.
 */
@Component({
  selector: 'app-crm-space-board',
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [CanDirective, PeraButtonComponent, PeraIconComponent, PeraStatusBadgeComponent],
  template: `
    <section class="bg-surface border border-border rounded-card">
      <header class="flex flex-col gap-2 px-4 py-3 border-b border-border">
        <div class="flex items-center gap-2">
          <span class="fs-label uppercase tracking-wide text-text-muted">{{
            catalog.t('space.boardTitle')
          }}</span>
          <pera-button
            variant="secondary"
            size="sm"
            iconStart="plus"
            class="ms-auto"
            *peraCan="PERM.crm.spaces.manage"
            (click)="record.emit()"
            >{{ catalog.t('space.recordItems') }}</pera-button
          >
        </div>
        @if (space().description; as description) {
          <p class="fs-caption text-text-secondary m-0 whitespace-pre-wrap" dir="auto">
            {{ description }}
          </p>
        }
      </header>

      <div class="p-4">
        @if (groups().length === 0) {
          <p class="fs-caption text-text-muted m-0">{{ catalog.t('space.emptyBoard') }}</p>
        } @else {
          <div class="flex flex-col gap-4">
            @for (group of groups(); track group.branch?.id ?? '_') {
              <div class="flex flex-col gap-2">
                @if (group.branch) {
                  <span class="fs-label uppercase tracking-wide text-text-muted">{{
                    name(group.branch)
                  }}</span>
                }
                @for (item of group.items; track item.trackKey) {
                  <div class="flex items-start gap-3 py-2 border-b border-border last:border-b-0">
                    @if (item.imageUri) {
                      <img
                        [src]="item.imageUri"
                        alt=""
                        class="w-10 h-10 object-cover rounded shrink-0"
                      />
                    } @else {
                      <span
                        class="w-10 h-10 rounded bg-surface-muted flex items-center justify-center shrink-0"
                      >
                        <pera-icon [name]="item.isCustom ? 'pencil' : 'package'" [size]="18" />
                      </span>
                    }
                    <div class="flex-1 min-w-0 flex flex-col gap-1">
                      <div class="flex items-center gap-2 flex-wrap">
                        <span class="fs-body text-text" dir="auto">{{ nodeName(item) }}</span>
                        @if (item.isCustom) {
                          <span
                            class="fs-micro px-1.5 py-0.5 rounded border border-warning bg-warning-soft text-warning"
                            >{{ catalog.t('space.custom') }}</span
                          >
                          @if (customCrumb(item); as crumb) {
                            <span class="fs-micro text-text-muted" dir="auto">{{ crumb }}</span>
                          }
                        }
                        @if (item.sourceBriefSpaceId) {
                          <span class="fs-micro px-1.5 py-0.5 rounded bg-accent-soft text-accent">{{
                            catalog.t('space.fromBrief')
                          }}</span>
                        }
                      </div>
                      @if (!item.isCustom && resolvedSpecs(item).length > 0) {
                        <div class="flex items-center gap-1.5 flex-wrap">
                          @for (spec of resolvedSpecs(item); track spec.label) {
                            <span
                              class="fs-micro px-1.5 py-0.5 rounded"
                              [class.bg-accent-soft]="spec.room"
                              [class.text-accent]="spec.room"
                              [class.border]="spec.room"
                              [class.border-accent]="spec.room"
                              [class.bg-surface-muted]="!spec.room"
                              [class.text-text-secondary]="!spec.room"
                              >{{ spec.label }}: {{ spec.value
                              }}{{ spec.room ? ' · ' + catalog.t('space.roomOverride') : '' }}</span
                            >
                          }
                        </div>
                      }
                      @if (item.note) {
                        <p class="fs-caption text-text-secondary m-0" dir="auto">{{ item.note }}</p>
                      }
                    </div>
                    <div class="flex items-center gap-1 shrink-0">
                      <button
                        type="button"
                        class="disabled:cursor-default"
                        *peraCan="PERM.crm.spaces.manage"
                        [disabled]="store.mutatingBySpace()[space().id]"
                        (click)="cycleStatus(item)"
                      >
                        <pera-status-badge
                          [tone]="tone(item.status)"
                          [label]="statusLabel(item.status)"
                          [dot]="false"
                        />
                      </button>
                      @if (!item.isCustom) {
                        <button
                          type="button"
                          class="p-1 rounded hover:bg-surface-muted"
                          *peraCan="PERM.crm.spaces.manage"
                          [attr.aria-label]="catalog.t('space.editAttributes')"
                          (click)="editAttributes(item)"
                        >
                          <pera-icon name="pencil" [size]="16" />
                        </button>
                      } @else {
                        <!-- Gated on crm.catalog.manage, not crm.spaces.manage — turning a
                             custom row into a catalog reference is a catalog-editing act,
                             matching the promote endpoint's own permission. -->
                        <button
                          type="button"
                          class="p-1 rounded hover:bg-surface-muted"
                          *peraCan="PERM.crm.catalog.manage"
                          [attr.aria-label]="catalog.t('space.promote')"
                          [title]="catalog.t('space.promote')"
                          (click)="promote(item)"
                        >
                          <pera-icon name="arrow-up" [size]="16" />
                        </button>
                      }
                      <button
                        type="button"
                        class="p-1 rounded hover:bg-surface-muted"
                        *peraCan="PERM.crm.spaces.manage"
                        [attr.aria-label]="catalog.t('space.remove')"
                        (click)="remove(item)"
                      >
                        <pera-icon name="trash-2" [size]="16" />
                      </button>
                    </div>
                  </div>
                }
              </div>
            }
          </div>
        }
      </div>
    </section>
  `,
})
export class CrmSpaceBoardComponent {
  protected readonly store = inject(SpacesStore);
  protected readonly catalog = inject(CatalogService);
  private readonly catalogStore = inject(CatalogStore);
  private readonly confirm = inject(ConfirmService);
  private readonly modal = inject(ModalService);
  private readonly toast = inject(ToastService);
  /** Lent to the attributes dialog and the promote item dialog so both can reach the
   * route-provided `SpacesStore`. */
  private readonly injector = inject(Injector);
  protected readonly PERM = PERM;

  readonly space = input.required<CrmSpace>();
  readonly record = output<void>();

  readonly groups = computed<BoardGroup[]>(() => {
    const items = this.store.board(this.space().id);
    const order: string[] = [];
    const map = new Map<string, BoardGroup>();
    for (const item of items) {
      const branch = item.path.length > 0 ? item.path[0] : null;
      const key = branch?.id ?? '_';
      if (!map.has(key)) {
        map.set(key, { branch, items: [] });
        order.push(key);
      }
      map.get(key)!.items.push(item);
    }
    return order.map((k) => map.get(k)!);
  });

  constructor() {
    // Fetch each catalog row's own item once, so `resolvedSpecs` has a default to merge
    // the room's override against. `loadItem` is load-once and no-ops on a cache hit, so
    // this effect re-running on every board change costs nothing once everything is warm.
    effect(() => {
      for (const item of this.store.board(this.space().id)) {
        if (!item.isCustom && item.catalogItemId) this.catalogStore.loadItem(item.catalogItemId);
      }
    });
  }

  name(x: { nameEn: string; nameAr: string }): string {
    return this.catalog.locale() === 'ar' ? x.nameAr || x.nameEn : x.nameEn;
  }

  nodeName(item: SpaceItem): string {
    return this.catalog.locale() === 'ar' ? item.nodeNameAr || item.nodeNameEn : item.nodeNameEn;
  }

  /** The crumb to show on a custom row — its own category, the last entry of its path. */
  customCrumb(item: SpaceItem): string | null {
    if (item.path.length === 0) return null;
    return this.name(item.path[item.path.length - 1]);
  }

  private formatValue(v: {
    optionId: string | null;
    optionNameEn: string | null;
    optionNameAr: string | null;
    valueText: string | null;
    valueNumber: number | null;
    valueBool: boolean | null;
    valueDate: string | null;
    unit: string | null;
  }): string | null {
    if (v.optionId) {
      return (this.catalog.locale() === 'ar' ? v.optionNameAr : v.optionNameEn) ?? '';
    }
    if (v.valueText != null) return v.valueText;
    if (v.valueNumber != null) return String(v.valueNumber) + (v.unit ? ' ' + v.unit : '');
    if (v.valueBool != null) return String(v.valueBool);
    if (v.valueDate != null) return v.valueDate;
    return null;
  }

  /**
   * The room-override precedence: the SPACE ITEM wire carries only what the room has
   * explicitly overridden (verified against `GetSpaceItemsQueryHandler` — it joins the
   * room's own value table, never the catalog item's), so an item's DEFAULT values are a
   * second, separately-cached fetch. For each attribute the item declares, in the item's
   * own declaration order: the room's value wins if set, else the item default, else the
   * attribute is omitted entirely — no chip for an attribute neither side has answered.
   */
  resolvedSpecs(item: SpaceItem): ResolvedSpec[] {
    if (item.isCustom || !item.catalogItemId) return [];
    const catalogItem = this.catalogStore.item(item.catalogItemId);
    if (!catalogItem) return [];
    const roomByAttr = new Map(item.attributes.map((a) => [a.attributeId, a]));
    const out: ResolvedSpec[] = [];
    for (const def of catalogItem.attributes) {
      const room = roomByAttr.get(def.attributeId);
      const roomValue = room ? this.formatValue(room) : null;
      if (roomValue !== null) {
        out.push({ label: this.name(def), value: roomValue, room: true });
        continue;
      }
      const itemValue = this.formatValue(def);
      if (itemValue !== null) {
        out.push({ label: this.name(def), value: itemValue, room: false });
      }
    }
    return out;
  }

  tone(status: SpaceItem['status']) {
    return provisionStatusTone(status);
  }

  statusLabel(status: SpaceItem['status']): string {
    return this.catalog.t(provisionStatusKey(status));
  }

  cycleStatus(item: SpaceItem): void {
    this.store.setItemStatus(this.space().id, item.id, {
      status: nextProvisionStatus(item.status),
    });
  }

  /**
   * Offered on every row, not only rows that already show chips: an item whose attributes are
   * all unset renders no chips at all, and that is exactly the item most in need of this. A
   * node that defines none is handled by the dialog's own empty state.
   */
  editAttributes(item: SpaceItem): void {
    const data: EditItemAttributesDialogData = { spaceId: this.space().id, item };
    // No result handling — the store refetches this space's board on success.
    this.modal.open<boolean>(CrmEditItemAttributesDialogComponent, {
      size: 'md',
      data,
      injector: this.injector,
    });
  }

  remove(item: SpaceItem): void {
    void this.confirm
      .open({ title: this.catalog.t('space.remove'), body: this.nodeName(item), tone: 'danger' })
      .then((ok) => ok && this.store.removeItem(this.space().id, item.id));
  }

  /**
   * Custom row → item dialog, pre-filled with the typed name and category → create the
   * catalog item → `promoteItem` re-points this row at it. The dialog closes with the
   * new item's id (or `null` on cancel); `promoteItem` already refetches the board on
   * success via the same `mutateBoard` path every other board mutation uses.
   */
  promote(item: SpaceItem): void {
    if (!item.isCustom || !item.customCategoryId) return;
    const data: CatalogItemDialogData = {
      categoryId: item.customCategoryId,
      item: null,
      prefillName: item.customName,
    };
    this.modal
      .open<string | null>(CrmCatalogItemDialogComponent, {
        size: 'md',
        data,
        injector: this.injector,
      })
      .afterClosed()
      .then((newItemId) => {
        if (!newItemId) return;
        this.store.promoteItem(this.space().id, item.id, newItemId, {
          onDone: () =>
            this.toast.show({ tone: 'success', message: this.catalog.t('space.promoted') }),
          onError: (parsed, fallback) =>
            this.toast.show({
              tone: 'danger',
              message: this.catalog.t(domainErrorKey(parsed.code, fallback)),
            }),
        });
      });
  }
}
