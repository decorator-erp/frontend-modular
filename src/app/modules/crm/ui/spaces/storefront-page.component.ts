import {
  ChangeDetectionStrategy,
  Component,
  computed,
  effect,
  inject,
  signal,
} from '@angular/core';
import { ActivatedRoute, Router } from '@angular/router';
import { FormsModule } from '@angular/forms';
import { CatalogService } from '@platform/i18n/catalog.service';
import { ToastService } from '@platform/feedback/toast.service';
import type { CatalogItem, CrmSpace, ItemAttributeValue, SpaceItem } from '../../model';
import {
  PeraButtonComponent,
  PeraIconComponent,
  PeraInputComponent,
  PeraSegmentedComponent,
  PeraSpinnerComponent,
  PeraStatusBadgeComponent,
} from '@ds';
import type { SegmentedOption, SelectOption } from '@ds';
import { CatalogStore } from '../../stores/catalog.store';
import { SpacesStore } from '../../stores/spaces.store';
import { nextProvisionStatus, provisionStatusKey, provisionStatusTone } from './provision-status';
import { CrmSpaceCompletenessComponent } from './space-completeness.component';
import {
  CategoryOptionVm,
  CrmStorefrontFilterRailComponent,
  FacetGroupVm,
} from './storefront-filter-rail.component';
import {
  CrmStorefrontProductCardComponent,
  ProductCardState,
  ProductCardVm,
} from './storefront-product-card.component';
import {
  facetAttributesOf,
  facetOptionCounts,
  filteredItems,
  isSingleLocked,
  matchesFilters,
  offeredCategories,
  type StorefrontFilters,
} from './storefront-filters';

interface ActiveChip {
  readonly key: string;
  readonly label: string;
  readonly remove: () => void;
}

/**
 * `/projects/:projectId/spaces/:spaceId/record` — the storefront. Replaces
 * `record-items-dialog.component.ts`'s modal: a full-page three-column layout (filter
 * rail · product grid · cart) that a modal cannot hold. See `storefront-filters.ts` for
 * why every filter and every facet count is computed client-side over one cached pool.
 */
