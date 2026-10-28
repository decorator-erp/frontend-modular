import { ChangeDetectionStrategy, Component, inject, input, output } from '@angular/core';
import { FormsModule } from '@angular/forms';
import { CatalogService } from '@platform/i18n/catalog.service';
import {
  PeraButtonComponent,
  PeraCheckboxComponent,
  PeraIconComponent,
  PeraSelectComponent,
} from '@ds';
import type { SelectOption } from '@ds';

export interface CategoryOptionVm {
  readonly id: string;
  readonly label: string;
  readonly count: number;
  readonly selected: boolean;
}

export interface FacetOptionVm {
  readonly id: string;
  readonly label: string;
  readonly count: number;
  readonly selected: boolean;
}

export interface FacetGroupVm {
  readonly attributeId: string;
  readonly label: string;
  readonly activeCount: number;
  readonly options: readonly FacetOptionVm[];
}

/**
 * The filter rail: a Categories group, one collapsible group per Select-typed facet
 * attribute, and the custom-entry box at the foot. Purely presentational — every count,
 * every dim/hidden decision is computed by the page (`storefront-filters.ts`) and handed
 * down as a view model; this component only renders it and echoes clicks back up.
 *
 * Zero-count CATEGORIES render dimmed + disabled (still visible, so the user sees the
 * whole offered set). Zero-count FACET OPTIONS are simply not in `options` at all unless
 * currently selected — the page already filtered them out, matching the prototype's rule
 * that a selected-but-now-empty option must still be visible so it can be un-checked.
 */
@Component({
  selector: 'app-crm-storefront-filter-rail',
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [
    FormsModule,
    PeraButtonComponent,
    PeraCheckboxComponent,
    PeraIconComponent,
    PeraSelectComponent,
  ],
  host: { class: 'flex flex-col gap-4' },
  template: `
    <!-- Categories -->
    <section class="flex flex-col gap-2 border-b border-border pb-4">
      <button
        type="button"
        class="flex items-center gap-2 w-full text-start"
        (click)="toggleCategoryGroup.emit()"
      >
        <span class="fs-label uppercase tracking-wide text-text-secondary flex-1">{{
          catalog.t('store.categories')
        }}</span>
        @if (categoryActiveCount() > 0) {
          <span class="fs-micro px-1.5 rounded bg-accent-soft text-accent">{{
            categoryActiveCount()
          }}</span>
        }
        <pera-icon
          name="chevron-down"
          [size]="14"
          class="text-text-muted transition-transform"
          [class.-rotate-90]="categoryCollapsed()"
        />
      </button>
      @if (!categoryCollapsed()) {
        <div class="flex flex-col gap-1.5">
          @for (opt of categoryOptions(); track opt.id) {
            <div
              class="flex items-center fs-caption"
              [class.opacity-40]="opt.count === 0 && !opt.selected"
              [class.pointer-events-none]="opt.count === 0 && !opt.selected"
            >
              <pera-checkbox
                class="w-full"
                [ngModel]="opt.selected"
                (ngModelChange)="toggleCategory.emit(opt.id)"
              >
                <span class="flex-1 truncate" dir="auto">{{ opt.label }}</span>
                <span class="fs-micro text-text-muted">{{ opt.count }}</span>
              </pera-checkbox>
            </div>
          }
        </div>
      }
    </section>

    <!-- One collapsible group per Select facet -->
    @for (group of facetGroups(); track group.attributeId) {
      <section class="flex flex-col gap-2 border-b border-border pb-4">
        <button
          type="button"
          class="flex items-center gap-2 w-full text-start"
          (click)="toggleFacetGroup.emit(group.attributeId)"
        >
          <span class="fs-label uppercase tracking-wide text-text-secondary flex-1" dir="auto">{{
            group.label
          }}</span>
          @if (group.activeCount > 0) {
            <span class="fs-micro px-1.5 rounded bg-accent-soft text-accent">{{
              group.activeCount
            }}</span>
          }
          <pera-icon
            name="chevron-down"
            [size]="14"
            class="text-text-muted transition-transform"
            [class.-rotate-90]="collapsedGroups().has(group.attributeId)"
          />
        </button>
        @if (!collapsedGroups().has(group.attributeId)) {
          <div class="flex flex-col gap-1.5">
            @for (opt of group.options; track opt.id) {
              <div
                class="flex items-center fs-caption"
                [class.opacity-40]="opt.count === 0 && !opt.selected"
                [class.pointer-events-none]="opt.count === 0 && !opt.selected"
              >
                <pera-checkbox
                  class="w-full"
                  [ngModel]="opt.selected"
                  (ngModelChange)="
                    toggleFacetOption.emit({ attributeId: group.attributeId, optionId: opt.id })
                  "
                >
                  <span class="flex-1 truncate" dir="auto">{{ opt.label }}</span>
                  <span class="fs-micro text-text-muted">{{ opt.count }}</span>
                </pera-checkbox>
              </div>
            }
          </div>
        }
      </section>
    }

    <!-- Custom entry — the escape hatch, deliberately at the FOOT of the rail -->
    <section class="flex flex-col gap-2">
      <span class="fs-label uppercase tracking-wide text-text-secondary">{{
        catalog.t('store.customTitle')
      }}</span>
      <pera-select
        [options]="customCategoryOptions()"
        [ngModel]="customCategoryId()"
        (ngModelChange)="customCategoryChange.emit($event)"
        [placeholder]="catalog.t('store.customCategoryPlaceholder')"
      />
      <input
        type="text"
        dir="auto"
        class="w-full h-8 text-sm px-2.5 border border-border-strong rounded bg-surface outline-none
               focus-visible:outline-2 focus-visible:outline-accent"
        [placeholder]="catalog.t('store.customTextPlaceholder')"
        [ngModel]="customText()"
        (ngModelChange)="customTextChange.emit($event)"
        (keydown.enter)="addCustom.emit()"
      />
      <pera-button
        variant="secondary"
        size="sm"
        iconStart="plus"
        [disabled]="!customText().trim() || !customCategoryId()"
        (click)="addCustom.emit()"
        >{{ catalog.t('store.customAdd') }}</pera-button
      >
      <p class="fs-micro text-text-muted m-0">{{ catalog.t('store.customHint') }}</p>
    </section>
  `,
})
export class CrmStorefrontFilterRailComponent {
  protected readonly catalog = inject(CatalogService);

  readonly categoryOptions = input.required<readonly CategoryOptionVm[]>();
  readonly categoryActiveCount = input(0);
  readonly categoryCollapsed = input(false);

  readonly facetGroups = input.required<readonly FacetGroupVm[]>();
  readonly collapsedGroups = input.required<ReadonlySet<string>>();

  readonly customCategoryOptions = input.required<SelectOption[]>();
  readonly customCategoryId = input('');
  readonly customText = input('');

  readonly toggleCategoryGroup = output<void>();
  readonly toggleCategory = output<string>();
  readonly toggleFacetGroup = output<string>();
  readonly toggleFacetOption = output<{ attributeId: string; optionId: string }>();
  readonly customCategoryChange = output<string>();
  readonly customTextChange = output<string>();
  readonly addCustom = output<void>();
}
