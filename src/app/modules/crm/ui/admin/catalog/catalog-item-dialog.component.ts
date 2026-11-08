import {
  ChangeDetectionStrategy,
  Component,
  computed,
  effect,
  inject,
  signal,
} from '@angular/core';
import type { HttpErrorResponse } from '@angular/common/http';
import {
  FormBuilder,
  FormControl,
  FormGroup,
  ReactiveFormsModule,
  Validators,
} from '@angular/forms';
import { CatalogService } from '@platform/i18n/catalog.service';
import { CrmCatalogService } from '../../../data/crm-catalog.service';
import { CrmCatalogItemDetailService } from '../../../data/crm-catalog-item-detail.service';
import { ErrorHandlerService, friendly } from '@platform/http/error-handler.service';
import { ToastService } from '@platform/feedback/toast.service';
import { CatalogAttributeType } from '../../../model/crm-enums';
import type { CatalogAttribute, CatalogItem, ItemAttributeValue } from '../../../model';
import {
  PERA_MODAL_DATA,
  PeraCheckboxComponent,
  PeraDateInputComponent,
  PeraFormFieldComponent,
  PeraFormModalComponent,
  PeraInputComponent,
  PeraModalRef,
  PeraSelectComponent,
  PeraSpinnerComponent,
  SelectOption,
} from '@ds';
import { CatalogStore } from '../../../stores/catalog.store';

export interface CatalogItemDialogData {
  categoryId: string;
  /**
   * The promote flow's pre-fill: a custom board row's typed name, seeded into `nameEn`
   * and slugified into a starting `code` the admin can still edit.
   */
  prefillName?: string | null;
  /**
   * Sync F4f: present → EDIT that item. It is read through `GET /crm/catalog/items/{id}` (S10);
   * the identity fields show read-only (there is no item update route) and only the spec values are
   * saved, through the replace-all set-values route.
   */
  itemId?: string;
}

/**
 * Create a catalog item (F6). 009b #N-9: create-only — there is no item update route. Identity fields are fixed (name, purchasable — no
 * description or image since 009b #38); the SPEC fields below them are GENERATED from the
 * category's inherited attribute chain — the behavior that makes the category/attribute/item split
 * visible to an admin for the first time. One control per effective attribute:
 * Select → option select, Number → number + unit suffix, Text → `dir="auto"`,
 * Boolean → three-way select (unset ≠ false — completeness must be able to tell "not
 * answered" from "answered no"), Date → date input.
 *
 * Create + the attribute-values write are a two-step chain (create needs the new id back
 * before the spec can be written), so — like `new-node-dialog.component.ts` before it —
 * this calls `CrmCatalogService` directly rather than through `CatalogAdminStore`, whose
 * `run()` helper discards the response body. Closes with the item's id on success (create
 * OR edit), so the promote flow above this dialog can call `promoteItem` with it.
 */