@Component({
  selector: 'app-crm-storefront-page',
  changeDetection: ChangeDetectionStrategy.OnPush,
  host: { class: 'block bg-bg min-h-full' },
  imports: [
    FormsModule,
    PeraButtonComponent,
    PeraIconComponent,
    PeraInputComponent,
    PeraSegmentedComponent,
    PeraSpinnerComponent,
    PeraStatusBadgeComponent,
    CrmSpaceCompletenessComponent,
    CrmStorefrontFilterRailComponent,
    CrmStorefrontProductCardComponent,
  ],
  template: `
    <header
      class="sticky top-0 z-10 flex items-center gap-3 px-4 py-3 border-b border-border bg-surface"
    >
      <pera-button variant="ghost" size="sm" iconStart="chevron-left" (click)="back()">{{
        catalog.t('store.back')
      }}</pera-button>
      @if (space(); as sp) {
        <div class="flex flex-col min-w-0">
          <span class="fs-body font-medium text-text truncate" dir="auto">{{ sp.name }}</span>
          <span class="fs-caption text-text-muted truncate">{{ typeName(sp) }}</span>
        </div>
      }
      <pera-input
        class="flex-1 max-w-sm ms-auto"
        iconStart="search"
        dir="auto"
        [placeholder]="catalog.t('store.searchPlaceholder')"
        [ngModel]="term()"
        (ngModelChange)="term.set($event)"
      />
    </header>

    @if (!space()) {
      <div class="flex justify-center py-16"><pera-spinner size="md" tone="accent" /></div>
    } @else {
      <div
        class="grid grid-cols-1 lg:grid-cols-[var(--w-rail)_minmax(0,1fr)_var(--w-rail)] items-start"
      >
        <aside class="border-e border-border p-4 hidden lg:block">
          <app-crm-storefront-filter-rail
            [categoryOptions]="categoryOptions()"
            [categoryActiveCount]="categoryIds().size"
            [categoryCollapsed]="categoryCollapsed()"
            [facetGroups]="facetGroups()"
            [collapsedGroups]="collapsedGroups()"
            [customCategoryOptions]="customCategoryOptions()"
            [customCategoryId]="customCategoryId()"
            [customText]="customText()"
            (toggleCategoryGroup)="categoryCollapsed.set(!categoryCollapsed())"
            (toggleCategory)="toggleCategory($event)"
            (toggleFacetGroup)="toggleFacetGroup($event)"
            (toggleFacetOption)="toggleFacetOption($event.attributeId, $event.optionId)"
            (customCategoryChange)="customCategoryId.set($event)"
            (customTextChange)="customText.set($event)"
            (addCustom)="addCustom()"
          />
        </aside>

        <main class="min-w-0 p-4 flex flex-col gap-3">
          <div class="flex items-center gap-2 flex-wrap">
            @for (chip of activeChips(); track chip.key) {
              <span
                class="fs-micro flex items-center gap-1 px-2 py-1 rounded bg-accent-soft text-accent"
              >
                {{ chip.label }}
                <button
                  type="button"
                  class="hover:opacity-70"
                  [attr.aria-label]="catalog.t('store.remove')"
                  (click)="chip.remove()"
                >
                  <pera-icon name="x" [size]="10" />
                </button>
              </span>
            }
            @if (activeChips().length > 0) {
              <button
                type="button"
                class="fs-caption text-text-secondary hover:text-text-primary"
                (click)="clearAll()"
              >
                {{ catalog.t('store.clearAll') }}
              </button>
            }
            <span class="fs-caption text-text-muted ms-auto whitespace-nowrap">{{
              catalog.t(sortedItems().length === 1 ? 'store.result' : 'store.results', {
                count: sortedItems().length,
              })
            }}</span>
            <pera-segmented
              [options]="sortOptions"
              [ngModel]="sort()"
              (ngModelChange)="sort.set($event)"
              [ariaLabel]="catalog.t('store.sortName')"
            />
          </div>

          @if (poolLoading()) {
            <div class="flex justify-center py-12"><pera-spinner size="md" tone="accent" /></div>
          } @else if (sortedItems().length === 0) {
            <p class="fs-caption text-text-muted text-center py-12 m-0">
              {{ catalog.t('store.noResults') }}
            </p>
          } @else {
            <div class="grid grid-cols-[repeat(auto-fill,minmax(11rem,1fr))] gap-3">
              @for (card of productCards(); track card.item.trackKey) {
                <app-crm-storefront-product-card
                  [item]="card.item"
                  [categoryName]="card.categoryName"
                  [rootCategoryId]="card.rootCategoryId"
                  [specs]="card.specs"
                  [state]="card.state"
                  (action)="onCardAction(card)"
                />
              }
            </div>
          }
        </main>

        <aside class="border-s border-border p-4 flex flex-col gap-3">
          <div class="flex items-center gap-2">
            <span class="fs-label uppercase tracking-wide text-text-secondary">{{
              catalog.t('store.cartTitle')
            }}</span>
            <span class="fs-micro text-text-muted ms-auto font-mono">{{ board().length }}</span>
          </div>

          @if (board().length === 0) {
            <p class="fs-caption text-text-muted m-0">{{ catalog.t('store.cartEmpty') }}</p>
          } @else {
            <div class="flex flex-col gap-3 max-h-[50vh] overflow-auto">
              @for (group of cartGroups(); track group.rootId) {
                <div class="flex flex-col gap-1.5">
                  <span class="fs-label uppercase tracking-wide text-text-muted">{{
                    group.rootLabel
                  }}</span>
                  @for (row of group.rows; track row.trackKey) {
                    <div
                      class="flex items-center gap-2 py-1 border-b border-border last:border-b-0"
                    >
                      <div class="flex-1 min-w-0 flex items-center gap-1.5">
                        <span class="fs-caption text-text truncate" dir="auto">{{
                          rowName(row)
                        }}</span>
                        @if (row.isCustom) {
                          <span
                            class="fs-micro px-1 rounded border border-warning bg-warning-soft text-warning shrink-0"
                            >{{ catalog.t('space.custom') }}</span
                          >
                        }
                      </div>
                      <button type="button" class="shrink-0" (click)="cycleStatus(row)">
                        <pera-status-badge
                          [tone]="statusTone(row.status)"
                          [label]="statusLabel(row.status)"
                          [dot]="false"
                        />
                      </button>
                      <button
                        type="button"
                        class="p-1 rounded hover:bg-surface-muted shrink-0"
                        [attr.aria-label]="catalog.t('store.remove')"
                        (click)="removeRow(row.id)"
                      >
                        <pera-icon name="x" [size]="14" />
                      </button>
                    </div>
                  }
                </div>
              }
            </div>
          }

          @if (space(); as sp) {
            <app-crm-space-completeness [space]="sp" (record)="clearAll()" />
          }
        </aside>
      </div>
    }
  `,
})
export class CrmStorefrontPageComponent {
  private readonly route = inject(ActivatedRoute);
  private readonly router = inject(Router);
  protected readonly store = inject(SpacesStore);
  protected readonly catalogStore = inject(CatalogStore);
  protected readonly catalog = inject(CatalogService);
  private readonly toast = inject(ToastService);

