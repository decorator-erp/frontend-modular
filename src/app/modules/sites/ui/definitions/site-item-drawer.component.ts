import { ChangeDetectionStrategy, Component, computed, inject } from '@angular/core';
import {
  PERA_MODAL_DATA,
  PeraBadgeComponent,
  PeraButtonComponent,
  PeraDrawerComponent,
  PeraSkeletonComponent,
} from '@ds';
import { CatalogService } from '@platform/i18n/catalog.service';
import type { CatalogKey } from '@platform/i18n/catalog/en';
import { SITE_ITEM_DATA_TYPE_LABEL, SiteItemDataType } from '../../model/site-enums';
import type { SiteItem, SiteItemOption } from '../../model/site-definition.model';
import { localName } from '../../model/site-normalize';
import type { SiteDefinitionsStore } from '../../stores/site-definitions.store';
import { limitsText } from './site-def-forms';

export interface SiteItemDrawerData {
  itemId: string;
  store: SiteDefinitionsStore;
  edit: (i: SiteItem) => void;
  shape: (i: SiteItem) => void;
  toggleActive: (i: SiteItem) => void;
  remove: (i: SiteItem) => void;
  addOption: (i: SiteItem) => void;
  editOption: (i: SiteItem, o: SiteItemOption) => void;
  toggleOption: (i: SiteItem, o: SiteItemOption) => void;
}

/**
 * sites S-10: the item drawer (prototype `openItem`, `sites.js:916-926`): status, captured count and
 * the modules it is linked to (D15, detached links included), options for a Select item (add D20,
 * edit D13, (de)activate D14), and the item actions — Delete (D18), Change shape (D17), (de)activate
 * (D19), Edit (D16). It reads the page store, so every write shows here at once.
 */
