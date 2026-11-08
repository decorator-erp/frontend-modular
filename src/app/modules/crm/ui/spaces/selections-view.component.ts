import { ChangeDetectionStrategy, Component, inject, input } from '@angular/core';
import { CatalogService } from '@platform/i18n/catalog.service';
import type { SpaceSelection } from '../../model';

/**
 * crmp C-6: storefront picks, READ-ONLY. Used by the storefront panel rows and by the brief entry
 * snapshot (`selections` on #34 office / #84 portal). On the portal each pick's `notes` is `null`
 * (FINDING-F-9), so nothing renders for it there.
 */
@Component({
  selector: 'app-crm-selections-view',
  changeDetection: ChangeDetectionStrategy.OnPush,
  host: { class: 'block' },
  template: `
    <ul class="flex flex-col gap-1.5 m-0 p-0 list-none" data-selections>
      @for (pick of selections(); track pick.id || $index) {
        <li class="flex flex-col gap-0.5" data-selection>
          <div class="flex items-baseline gap-2 flex-wrap">
            <span class="fs-body-sm font-medium text-text-primary" dir="auto">{{
              name(pick.itemNameEn, pick.itemNameAr)
            }}</span>
            <span class="fs-caption text-text-muted" dir="ltr">{{ pick.itemCode }}</span>
            <span class="fs-caption text-text-secondary" data-qty
              >{{ catalog.t('storefront.qtyLabel') }}
              <span dir="ltr">{{ formatQuantity(pick.quantity) }}</span></span
            >
          </div>
          @if (pick.options.length > 0) {
            <div class="fs-caption text-text-secondary flex flex-wrap gap-x-3">
              @for (o of pick.options; track o.attributeId) {
                <span dir="auto"
                  >{{ name(o.attributeNameEn, o.attributeNameAr) }}:
                  {{ name(o.optionNameEn, o.optionNameAr) }}</span
                >
              }
            </div>
          }
          @if (pick.notes) {
            <p class="fs-caption text-text-secondary m-0" dir="auto" data-notes>{{ pick.notes }}</p>
          }
        </li>
      }
    </ul>
  `,
})
export class CrmSelectionsViewComponent {
  protected readonly catalog = inject(CatalogService);
  readonly selections = input.required<readonly SpaceSelection[]>();

  protected name(en: string, ar: string): string {
    return this.catalog.locale() === 'ar' ? ar || en : en;
  }

  /** Up to the column's 3 decimals, invariant digits. */
  protected formatQuantity(value: number): string {
    return String(Math.round(value * 1000) / 1000);
  }
}
