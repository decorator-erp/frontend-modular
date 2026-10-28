import {
  ChangeDetectionStrategy,
  Component,
  computed,
  effect,
  inject,
  signal,
} from '@angular/core';
import { FormControl, FormGroup, ReactiveFormsModule } from '@angular/forms';
import { CatalogService } from '@platform/i18n/catalog.service';
import type { CatalogKey } from '@platform/i18n/catalog/en';
import { ToastService } from '@platform/feedback/toast.service';
import { CatalogAttributeType } from '../../model/crm-enums';
import type { CatalogAttribute, SpaceItem, SpaceItemAttributeValueRequest } from '../../model';
import {
  PERA_MODAL_DATA,
  PeraAlertComponent,
  PeraDateInputComponent,
  PeraFormFieldComponent,
  PeraFormModalComponent,
  PeraInputComponent,
  PeraModalRef,
  PeraSelectComponent,
  PeraSpinnerComponent,
  SelectOption,
} from '@ds';
import { CatalogStore } from '../../stores/catalog.store';
import { SpacesStore } from '../../stores/spaces.store';
import { domainErrorKey } from '../domain-error-key';

export interface EditItemAttributesDialogData {
  spaceId: string;
  item: SpaceItem;
}

/**
 * Record an item's attribute values (D2c) — the UI for `SpacesStore.setItemAttributes`.
 *
 * The definitions come from the catalog (`effectiveAttributes`: the node's own plus every
 * ancestor's), the *values* from the board item. Two things shape this form:
 *
 * 1. **The write is replace-all** — anything omitted is CLEARED server-side. So a blank field
 *    IS the clear gesture, and every attribute still holding a value must be re-sent.
 * 2. **A Boolean gets a three-way select, not a checkbox.** Completeness tracks attributes that
 *    are unset, so "No" and "not recorded" are different answers a checkbox cannot tell apart.
 */
@Component({
  selector: 'app-crm-edit-item-attributes-dialog',
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [
    ReactiveFormsModule,
    PeraAlertComponent,
    PeraDateInputComponent,
    PeraFormFieldComponent,
    PeraFormModalComponent,
    PeraInputComponent,
    PeraSelectComponent,
    PeraSpinnerComponent,
  ],
  template: `
    <pera-form-modal
      eyebrow="PUT /api/crm/spaces/{spaceId}/items/{itemId}/attributes"
      [title]="catalog.t('space.editAttributes')"
      [subtitle]="itemName"
      size="md"
      permission="crm.spaces.manage"
      [submitLabel]="catalog.t('space.save')"
      [submittingLabel]="catalog.t('common.saving')"
      [submitting]="submitting()"
      [submitDisabled]="!hasDefinitions()"
      [errorMessage]="errorText()"
      (submitted)="submit()"
      (cancelled)="close()"
    >
      @if (defs(); as list) {
        @if (list.length === 0) {
          <p class="fs-caption text-text-muted m-0">{{ catalog.t('cat.noAttributes') }}</p>
        } @else {
          <div [formGroup]="form" class="flex flex-col gap-4">
            @for (def of sortedDefs(); track def.id) {
              <pera-form-field [label]="labelOf(def)" [required]="def.isRequired">
                @switch (def.dataType) {
                  @case (ATTR_TYPE.Number) {
                    <pera-input type="number" [formControlName]="def.id" />
                  }
                  @case (ATTR_TYPE.Boolean) {
                    <pera-select [formControlName]="def.id" [options]="boolOptions" />
                  }
                  @case (ATTR_TYPE.Date) {
                    <pera-date-input [formControlName]="def.id" />
                  }
                  @case (ATTR_TYPE.Select) {
                    <pera-select [formControlName]="def.id" [options]="optionsOf(def)" />
                  }
                  @default {
                    <pera-input [formControlName]="def.id" dir="auto" />
                  }
                }
              </pera-form-field>
            }
          </div>
        }
      } @else if (cache.error(); as failure) {
        <pera-alert tone="danger">{{ catalog.t(failure) }}</pera-alert>
      } @else {
        <div class="flex justify-center py-8"><pera-spinner /></div>
      }
    </pera-form-modal>
  `,
})
export class CrmEditItemAttributesDialogComponent {
  private readonly store = inject(SpacesStore);
  protected readonly cache = inject(CatalogStore);
  private readonly toast = inject(ToastService);
  private readonly modalRef = inject(PeraModalRef) as PeraModalRef<boolean>;
  protected readonly catalog = inject(CatalogService);
  readonly data = inject(PERA_MODAL_DATA) as EditItemAttributesDialogData;

  protected readonly ATTR_TYPE = CatalogAttributeType;

  protected readonly itemId = computed(() => this.data.item.catalogItemId);

  /**
   * `GET /nodes/{id}/attributes` (and its v2 twin `/categories/{id}/attributes`) now REJECTS
   * an item id with `crm.catalog.CategoryNotFound` — the backend requires a category id.
   * Effective attributes are declared on the item's CATEGORY, so this resolves that first,
   * via the item cache F4 already added for the board's room-override chips.
   *
   * `undefined` while the item itself hasn't loaded yet — deliberately distinct from `null`
   * (a custom row, no category to resolve at all). Keeping that distinction is what makes
   * `defs()` below able to tell "still fetching the item" from "this item has no attributes".
   */
  protected readonly categoryId = computed(() => {
    const itemId = this.itemId();
    if (!itemId) return null;
    return this.cache.item(itemId)?.categoryId;
  });