@Component({
  selector: 'app-site-item-drawer',
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [PeraBadgeComponent, PeraButtonComponent, PeraDrawerComponent, PeraSkeletonComponent],
  template: `
    <pera-drawer [title]="title()">
      @if (item(); as i) {
        <div class="flex flex-col gap-4" data-item-drawer>
          <p class="m-0 fs-label text-text-secondary" dir="auto">
            {{ t(typeKey(i.dataType)) }}{{ i.unit ? ' · ' + i.unit : '' }} · {{ limits(i) }}
          </p>
          <div class="flex items-center gap-2 flex-wrap">
            @if (i.isSystem) {
              <pera-badge tone="neutral">{{ t('sv.system') }}</pera-badge>
            }
            <pera-badge [tone]="i.isActive ? 'success' : 'neutral'" [dot]="true">{{
              t(i.isActive ? 'sv.active' : 'sv.inactive')
            }}</pera-badge>
            @if (usage(); as u) {
              <span class="fs-label text-text-secondary" data-captured>{{
                t('sv.capturedN', { n: u.capturedValueCount })
              }}</span>
            }
          </div>

          <section>
            <h3 class="m-0 mb-2 fs-micro uppercase text-text-muted">{{ t('sv.usedIn') }}</h3>
            @if (usage() === undefined) {
              <pera-skeleton [height]="24" />
            } @else if (usage() === null) {
              <p class="m-0 fs-label text-text-muted">{{ t('sv.usageLoadFailed') }}</p>
            } @else {
              @for (m of usage()!.modules; track m.moduleId) {
                <div class="flex items-center gap-2 py-1.5 border-b border-border" data-usage>
                  <span class="flex-1" dir="ltr">{{ m.code }}</span>
                  @if (m.isRequired) {
                    <pera-badge tone="warning">{{ t('sv.required') }}</pera-badge>
                  }
                  @if (!m.isActive) {
                    <pera-badge tone="neutral">{{ t('sv.detachedModule') }}</pera-badge>
                  }
                </div>
              } @empty {
                <p class="m-0 fs-label text-text-muted">{{ t('sv.notLinked') }}</p>
              }
            }
          </section>

          @if (i.dataType === select) {
            <section data-options>
              <h3 class="m-0 mb-2 fs-micro uppercase text-text-muted">{{ t('sv.options') }}</h3>
              @for (o of options(i); track o.id) {
                <div
                  class="flex items-center gap-2 py-1.5 border-b border-border"
                  [attr.data-option]="o.code"
                >
                  <span class="fs-label text-text-muted w-6">{{ o.sortOrder }}</span>
                  <span class="flex-1 min-w-0" dir="auto">
                    <span class="font-semibold" dir="ltr">{{ o.code }}</span> · {{ name(o) }}
                  </span>
                  @if (!o.isActive) {
                    <pera-badge tone="neutral">{{ t('sv.inactive') }}</pera-badge>
                  }
                  <pera-button
                    size="xs"
                    [disabled]="busy()"
                    (click)="data.editOption(i, o)"
                    data-option-edit
                  >
                    {{ t('sv.edit') }}
                  </pera-button>
                  <pera-button
                    size="xs"
                    [disabled]="busy()"
                    (click)="data.toggleOption(i, o)"
                    data-option-active
                  >
                    {{ t(o.isActive ? 'sv.deactivate' : 'sv.activate') }}
                  </pera-button>
                </div>
              }
              <pera-button
                class="mt-2"
                size="sm"
                iconStart="plus"
                [disabled]="busy()"
                (click)="data.addOption(i)"
                data-option-add
              >
                {{ t('sv.addOption') }}
              </pera-button>
            </section>
          }

          <div class="flex items-center gap-2 flex-wrap pt-3 border-t border-border">
            <pera-button
              variant="danger"
              iconStart="trash"
              [disabled]="busy()"
              (click)="data.remove(i)"
              data-item-delete
            >
              {{ t('sv.delete') }}
            </pera-button>
            <span class="flex-1"></span>
            <pera-button [disabled]="busy()" (click)="data.shape(i)" data-item-shape>{{
              t('sv.changeShape')
            }}</pera-button>
            <pera-button [disabled]="busy()" (click)="data.toggleActive(i)" data-item-active>
              {{ t(i.isActive ? 'sv.deactivate' : 'sv.activate') }}
            </pera-button>
            <pera-button
              variant="primary"
              iconStart="pencil"
              [disabled]="busy()"
              (click)="data.edit(i)"
              data-item-edit
            >
              {{ t('sv.edit') }}
            </pera-button>
          </div>
        </div>
      }
    </pera-drawer>
  `,
})
export class SiteItemDrawerComponent {
  protected readonly data = inject(PERA_MODAL_DATA) as SiteItemDrawerData;
  private readonly catalog = inject(CatalogService);
  protected readonly select = SiteItemDataType.Select;

  protected readonly item = computed(
    () => this.data.store.items()?.find((i) => i.id === this.data.itemId) ?? null,
  );
  /** undefined while loading, null on failure. */
  protected readonly usage = computed(() => this.data.store.usage()[this.data.itemId]);
  protected readonly busy = computed(() => this.data.store.busy());
  protected readonly title = computed(() => {
    const i = this.item();
    return i ? `${i.code} · ${this.name(i)}` : '';
  });

  protected t(key: CatalogKey, params?: Record<string, string | number>): string {
    return this.catalog.t(key, params);
  }

  protected typeKey(d: number): CatalogKey {
    return SITE_ITEM_DATA_TYPE_LABEL[d] ?? 'sv.none';
  }

  protected name(o: { nameEn: string; nameAr: string }): string {
    return localName(o, this.catalog.locale());
  }

  protected limits(i: SiteItem): string {
    return limitsText(i, (k, p) => this.t(k, p));
  }

  protected options(i: SiteItem): SiteItemOption[] {
    return [...i.options].sort((a, b) => a.sortOrder - b.sortOrder);
  }
}
