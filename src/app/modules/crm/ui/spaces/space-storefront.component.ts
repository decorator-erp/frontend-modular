import {
  ChangeDetectionStrategy,
  Component,
  computed,
  effect,
  inject,
  input,
  signal,
  untracked,
} from '@angular/core';
import { FormsModule } from '@angular/forms';
import {
  ConfirmService,
  PeraAlertComponent,
  PeraButtonComponent,
  PeraEmptyComponent,
  PeraFormFieldComponent,
  PeraIconComponent,
  PeraInputComponent,
  PeraSelectComponent,
  PeraSkeletonComponent,
  PeraTextareaComponent,
  SelectOption,
} from '@ds';
import { CatalogService } from '@platform/i18n/catalog.service';
import { PERM } from '@platform/permissions';
import { PermissionsService } from '@platform/permissions/permissions.service';
import type { CrmSpace, SpaceSelection, SpaceSelectionOptionInput } from '../../model';
import { StorefrontStore } from '../../stores/storefront.store';
import { CrmSelectionsViewComponent } from './selections-view.component';

/** 0.001..1,000,000 with at most 3 decimals (contract §2.9.1, FINDING-F-7). */
export function parseQuantity(raw: string): number | null {
  const text = raw.trim();
  if (!/^\d+(\.\d{1,3})?$/.test(text)) return null;
  const value = Number(text);
  return value >= 0.001 && value <= 1_000_000 ? value : null;
}

/**
 * crmp C-6 (D3, office only): the storefront picks of one space — contract §2.9.1 #110–#114.
 * Pick a catalog item targeted to the space's type, one option per attribute, a quantity and
 * notes; list, move up/down (the FULL order is sent) and remove. Reads `crm.spaces.read`, writes
 * `crm.spaces.manage`. The picks are frozen into the brief entry when it is sent.
 */
