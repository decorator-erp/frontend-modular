import { ChangeDetectionStrategy, Component, computed, inject, signal } from '@angular/core';
import { CrmLookupService } from '../../../data/crm-lookup.service';
import type { CrmSpaceType } from '../../../model';
import { takeUntilDestroyed } from '@angular/core/rxjs-interop';
import { ActivatedRoute, Router } from '@angular/router';
import { CatalogService } from '@platform/i18n/catalog.service';
import { CanDirective, PERM } from '@platform/permissions';
import { FormsModule } from '@angular/forms';
import {
  ModalService,
  PeraAlertComponent,
  PeraButtonComponent,
  PeraEmptyComponent,
  PeraInputComponent,
  PeraSelectComponent,
  type SelectOption,
  PeraPageHeaderComponent,
  PeraSpinnerComponent,
} from '@ds';
import { CatalogAdminStore } from '../../../stores/catalog-admin.store';
import { CrmCatalogChildrenListComponent } from './catalog-children-list.component';
import { CrmCatalogCategoryDetailComponent } from './catalog-category-detail.component';
import { CrmSpaceTypesDialogComponent } from './space-types-dialog.component';
import {
  CrmNewCategoryDialogComponent,
  NewCategoryDialogData,
} from './new-category-dialog.component';

/**
 * The catalog admin — a drill-down, one level at a time, with the position held in the
 * URL (`?category=<id>`, renamed from `?node=` — v2, Run B F6) so levels are linkable and
 * browser Back moves *up a level*. The title is the current category's name (roots →
 * "Catalog"); the breadcrumb walks to root.
 */
@Component({
  selector: 'app-crm-catalog-admin-page',
  changeDetection: ChangeDetectionStrategy.OnPush,
  host: { class: 'block bg-bg min-h-full' },
  imports: [
    FormsModule,
    CanDirective,
    PeraAlertComponent,
    PeraPageHeaderComponent,
    PeraButtonComponent,
    PeraEmptyComponent,
    PeraInputComponent,
    PeraSelectComponent,
    PeraSpinnerComponent,
    CrmCatalogChildrenListComponent,
    CrmCatalogCategoryDetailComponent,
  ],
  template: `
    <pera-page-header
      [title]="
        store.currentCategory() ? categoryName(store.currentCategory()!) : catalog.t('cat.title')
      "
      [count]="store.children().length"
    >
      <div toolbar class="flex items-center gap-1 flex-wrap fs-caption">
        <button type="button" class="text-accent hover:underline" (click)="goto(null)">
          {{ catalog.t('cat.rootCrumb') }}
        </button>
        @for (crumb of store.ancestors(); track crumb.id) {
          <span class="text-text-muted">/</span>
          <button type="button" class="text-accent hover:underline" (click)="goto(crumb.id)">
            {{ categoryName(crumb) }}
          </button>
        }
        @if (store.currentCategory(); as current) {
          <span class="text-text-muted">/</span>
          <span class="text-text-secondary">{{ categoryName(current) }}</span>
        }
      </div>
      <div actions class="flex flex-wrap items-center gap-2">
        <!-- crmp C-4: GET /tree?spaceTypeId — what one space type's picker offers. -->
        <pera-select
          class="min-w-0"
          data-testid="cat-space-type-filter"
          [options]="spaceTypeOptions()"
          [ngModel]="store.spaceTypeFilter() ?? ''"
          (ngModelChange)="store.filterBySpaceType($event || null)"
          [placeholder]="catalog.t('cat.spaceTypeFilter')"
        />
        <!-- Server-side: matches code, nameEn AND nameAr — an Arabic name will not be
             found by filtering the client-side tree with an English query. -->
        <pera-input
          iconStart="search"
          [inline]="true"
          [placeholder]="catalog.t('cat.searchPlaceholder')"
          [ngModel]="store.searchTerm()"
          (ngModelChange)="store.search($event)"
        />
        <!-- Sync F4a: the space types admin. -->
        <pera-button
          variant="secondary"
          *peraCan="PERM.crm.spaceTypes.manage"
          (click)="openSpaceTypes()"
          data-testid="cat-space-types"
          >{{ catalog.t('stypes.open') }}</pera-button
        >
        <pera-button
          variant="primary"
          iconStart="plus"
          *peraCan="PERM.crm.catalog.manage"
          (click)="newCategory()"
          >{{ catalog.t('cat.newNode') }}</pera-button
        >
      </div>
    </pera-page-header>

    <!--
      One alert for the whole screen: the children list and the detail rail are parts of
      this page, so a per-child alert would stack duplicates. Covers both the route store's
      own failures and the root cache's (tree / attribute / item reads).
    -->
    @if (store.error() ?? store.catalogError(); as failure) {
      <div class="px-6 pt-4">
        <pera-alert tone="danger">{{ catalog.t(failure) }}</pera-alert>
      </div>
    }

    <div class="p-6 grid grid-cols-1 lg:grid-cols-[minmax(0,1fr)_var(--w-rail)] gap-6 items-start">
      <div class="min-w-0">
        @if (store.catalogLoading() && store.children().length === 0) {
          <div class="flex justify-center p-8"><pera-spinner /></div>
        } @else if (store.spaceTypeFilter()) {
          @if (store.spaceTypeLoading()) {
            <div class="flex justify-center p-8"><pera-spinner /></div>
          } @else if (store.spaceTypeResults().length === 0) {
            <pera-empty [title]="catalog.t('cat.spaceTypeEmpty')" />
          } @else {
            <app-crm-catalog-children-list
              [categories]="store.spaceTypeResults()"
              (open)="goto($event.id)"
            />
          }
        } @else if (store.searchTerm()) {
          <!-- Search replaces the level view; clicking a hit drills to that category. -->
          <p class="fs-caption text-text-muted m-0 pb-2">
            {{ catalog.t('space.matches', { count: store.searchResults().length }) }}
          </p>
          <app-crm-catalog-children-list
            [categories]="store.searchResults()"
            (open)="openSearchHit($event.id)"
          />
        } @else {
          <app-crm-catalog-children-list [categories]="store.children()" (open)="goto($event.id)" />
        }
      </div>
      <aside>
        <app-crm-catalog-category-detail />
      </aside>
    </div>
  `,
})
export class CrmCatalogAdminPageComponent {
  protected readonly store = inject(CatalogAdminStore);
  protected readonly catalog = inject(CatalogService);
  private readonly route = inject(ActivatedRoute);
  private readonly router = inject(Router);
  private readonly modal = inject(ModalService);
  protected readonly PERM = PERM;
  private readonly spaceTypes = signal<CrmSpaceType[]>([]);
  protected readonly spaceTypeOptions = computed<SelectOption[]>(() => [
    { value: '', label: this.catalog.t('cat.allSpaceTypes') },
    ...this.spaceTypes()
      .filter((t) => t.isActive !== false)
      .map((t) => ({ value: t.id, label: this.categoryName(t) })),
  ]);