@Component({
  selector: 'app-crm-catalog-item-dialog',
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [
    ReactiveFormsModule,
    PeraCheckboxComponent,
    PeraDateInputComponent,
    PeraFormFieldComponent,
    PeraFormModalComponent,
    PeraInputComponent,
    PeraSelectComponent,
    PeraSpinnerComponent,
  ],
  template: `
    <pera-form-modal
      [eyebrow]="
        isEdit ? 'PUT /api/crm/catalog/items/{id}/attribute-values' : 'POST /api/crm/catalog/items'
      "
      [title]="catalog.t(isEdit ? 'cat.editItem' : 'cat.newItem')"
      size="md"
      permission="crm.catalog.manage"
      [submitLabel]="catalog.t('cat.save')"
      [submittingLabel]="catalog.t('common.saving')"
      [submitting]="submitting()"
      [errorMessage]="errorMessage()"
      (submitted)="submit()"
      (cancelled)="close()"
    >
      <div [formGroup]="form" class="flex flex-col gap-4">
        @if (isEdit) {
          <p class="fs-caption text-text-muted m-0" data-testid="cat-identity-fixed">
            {{ catalog.t('cat.identityFixed') }}
          </p>
        }
        <pera-form-field [label]="catalog.t('cat.codeL')" [required]="true">
          <pera-input formControlName="code" dir="ltr" />
        </pera-form-field>
        <div class="grid grid-cols-1 sm:grid-cols-2 gap-x-4 gap-y-3">
          <pera-form-field [label]="catalog.t('cat.nameEnL')" [required]="true">
            <pera-input formControlName="nameEn" dir="ltr" />
          </pera-form-field>
          <pera-form-field [label]="catalog.t('cat.nameArL')" [required]="true">
            <pera-input formControlName="nameAr" dir="rtl" />
          </pera-form-field>
          <!-- 009b #38: the item create binds no description or image. -->
        </div>
        <!-- Sync F4f (S9): the item's description and image, read-only, when the server has them. -->
        @if (item(); as it) {
          <div class="flex items-start gap-3" data-testid="cat-item-media">
            @if (it.imageUri) {
              <img
                [src]="it.imageUri"
                [alt]="catalog.t('cat.imageL')"
                class="w-12 h-12 object-cover border border-border shrink-0"
                data-testid="cat-item-image"
              />
            }
            <div class="flex flex-col gap-1 min-w-0">
              <span class="fs-label uppercase tracking-wide text-text-muted">{{
                catalog.t('cat.descriptionL')
              }}</span>
              <p class="fs-body-sm m-0" dir="auto" data-testid="cat-item-description">
                {{ description(it) || catalog.t('cat.noDescription') }}
              </p>
            </div>
          </div>
        }
        <pera-checkbox formControlName="isPurchasable">{{
          catalog.t('cat.isPurchasableL')
        }}</pera-checkbox>

        @if (defs(); as list) {
          @if (list.length > 0) {
            <!-- Sync F4f: the spec controls live in specForm, not the outer form. -->
            <div [formGroup]="specForm" class="flex flex-col gap-3 pt-3 border-t border-border">
              <span class="fs-label uppercase tracking-wide text-text-muted">{{
                catalog.t('cat.specs')
              }}</span>
              @for (def of list; track def.id) {
                <pera-form-field [label]="specLabel(def)" [required]="def.isRequired">
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
                      <!-- Sync F4f: options come from GET /crm/catalog/attributes/{id}/options. -->
                      <pera-select [formControlName]="def.id" [options]="optionsFor(def.id)" />
                    }
                    @default {
                      <pera-input [formControlName]="def.id" dir="auto" />
                    }
                  }
                </pera-form-field>
              }
            </div>
          }
        } @else {
          <div class="flex justify-center py-4"><pera-spinner /></div>
        }
      </div>
    </pera-form-modal>
  `,
})
export class CrmCatalogItemDialogComponent {
  private readonly api = inject(CrmCatalogService);
  private readonly detailApi = inject(CrmCatalogItemDetailService);
  private readonly errorHandler = inject(ErrorHandlerService);
  private readonly toast = inject(ToastService);
  private readonly cache = inject(CatalogStore);
  private readonly fb = inject(FormBuilder);
  private readonly modalRef = inject(PeraModalRef) as PeraModalRef<string | null>;
  protected readonly catalog = inject(CatalogService);
  readonly data = inject(PERA_MODAL_DATA) as CatalogItemDialogData;
  readonly isEdit = !!this.data.itemId;
  /** Sync F4f: the item being edited, once read. */
  protected readonly item = signal<CatalogItem | null>(null);
  private seeded = false;
  private readonly selectOptions = signal<Record<string, SelectOption[]>>({});

  protected readonly ATTR_TYPE = CatalogAttributeType;

  /** `undefined` while the definitions are still in flight — the same distinction
   * `edit-item-attributes-dialog.component.ts` makes, and for the same reason: a
   * synchronous read here could silently skip the load and render an empty spec block
   * that looks like "this category has no attributes" instead of "still loading". */
  protected readonly defs = computed(() => this.cache.effectiveAttributes(this.data.categoryId));
  protected readonly submitting = signal(false);
  private readonly errorKey = signal<string | null>(null);
  protected readonly errorMessage = computed(() => this.errorKey());

  protected readonly boolOptions: SelectOption[] = [
    { value: '', label: '—' },
    { value: 'true', label: this.catalog.t('common.yes') },
    { value: 'false', label: this.catalog.t('common.no') },
  ];

  readonly form = this.fb.nonNullable.group({
    code: ['', [Validators.required, Validators.pattern(/^[a-z0-9_]{1,64}$/)]],
    nameEn: ['', [Validators.required, Validators.maxLength(200)]],
    nameAr: ['', [Validators.required, Validators.maxLength(200)]],
    isPurchasable: [true],
  });

  /** Controls are keyed by attribute id, built once the defs land — mirrors the board's
   * attribute editor exactly. */
  readonly specForm = new FormGroup<Record<string, FormControl<string>>>({});
  private built = false;