@Component({
  selector: 'app-crm-space-storefront',
  changeDetection: ChangeDetectionStrategy.OnPush,
  providers: [StorefrontStore],
  imports: [
    FormsModule,
    PeraAlertComponent,
    PeraButtonComponent,
    PeraEmptyComponent,
    PeraFormFieldComponent,
    PeraIconComponent,
    PeraInputComponent,
    PeraSelectComponent,
    PeraSkeletonComponent,
    PeraTextareaComponent,
    CrmSelectionsViewComponent,
  ],
  host: { class: 'block' },
  template: `
    <section class="bg-surface border border-border rounded-card flex flex-col gap-3 p-4">
      <div>
        <h3 class="fs-body font-semibold text-text-primary m-0">
          {{ catalog.t('storefront.title') }}
        </h3>
        <p class="fs-caption text-text-secondary m-0">{{ catalog.t('storefront.sub') }}</p>
      </div>

      @if (!canRead()) {
        <pera-empty [title]="catalog.t('storefront.noAccess')" />
      } @else if (store.notFound()) {
        <pera-empty [title]="catalog.t('storefront.notFound')" />
      } @else if (store.loadError(); as key) {
        <pera-alert tone="danger">
          {{ catalog.t(key) }}
          <pera-button variant="secondary" size="sm" (click)="store.reload()">{{
            catalog.t('storefront.retry')
          }}</pera-button>
        </pera-alert>
      } @else if (store.loading() && store.selections().length === 0) {
        <div class="flex flex-col gap-2" aria-busy="true">
          <pera-skeleton [height]="48" />
          <pera-skeleton [height]="48" />
        </div>
      } @else {
        @if (store.actionError(); as message) {
          <pera-alert tone="danger">{{ message }}</pera-alert>
        }
        <ul class="flex flex-col gap-2 m-0 p-0 list-none" data-picks>
          @for (pick of store.selections(); track pick.id; let first = $first, last = $last) {
            <li class="flex items-start gap-2 border border-border rounded-sm p-2">
              <app-crm-selections-view class="flex-1 min-w-0" [selections]="[pick]" />
              @if (canManage()) {
                <div class="flex items-center gap-1">
                  <button
                    type="button"
                    class="p-1 rounded hover:bg-surface-muted disabled:opacity-40"
                    [disabled]="first || store.saving()"
                    [attr.aria-label]="catalog.t('storefront.moveUpAria', { name: nameOf(pick) })"
                    (click)="store.move(pick.id, -1)"
                  >
                    <pera-icon name="chevron-up" [size]="14" />
                  </button>
                  <button
                    type="button"
                    class="p-1 rounded hover:bg-surface-muted disabled:opacity-40"
                    [disabled]="last || store.saving()"
                    [attr.aria-label]="catalog.t('storefront.moveDownAria', { name: nameOf(pick) })"
                    (click)="store.move(pick.id, 1)"
                  >
                    <pera-icon name="chevron-down" [size]="14" />
                  </button>
                  <button
                    type="button"
                    class="p-1 rounded hover:bg-surface-muted text-danger disabled:opacity-40"
                    [disabled]="store.saving()"
                    [attr.aria-label]="catalog.t('storefront.removeAria', { name: nameOf(pick) })"
                    (click)="remove(pick)"
                  >
                    <pera-icon name="trash" [size]="14" />
                  </button>
                </div>
              }
            </li>
          } @empty {
            <pera-empty
              [title]="catalog.t('storefront.empty')"
              [description]="catalog.t('storefront.emptySub')"
            />
          }
        </ul>

        @if (canManage()) {
          <div class="flex flex-col gap-3 border-t border-border pt-3" data-add-form>
            <h4 class="fs-body-sm font-semibold text-text-primary m-0">
              {{ catalog.t('storefront.addTitle') }}
            </h4>
            @if (store.pickerError(); as key) {
              <pera-alert tone="warning">{{ catalog.t(key) }}</pera-alert>
            }
            <div class="grid grid-cols-1 md:grid-cols-2 gap-3">
              <pera-form-field [label]="catalog.t('storefront.category')" [required]="true">
                <pera-select
                  name="category"
                  [options]="categoryOptions()"
                  [placeholder]="catalog.t('storefront.choose')"
                  [ngModel]="categoryId()"
                  (ngModelChange)="setCategory($event)"
                />
              </pera-form-field>
              <pera-form-field [label]="catalog.t('storefront.item')" [required]="true">
                <pera-select
                  name="item"
                  [options]="itemOptions()"
                  [placeholder]="catalog.t('storefront.choose')"
                  [disabled]="!categoryId()"
                  [ngModel]="itemId()"
                  (ngModelChange)="setItem($event)"
                />
              </pera-form-field>
              @for (choice of store.attributes(); track choice.attribute.id) {
                <pera-form-field [label]="localName(choice.attribute)">
                  <pera-select
                    [name]="'attr-' + choice.attribute.id"
                    [options]="optionOptions(choice.options)"
                    [ngModel]="optionFor(choice.attribute.id)"
                    (ngModelChange)="setOption(choice.attribute.id, $event)"
                  />
                </pera-form-field>
              }
              <pera-form-field
                [label]="catalog.t('storefront.quantity')"
                [required]="true"
                [hint]="catalog.t('storefront.quantityHint')"
                [error]="quantityError()"
              >
                <pera-input
                  name="quantity"
                  type="number"
                  dir="ltr"
                  [ngModel]="quantity()"
                  (ngModelChange)="quantity.set($event)"
                  [error]="quantityError()"
                />
              </pera-form-field>
              <pera-form-field [label]="catalog.t('storefront.notes')">
                <pera-textarea
                  name="notes"
                  dir="auto"
                  [rows]="2"
                  [ngModel]="notes()"
                  (ngModelChange)="notes.set($event)"
                />
              </pera-form-field>
            </div>
            <div>
              <pera-button
                variant="primary"
                size="sm"
                [disabled]="!canAdd()"
                [loading]="store.saving()"
                (click)="add()"
                >{{ catalog.t('storefront.add') }}</pera-button
              >
            </div>
          </div>
        }
      }
    </section>
  `,
})
export class CrmSpaceStorefrontComponent {
  protected readonly store = inject(StorefrontStore);
  protected readonly catalog = inject(CatalogService);
  private readonly permissions = inject(PermissionsService);
  private readonly confirm = inject(ConfirmService);