  protected readonly sortOptions: SegmentedOption[] = [
    { value: 'name', label: this.catalog.t('store.sortName') },
    { value: 'category', label: this.catalog.t('store.sortCategory') },
  ];

  readonly spaceId = signal('');
  private projectId = '';

  readonly space = computed<CrmSpace | undefined>(() =>
    this.store.spaces().find((s) => s.id === this.spaceId()),
  );
  private readonly spaceTypeId = computed(() => this.space()?.spaceType.id ?? null);

  readonly board = computed(() => this.store.board(this.spaceId()));
  readonly poolLoading = this.catalogStore.poolLoading;

  // ── Filter state ──────────────────────────────────────────────────────
  readonly categoryIds = signal<Set<string>>(new Set());
  readonly facets = signal<Map<string, Set<string>>>(new Map());
  readonly term = signal('');
  readonly sort = signal<'name' | 'category'>('name');
  readonly categoryCollapsed = signal(false);
  readonly collapsedGroups = signal<Set<string>>(new Set());
  readonly customCategoryId = signal('');
  readonly customText = signal('');

  private readonly filters = computed<StorefrontFilters>(() => ({
    categoryIds: this.categoryIds(),
    facets: this.facets(),
    term: this.term(),
  }));

  private readonly categoriesById = computed(
    () => new Map(this.catalogStore.categories().map((c) => [c.id, c])),
  );

  private readonly pool = computed<CatalogItem[]>(() => {
    const st = this.spaceTypeId();
    return st ? (this.catalogStore.itemsForSpaceType(st) ?? []) : [];
  });

  private readonly searchable = (item: CatalogItem): string =>
    `${item.nameEn} ${item.nameAr} ${this.categoryName(item.categoryId)}`;

  readonly visibleItems = computed(() =>
    filteredItems(this.pool(), this.filters(), this.searchable),
  );

  readonly sortedItems = computed(() => {
    const items = [...this.visibleItems()];
    if (this.sort() === 'category') {
      items.sort(
        (a, b) =>
          this.categoryName(a.categoryId).localeCompare(this.categoryName(b.categoryId)) ||
          this.itemName(a).localeCompare(this.itemName(b)),
      );
    } else {
      items.sort((a, b) => this.itemName(a).localeCompare(this.itemName(b)));
    }
    return items;
  });

  readonly categoryOptions = computed<CategoryOptionVm[]>(() => {
    const st = this.spaceTypeId();
    if (!st) return [];
    const offered = offeredCategories(st, this.catalogStore.categories());
    const self = this.pool().filter((i) =>
      matchesFilters(i, this.filters(), 'category', this.searchable),
    );
    const counts = new Map<string, number>();
    for (const i of self) counts.set(i.categoryId, (counts.get(i.categoryId) ?? 0) + 1);
    return offered.map((c) => ({
      id: c.id,
      label: this.name(c),
      count: counts.get(c.id) ?? 0,
      selected: this.categoryIds().has(c.id),
    }));
  });

  readonly facetGroups = computed<FacetGroupVm[]>(() => {
    const defs = facetAttributesOf(this.pool());
    const filters = this.filters();
    return defs.map((def) => {
      const selected = filters.facets.get(def.attributeId) ?? new Set<string>();
      const self = this.pool().filter((i) =>
        matchesFilters(i, filters, def.attributeId, this.searchable),
      );
      const options = facetOptionCounts(def.attributeId, self, selected).map((o) => ({
        id: o.optionId,
        label: this.catalog.locale() === 'ar' ? o.nameAr || o.nameEn : o.nameEn,
        count: o.count,
        selected: selected.has(o.optionId),
      }));
      return {
        attributeId: def.attributeId,
        label: this.catalog.locale() === 'ar' ? def.nameAr || def.nameEn : def.nameEn,
        activeCount: selected.size,
        options,
      };
    });
  });