  private readonly lookup = inject(CrmLookupService);

  constructor() {
    this.loadSpaceTypes();

    // Position follows the URL — drill-down is linkable and Back moves up a level.
    this.route.queryParamMap
      .pipe(takeUntilDestroyed())
      .subscribe((params) => this.store.init(params.get('category')));
  }

  categoryName(category: { nameEn: string; nameAr: string }): string {
    return this.catalog.locale() === 'ar' ? category.nameAr || category.nameEn : category.nameEn;
  }

  goto(categoryId: string | null): void {
    void this.router.navigate([], {
      relativeTo: this.route,
      queryParams: { category: categoryId },
      queryParamsHandling: 'merge',
    });
  }

  private loadSpaceTypes(): void {
    this.lookup
      .spaceTypes()
      .subscribe({ next: (t) => this.spaceTypes.set(t), error: () => undefined });
  }

  /** Sync F4a: add, rename, reorder and switch space types; the filter re-reads them after. */
  async openSpaceTypes(): Promise<void> {
    const changed = await this.modal
      .open<boolean>(CrmSpaceTypesDialogComponent, { size: 'lg' })
      .afterClosed();
    if (changed) this.loadSpaceTypes();
  }

  /** Jump to a search hit and clear the search, returning to normal drill-down. */
  openSearchHit(categoryId: string): void {
    this.store.search('');
    this.goto(categoryId);
  }

  async newCategory(): Promise<void> {
    const current = this.store.currentCategory();
    const data: NewCategoryDialogData = {
      parentId: current?.id ?? null,
      parentName: current ? this.categoryName(current) : null,
    };
    const created = await this.modal
      .open<boolean>(CrmNewCategoryDialogComponent, { size: 'md', data })
      .afterClosed();
    if (created) this.store.reload();
  }
}