  readonly space = input.required<CrmSpace>();

  protected readonly canRead = computed(() => this.permissions.can(PERM.crm.spaces.read));
  protected readonly canManage = computed(() => this.permissions.can(PERM.crm.spaces.manage));

  protected readonly categoryId = signal<string | null>(null);
  protected readonly itemId = signal<string | null>(null);
  protected readonly chosen = signal<Record<string, string>>({});
  protected readonly quantity = signal('1');
  protected readonly notes = signal('');

  protected readonly categoryOptions = computed<SelectOption[]>(() =>
    this.store.categories().map((c) => ({
      value: c.id,
      label: `${'· '.repeat(c.depth)}${this.localName(c)}`,
    })),
  );

  protected readonly itemOptions = computed<SelectOption[]>(() =>
    this.store.items().map((i) => ({ value: i.id, label: this.localName(i) })),
  );

  protected readonly quantityError = computed(() =>
    parseQuantity(String(this.quantity() ?? '')) === null
      ? this.catalog.t('storefront.quantityInvalid')
      : undefined,
  );

  protected readonly canAdd = computed(
    () =>
      !!this.itemId() &&
      this.quantityError() === undefined &&
      this.notes().length <= 1000 &&
      !this.store.saving(),
  );

  constructor() {
    effect(() => {
      const space = this.space();
      if (!this.canRead()) return;
      untracked(() => {
        this.resetForm();
        this.store.load(space.id, space.spaceType.id);
      });
    });
  }

  protected localName(row: { nameEn: string; nameAr: string }): string {
    return this.catalog.locale() === 'ar' ? row.nameAr || row.nameEn : row.nameEn;
  }

  protected nameOf(pick: SpaceSelection): string {
    return this.catalog.locale() === 'ar' ? pick.itemNameAr || pick.itemNameEn : pick.itemNameEn;
  }

  protected optionOptions(
    options: { id: string; nameEn: string; nameAr: string }[],
  ): SelectOption[] {
    return [
      { value: '', label: this.catalog.t('storefront.noOption') },
      ...options.map((o) => ({ value: o.id, label: this.localName(o) })),
    ];
  }

  protected optionFor(attributeId: string): string {
    return this.chosen()[attributeId] ?? '';
  }

  protected setCategory(id: string | null): void {
    this.categoryId.set(id || null);
    this.itemId.set(null);
    this.chosen.set({});
    this.store.pickCategory(id || null);
  }

  protected setItem(id: string | null): void {
    this.itemId.set(id || null);
    this.chosen.set({});
    this.store.pickItem(this.store.items().find((i) => i.id === id) ?? null);
  }

  protected setOption(attributeId: string, optionId: string | null): void {
    const next = { ...this.chosen() };
    if (optionId) next[attributeId] = optionId;
    else delete next[attributeId];
    this.chosen.set(next);
  }

  protected add(): void {
    const itemId = this.itemId();
    const quantity = parseQuantity(String(this.quantity() ?? ''));
    if (!itemId || quantity === null || !this.canAdd()) return;
    const options: SpaceSelectionOptionInput[] = Object.entries(this.chosen()).map(
      ([attributeId, optionId]) => ({ attributeId, optionId }),
    );
    const notes = this.notes().trim();
    this.store.add(
      { catalogItemId: itemId, quantity, notes: notes || null, options },
      {
        onDone: () => {
          this.resetForm();
          this.store.pickCategory(null);
        },
      },
    );
  }

  protected async remove(pick: SpaceSelection): Promise<void> {
    const ok = await this.confirm.open({
      title: this.catalog.t('storefront.removeTitle'),
      body: this.catalog.t('storefront.removeConfirm', { name: this.nameOf(pick) }),
      confirmLabel: this.catalog.t('storefront.remove'),
      cancelLabel: this.catalog.t('space.cancel'),
      tone: 'danger',
    });
    if (ok) this.store.remove(pick.id);
  }

  private resetForm(): void {
    this.categoryId.set(null);
    this.itemId.set(null);
    this.chosen.set({});
    this.quantity.set('1');
    this.notes.set('');
  }
}