  readonly customCategoryOptions = computed<SelectOption[]>(() => {
    const st = this.spaceTypeId();
    if (!st) return [];
    return offeredCategories(st, this.catalogStore.categories()).map((c) => ({
      value: c.id,
      label: this.name(c),
    }));
  });

  readonly productCards = computed<ProductCardVm[]>(() => {
    const board = this.board();
    const categories = this.catalogStore.categories();
    return this.sortedItems().map((item) => {
      const already = board.find((r) => !r.isCustom && r.catalogItemId === item.id);
      const state: ProductCardState = already
        ? 'added'
        : isSingleLocked(item, categories, board)
          ? 'locked'
          : 'add';
      return {
        item,
        categoryName: this.categoryName(item.categoryId),
        rootCategoryId: this.rootCategoryIdOf(item.categoryId),
        specs: this.specsOf(item.attributes),
        state,
      };
    });
  });

  readonly activeChips = computed<ActiveChip[]>(() => {
    const chips: ActiveChip[] = [];
    for (const id of this.categoryIds()) {
      chips.push({
        key: `cat:${id}`,
        label: this.categoryName(id),
        remove: () => this.toggleCategory(id),
      });
    }
    for (const [attributeId, options] of this.facets()) {
      const group = this.facetGroups().find((g) => g.attributeId === attributeId);
      for (const optionId of options) {
        const label = group?.options.find((o) => o.id === optionId)?.label ?? optionId;
        chips.push({
          key: `facet:${attributeId}:${optionId}`,
          label: `${group?.label ?? ''}: ${label}`,
          remove: () => this.toggleFacetOption(attributeId, optionId),
        });
      }
    }
    if (this.term().trim()) {
      chips.push({
        key: 'term',
        label: `"${this.term().trim()}"`,
        remove: () => this.term.set(''),
      });
    }
    return chips;
  });

  readonly cartGroups = computed(() => {
    const order: string[] = [];
    const map = new Map<string, { rootId: string; rootLabel: string; rows: SpaceItem[] }>();
    for (const row of this.board()) {
      const root = row.path.length > 0 ? row.path[0] : null;
      const key = root?.id ?? '_';
      if (!map.has(key)) {
        map.set(key, { rootId: key, rootLabel: root ? this.name(root) : '', rows: [] });
        order.push(key);
      }
      map.get(key)!.rows.push(row);
    }
    return order.map((k) => map.get(k)!);
  });

  constructor() {
    const projectId = this.route.snapshot.paramMap.get('projectId') ?? '';
    const spaceId = this.route.snapshot.paramMap.get('spaceId') ?? '';
    this.projectId = projectId;
    this.spaceId.set(spaceId);
    // Full load, same as spaces-page: this route needs the space's own name/type (the
    // registry), its board (already-added state, the cart) and its completeness (the
    // meter) — `load()` is the entry point that gives us all three in one place.
    this.store.load(projectId);
    this.catalogStore.loadCategories();

    effect(() => {
      const st = this.spaceTypeId();
      if (st) this.catalogStore.loadItemsForSpaceType(st);
    });
  }

  // ── Locale-aware naming ──────────────────────────────────────────────

  name(x: { nameEn: string; nameAr: string }): string {
    return this.catalog.locale() === 'ar' ? x.nameAr || x.nameEn : x.nameEn;
  }

  private itemName(item: CatalogItem): string {
    return this.name(item);
  }

  private categoryName(categoryId: string): string {
    const c = this.categoriesById().get(categoryId);
    return c ? this.name(c) : '';
  }

  private rootCategoryIdOf(categoryId: string): string {
    const byId = this.categoriesById();
    let cursor = byId.get(categoryId);
    while (cursor?.parentId) {
      const parent = byId.get(cursor.parentId);
      if (!parent) break;
      cursor = parent;
    }
    return cursor?.id ?? categoryId;
  }