  /** `undefined` while the definitions are still in flight (including the item fetch that
   * resolves `categoryId`). `[]` is a DEFINITE empty — a custom row, or a category the
   * server confirms has no attributes — never a stand-in for "still loading". */
  protected readonly defs = computed(() => {
    const itemId = this.itemId();
    // A custom row points at no catalog item, so it inherits no attributes — a definite
    // empty, not a pending load. The pencil is hidden for customs; this is what happens
    // if that ever fails to hide, and it must not be an endless spinner.
    if (!itemId) return [];
    const categoryId = this.categoryId();
    // The item hasn't resolved yet — genuinely pending, NOT an empty result. Returning `[]`
    // here would render "no attributes" for an item that simply hasn't loaded, which reads
    // as data rather than as the spinner it actually is.
    if (!categoryId) return undefined;
    return this.cache.effectiveAttributes(categoryId);
  });
  protected readonly sortedDefs = computed(() =>
    [...(this.defs() ?? [])].sort((a, b) => a.sortOrder - b.sortOrder),
  );
  protected readonly hasDefinitions = computed(() => (this.defs()?.length ?? 0) > 0);

  protected readonly form = new FormGroup<Record<string, FormControl<string>>>({});
  protected readonly submitting = signal(false);
  private readonly errorKey = signal<CatalogKey | null>(null);
  protected readonly errorText = computed(() => {
    const key = this.errorKey();
    return key ? this.catalog.t(key) : null;
  });

  protected readonly itemName =
    this.catalog.locale() === 'ar'
      ? this.data.item.nodeNameAr || this.data.item.nodeNameEn
      : this.data.item.nodeNameEn;

  protected readonly boolOptions: SelectOption[] = [
    { value: '', label: '—' },
    { value: 'true', label: this.catalog.t('common.yes') },
    { value: 'false', label: this.catalog.t('common.no') },
  ];

  /** Controls are keyed by attribute id, so they can only be built once the defs land. */
  private built = false;

  constructor() {
    // Reactive, not a one-shot constructor read: the item may still be cold in `itemsById`
    // (e.g. the board's own warm-up effect hasn't resolved it yet). A synchronous read here
    // would silently skip `loadEffectiveAttributes` and the dialog would render an empty
    // form with no error — indistinguishable from "this item genuinely has no attributes".
    // This effect re-runs once the item lands (categoryId() flips from undefined to a real
    // id) and fires the attributes load then, not before.
    effect(() => {
      const itemId = this.itemId();
      if (!itemId) return; // custom row — nothing to load
      const categoryId = this.categoryId();
      if (!categoryId) {
        this.cache.loadItem(itemId);
        return;
      }
      this.cache.loadEffectiveAttributes(categoryId);
    });
    effect(() => {
      const defs = this.defs();
      if (!defs || this.built) return;
      this.built = true;
      for (const def of defs) {
        this.form.addControl(def.id, new FormControl(this.seed(def), { nonNullable: true }));
      }
    });
  }

  /** The recorded value as form text — the inverse of `valueFor`. */
  private seed(def: CatalogAttribute): string {
    const v = this.data.item.attributes.find((a) => a.attributeId === def.id);
    if (!v) return '';
    switch (def.dataType) {
      case CatalogAttributeType.Number:
        return v.valueNumber != null ? String(v.valueNumber) : '';
      case CatalogAttributeType.Boolean:
        return v.valueBool == null ? '' : String(v.valueBool);
      case CatalogAttributeType.Date:
        return v.valueDate ?? '';
      case CatalogAttributeType.Select:
        return v.optionId ?? '';
      default:
        return v.valueText ?? '';
    }
  }

  protected labelOf(def: CatalogAttribute): string {
    const name = this.catalog.locale() === 'ar' ? def.nameAr || def.nameEn : def.nameEn;
    return def.unit ? `${name} · ${def.unit}` : name;
  }

  protected optionsOf(def: CatalogAttribute): SelectOption[] {
    return [
      { value: '', label: '—' },
      ...[...def.options]
        .sort((a, b) => a.sortOrder - b.sortOrder)
        .map((o) => ({
          value: o.id,
          // Names are payload DATA — never a catalog key.
          label: this.catalog.locale() === 'ar' ? o.nameAr || o.nameEn : o.nameEn,
        })),
    ];
  }

  close(): void {
    this.modalRef.close(false);
  }

  submit(): void {
    const values: SpaceItemAttributeValueRequest[] = [];
    for (const def of this.defs() ?? []) {
      const raw = String(this.form.get(def.id)?.value ?? '').trim();
      // Blank means "clear it": omitted from a replace-all payload, the server drops the value.
      if (!raw) continue;
      values.push(this.valueFor(def, raw));
    }

    this.submitting.set(true);
    this.errorKey.set(null);
    this.store.setItemAttributes(
      this.data.spaceId,
      this.data.item.id,
      { values },
      {
        onDone: () => {
          this.toast.show({ tone: 'success', message: this.catalog.t('space.attrsSaved') });
          this.modalRef.close(true);
        },
        onError: (parsed, fallback) => {
          this.errorKey.set(domainErrorKey(parsed.code, fallback));
          this.submitting.set(false);
        },
      },
    );
  }

  private valueFor(def: CatalogAttribute, raw: string): SpaceItemAttributeValueRequest {
    switch (def.dataType) {
      case CatalogAttributeType.Number:
        return { attributeId: def.id, valueNumber: Number(raw) };
      case CatalogAttributeType.Boolean:
        return { attributeId: def.id, valueBool: raw === 'true' };
      case CatalogAttributeType.Date:
        return { attributeId: def.id, valueDate: raw };
      case CatalogAttributeType.Select:
        return { attributeId: def.id, optionId: raw };
      default:
        return { attributeId: def.id, valueText: raw };
    }
  }
}
