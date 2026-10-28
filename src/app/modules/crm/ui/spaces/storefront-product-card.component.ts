import { ChangeDetectionStrategy, Component, computed, inject, input, output } from '@angular/core';
import { CatalogService } from '@platform/i18n/catalog.service';
import type { CatalogItem } from '../../model';
import { PeraButtonComponent, PeraIconComponent } from '@ds';
import { categoryTint } from './storefront-art';

/** A resolved spec chip on the card — the ITEM's own value only, never a room override
 * (there is no room yet; this card is choosing what to record). */
export interface ProductSpecChip {
  readonly label: string;
  readonly value: string;
}

export type ProductCardState = 'add' | 'added' | 'locked';

export interface ProductCardVm {
  readonly item: CatalogItem;
  readonly categoryName: string;
  readonly rootCategoryId: string;
  readonly specs: readonly ProductSpecChip[];
  readonly state: ProductCardState;
}

/**
 * One product tile — tri-state: **Add** → **Added** (click removes) → **Already chosen**
 * (a `Single` ancestor is already occupied by any row, catalog or custom; disabled, no
 * click). Category-tinted placeholder art stands in for a missing `imageUri` — see
 * `storefront-art.ts` for why it is a hash-derived tint, not the prototype's per-root SVGs.
 */
@Component({
  selector: 'app-crm-storefront-product-card',
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [PeraButtonComponent, PeraIconComponent],
  template: `
    <div class="flex flex-col border border-border rounded-card overflow-hidden bg-surface">
      <div class="relative aspect-[4/3] flex items-center justify-center" [class]="tint().bg">
        @if (item().imageUri; as uri) {
          <img [src]="uri" alt="" class="w-full h-full object-cover" />
        } @else {
          <pera-icon name="inbox" [size]="28" [class]="tint().fg" />
        }
        @if (state() === 'added') {
          <span
            class="absolute top-1.5 end-1.5 w-5 h-5 rounded-full bg-accent text-bg flex items-center justify-center"
          >
            <pera-icon name="check" [size]="12" />
          </span>
        }
        @if (!item().isPurchasable) {
          <span
            class="absolute top-1.5 start-1.5 fs-micro px-1.5 py-0.5 rounded bg-surface-muted text-text-secondary"
            >{{ categoryName() }}</span
          >
        }
      </div>
      <div class="flex flex-col gap-1 p-2.5 flex-1">
        <span class="fs-body-sm font-medium text-text truncate" dir="auto">{{ name() }}</span>
        <span class="fs-micro text-text-muted truncate" dir="auto">{{ categoryName() }}</span>
        @if (specs().length > 0) {
          <div class="flex flex-wrap gap-1 mt-0.5">
            @for (spec of specs().slice(0, 3); track spec.label) {
              <span class="fs-micro px-1.5 py-0.5 rounded bg-surface-muted text-text-secondary"
                >{{ spec.label }}: {{ spec.value }}</span
              >
            }
            @if (specs().length > 3) {
              <span class="fs-micro px-1.5 py-0.5 rounded bg-surface-muted text-text-secondary"
                >+{{ specs().length - 3 }}</span
              >
            }
          </div>
        }
        <div class="mt-auto pt-1.5">
          @switch (state()) {
            @case ('added') {
              <pera-button
                variant="secondary"
                size="sm"
                class="w-full"
                iconStart="check"
                (click)="action.emit()"
                >{{ catalog.t('store.added') }}</pera-button
              >
            }
            @case ('locked') {
              <button
                type="button"
                disabled
                class="w-full fs-caption text-text-muted border border-dashed border-border rounded px-2 py-1.5 cursor-not-allowed"
              >
                {{ catalog.t('store.alreadyChosen') }}
              </button>
            }
            @default {
              <pera-button
                variant="primary"
                size="sm"
                class="w-full"
                iconStart="plus"
                (click)="action.emit()"
                >{{ catalog.t('store.add') }}</pera-button
              >
            }
          }
        </div>
      </div>
    </div>
  `,
})
export class CrmStorefrontProductCardComponent {
  protected readonly catalog = inject(CatalogService);

  readonly item = input.required<CatalogItem>();
  readonly categoryName = input.required<string>();
  readonly rootCategoryId = input.required<string>();
  readonly specs = input<readonly ProductSpecChip[]>([]);
  readonly state = input<ProductCardState>('add');

  /** Add when idle, remove when already added — never fires while locked. */
  readonly action = output<void>();

  protected readonly tint = computed(() => categoryTint(this.rootCategoryId()));

  name(): string {
    const i = this.item();
    return this.catalog.locale() === 'ar' ? i.nameAr || i.nameEn : i.nameEn;
  }
}