  private specsOf(values: readonly ItemAttributeValue[]): { label: string; value: string }[] {
    const ar = this.catalog.locale() === 'ar';
    const out: { label: string; value: string }[] = [];
    for (const v of values) {
      const value = v.optionId
        ? ((ar ? v.optionNameAr : v.optionNameEn) ?? '')
        : v.valueText != null
          ? v.valueText
          : v.valueNumber != null
            ? String(v.valueNumber) + (v.unit ? ' ' + v.unit : '')
            : v.valueBool != null
              ? String(v.valueBool)
              : (v.valueDate ?? null);
      if (value === null || value === '') continue;
      out.push({ label: ar ? v.nameAr || v.nameEn : v.nameEn, value });
    }
    return out;
  }

  typeName(space: CrmSpace): string {
    return this.name(space.spaceType);
  }

  rowName(row: {
    isCustom: boolean;
    customName: string | null;
    nodeNameEn: string;
    nodeNameAr: string;
  }): string {
    if (row.isCustom) return row.customName ?? '';
    return this.catalog.locale() === 'ar' ? row.nodeNameAr || row.nodeNameEn : row.nodeNameEn;
  }

  statusTone(status: Parameters<typeof provisionStatusTone>[0]) {
    return provisionStatusTone(status);
  }

  statusLabel(status: Parameters<typeof provisionStatusKey>[0]): string {
    return this.catalog.t(provisionStatusKey(status));
  }

  // ── Filter mutations ──────────────────────────────────────────────────

  toggleCategory(id: string): void {
    this.categoryIds.update((s) => {
      const next = new Set(s);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  }

  toggleFacetGroup(attributeId: string): void {
    this.collapsedGroups.update((s) => {
      const next = new Set(s);
      if (next.has(attributeId)) next.delete(attributeId);
      else next.add(attributeId);
      return next;
    });
  }

  toggleFacetOption(attributeId: string, optionId: string): void {
    this.facets.update((m) => {
      const next = new Map(m);
      const current = new Set(next.get(attributeId) ?? []);
      if (current.has(optionId)) current.delete(optionId);
      else current.add(optionId);
      if (current.size === 0) next.delete(attributeId);
      else next.set(attributeId, current);
      return next;
    });
  }

  clearAll(): void {
    this.categoryIds.set(new Set());
    this.facets.set(new Map());
    this.term.set('');
  }

  // ── Board mutations ────────────────────────────────────────────────────

  onCardAction(card: ProductCardVm): void {
    if (card.state === 'locked') return;
    if (card.state === 'added') {
      const row = this.board().find((r) => !r.isCustom && r.catalogItemId === card.item.id);
      if (row) this.removeRow(row.id);
      return;
    }
    this.store.addItem(
      this.spaceId(),
      { catalogNodeId: card.item.id },
      {
        onDone: () =>
          this.toast.show({ tone: 'success', message: this.catalog.t('store.itemAdded') }),
      },
    );
  }

  addCustom(): void {
    const text = this.customText().trim();
    const categoryId = this.customCategoryId();
    if (!text || !categoryId) return;
    this.store.addCustomItem(this.spaceId(), categoryId, text, {
      onDone: () => {
        this.customText.set('');
        this.toast.show({ tone: 'success', message: this.catalog.t('store.customAdded') });
      },
    });
  }

  cycleStatus(row: { id: string; status: Parameters<typeof nextProvisionStatus>[0] }): void {
    this.store.setItemStatus(this.spaceId(), row.id, { status: nextProvisionStatus(row.status) });
  }

  removeRow(rowId: string): void {
    this.store.removeItem(this.spaceId(), rowId);
  }

  /**
   * Absolute, not relative: `crmRoutes` is one flat array of sibling routes, each with its
   * own multi-segment `path` string — `projects/:projectId/spaces/:spaceId/record` is ONE
   * `ActivatedRoute` node, not four nested ones. `router.navigate(['..'], {relativeTo})`
   * walks the ROUTE TREE, not the URL string, so `..` from that single node exits the
   * whole lazy-loaded `crm` boundary rather than trimming one path segment.
   */
  back(): void {
    void this.router.navigate(['/crm/projects', this.projectId, 'spaces']);
  }
}
