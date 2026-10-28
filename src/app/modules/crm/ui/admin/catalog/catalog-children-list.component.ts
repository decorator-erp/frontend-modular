import { ChangeDetectionStrategy, Component, inject, input, output } from '@angular/core';
import { CatalogService } from '@platform/i18n/catalog.service';
import { CanDirective, PERM } from '@platform/permissions';
import type { CatalogCategory } from '../../../model';
import {
  PeraEmptyComponent,
  PeraIconComponent,
  PeraStatusBadgeComponent,
  StatusBadgeTone,
} from '@ds';
import { CatalogStore } from '../../../stores/catalog.store';
import { branchRuleBadge } from '../../catalog-rule-badge';

/**
 * The children of the current catalog level — categories only (v2, Run B F6). One card
 * per child. Click navigates in (drill-down); Move up/down reorders (no drag). Each card
 * previews its grandchild categories; items live in the selected category's own Items
 * card, not here.
 */
@Component({
  selector: 'app-crm-catalog-children-list',
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [CanDirective, PeraStatusBadgeComponent, PeraIconComponent, PeraEmptyComponent],
  template: `
    @if (categories().length === 0) {
      <pera-empty [title]="catalog.t('cat.noChildren')" icon="folder" />
    } @else {
      <ul class="flex flex-col gap-2 m-0 p-0 list-none">
        @for (category of categories(); track category.id; let i = $index) {
          <li
            class="flex items-stretch gap-1 bg-surface border border-border rounded-card"
            [class.opacity-50]="!category.isActive"
          >
            <button
              type="button"
              class="flex-1 min-w-0 flex flex-col gap-2 text-start px-4 py-3 hover:bg-surface-muted"
              (click)="open.emit(category)"
            >
              <div class="flex items-center gap-2 flex-wrap">
                <span class="fs-body font-medium text-text truncate" dir="auto">{{
                  name(category)
                }}</span>
                @if (ruleTone(category); as rule) {
                  <pera-status-badge [tone]="rule.tone" [label]="rule.label" [dot]="false" />
                }
                @if (category.isRequired) {
                  <pera-status-badge
                    tone="error"
                    [label]="catalog.t('cat.ruleRequired')"
                    [dot]="false"
                  />
                }
                <span class="font-mono fs-micro text-text-muted ms-auto">{{ category.code }}</span>
              </div>

              <div class="flex items-center gap-1.5 flex-wrap">
                @for (gc of preview(category); track gc.id) {
                  <span
                    class="fs-micro px-1.5 py-0.5 rounded bg-surface-muted text-text-secondary"
                    >{{ name(gc) }}</span
                  >
                }
                @if (overflow(category) > 0) {
                  <span class="fs-micro text-text-muted">+{{ overflow(category) }}</span>
                }
                @if (preview(category).length === 0) {
                  <span class="fs-micro text-text-muted">{{ catalog.t('cat.emptyBranch') }}</span>
                }
              </div>
            </button>

            <div class="flex flex-col justify-center gap-1 pe-1" *peraCan="PERM.crm.catalog.manage">
              <button
                type="button"
                class="p-1 rounded hover:bg-surface-muted disabled:opacity-30"
                [disabled]="i === 0"
                [attr.aria-label]="catalog.t('cat.moveUp')"
                (click)="moveUp.emit(category)"
              >
                <pera-icon name="chevron-up" class="size-icon-sm" />
              </button>
              <button
                type="button"
                class="p-1 rounded hover:bg-surface-muted disabled:opacity-30"
                [disabled]="i === categories().length - 1"
                [attr.aria-label]="catalog.t('cat.moveDown')"
                (click)="moveDown.emit(category)"
              >
                <pera-icon name="chevron-down" class="size-icon-sm" />
              </button>
            </div>
          </li>
        }
      </ul>
    }
  `,
})
export class CrmCatalogChildrenListComponent {
  private readonly cache = inject(CatalogStore);
  protected readonly catalog = inject(CatalogService);
  protected readonly PERM = PERM;

  readonly categories = input.required<CatalogCategory[]>();

  readonly open = output<CatalogCategory>();
  readonly moveUp = output<CatalogCategory>();
  readonly moveDown = output<CatalogCategory>();

  name(category: { nameEn: string; nameAr: string }): string {
    return this.catalog.locale() === 'ar' ? category.nameAr || category.nameEn : category.nameEn;
  }

  private children(category: CatalogCategory): CatalogCategory[] {
    return this.cache.categoryChildrenOf(category.id);
  }

  preview(category: CatalogCategory): CatalogCategory[] {
    return this.children(category).slice(0, 6);
  }

  overflow(category: CatalogCategory): number {
    return Math.max(0, this.children(category).length - 6);
  }

  /** Shared with the storefront so a Single branch reads the same in both. */
  ruleTone(category: CatalogCategory): { tone: StatusBadgeTone; label: string } | null {
    const rule = branchRuleBadge(category);
    return rule ? { tone: rule.tone, label: this.catalog.t(rule.labelKey) } : null;
  }
}