  constructor() {
    this.cache.loadEffectiveAttributes(this.data.categoryId);

    if (this.data.itemId) {
      this.form.disable();
      this.detailApi.getItemDetail(this.data.itemId).subscribe({
        next: (item) => {
          this.form.patchValue({
            code: item.code,
            nameEn: item.nameEn,
            nameAr: item.nameAr,
            isPurchasable: item.isPurchasable,
          });
          this.item.set(item);
        },
        error: () => this.errorKey.set(this.catalog.t('cat.itemLoadFailed')),
      });
    }

    if (this.data.prefillName) {
      this.form.patchValue({
        nameEn: this.data.prefillName,
        code: slugify(this.data.prefillName),
      });
    }

    effect(() => {
      const defs = this.defs();
      if (!defs || this.built) return;
      this.built = true;
      for (const def of defs) {
        this.specForm.addControl(def.id, new FormControl('', { nonNullable: true }));
        if (def.dataType === CatalogAttributeType.Select) this.loadOptions(def.id);
      }
    });

    // Sync F4f: seed the spec controls from the item's values once both have landed.
    effect(() => {
      const defs = this.defs();
      const item = this.item();
      if (!defs || !item || this.seeded) return;
      this.seeded = true;
      for (const value of item.attributes) {
        this.specForm.get(value.attributeId)?.setValue(specText(value));
      }
    });
  }

  /** Sync F4f: a Select attribute's active options, as select rows (a blank row clears it). */
  protected optionsFor(attributeId: string): SelectOption[] {
    return this.selectOptions()[attributeId] ?? [{ value: '', label: '—' }];
  }

  private loadOptions(attributeId: string): void {
    this.api.attributeOptions(attributeId).subscribe({
      next: (options) =>
        this.selectOptions.update((all) => ({
          ...all,
          [attributeId]: [
            { value: '', label: '—' },
            ...options.map((o) => ({
              value: o.id,
              label: this.catalog.locale() === 'ar' ? o.nameAr || o.nameEn : o.nameEn,
            })),
          ],
        })),
    });
  }

  protected specLabel(def: CatalogAttribute): string {
    const name = this.catalog.locale() === 'ar' ? def.nameAr || def.nameEn : def.nameEn;
    return def.unit ? `${name} · ${def.unit}` : name;
  }

  protected description(item: CatalogItem): string {
    return (
      (this.catalog.locale() === 'ar'
        ? item.descriptionAr || item.descriptionEn
        : item.descriptionEn || item.descriptionAr) ?? ''
    );
  }

  close(): void {
    this.modalRef.close(null);
  }

  submit(): void {
    if (this.data.itemId) {
      // Sync F4f: an edit saves the spec values only (no item update route).
      if (!this.item()) return;
      this.submitting.set(true);
      this.errorKey.set(null);
      this.writeSpecValues(this.data.itemId);
      return;
    }
    if (this.form.invalid) {
      this.form.markAllAsTouched();
      return;
    }
    this.submitting.set(true);
    this.errorKey.set(null);
    const v = this.form.getRawValue();
    const body = {
      code: v.code.trim(),
      nameEn: v.nameEn.trim(),
      nameAr: v.nameAr.trim(),
      isPurchasable: v.isPurchasable,
    };

    this.api.createItem({ ...body, categoryId: this.data.categoryId }).subscribe({
      next: (itemId) => this.writeSpecValues(itemId),
      error: (err: HttpErrorResponse) => this.fail(err),
    });
  }

  /** Replace-all: every attribute is sent, including blanks — a blank IS the clear gesture. */
  private writeSpecValues(itemId: string): void {
    const defs = this.defs() ?? [];
    const values = defs
      .map((def) => {
        const raw = String(this.specForm.get(def.id)?.value ?? '').trim();
        if (!raw) return null;
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
      })
      .filter((v): v is NonNullable<typeof v> => v !== null);

    this.api.setItemAttributeValues(itemId, values).subscribe({
      next: () => {
        this.toast.show({ tone: 'success', message: this.catalog.t('cat.itemSaved') });
        this.modalRef.close(itemId);
      },
      error: (err: HttpErrorResponse) => this.fail(err),
    });
  }

  private fail(err: HttpErrorResponse): void {
    this.errorKey.set(friendly(this.errorHandler.parse(err)));
    this.submitting.set(false);
  }
}

/** `"Vintage lamp"` → `"vintage_lamp"` — a starting point the admin can still edit;
 * the backend enforces `^[a-z0-9_]{1,64}$` regardless. */
function slugify(name: string): string {
  return name
    .trim()
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '_')
    .replace(/^_+|_+$/g, '')
    .slice(0, 64);
}

/** Sync F4f: one stored value as the text its spec control holds. */
function specText(value: ItemAttributeValue): string {
  if (value.valueNumber !== null) return String(value.valueNumber);
  if (value.valueBool !== null) return value.valueBool ? 'true' : 'false';
  if (value.valueDate !== null) return value.valueDate;
  if (value.optionId !== null) return value.optionId;
  return value.valueText ?? '';
}
