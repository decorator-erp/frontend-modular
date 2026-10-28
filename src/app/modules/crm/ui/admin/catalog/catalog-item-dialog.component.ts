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
import { ErrorHandlerService, friendly } from '@platform/http/error-handler.service';
import { ToastService } from '@platform/feedback/toast.service';
import { CatalogAttributeType } from '../../../model/crm-enums';
import type { CatalogAttribute, CatalogItem } from '../../../model';
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
  PeraTextareaComponent,
  SelectOption,
} from '@ds';
import { CatalogStore } from '../../../stores/catalog.store';

export interface CatalogItemDialogData {
  categoryId: string;
  /** `null`/absent = create. */
  item?: CatalogItem | null;
  /**
   * The promote flow's pre-fill: a custom board row's typed name, seeded into `nameEn`
   * and slugified into a starting `code` the admin can still edit.
   */
  prefillName?: string | null;
}

/**
 * Create or edit a catalog item (F6). Identity fields are fixed (name, description,
 * image, purchasable); the SPEC fields below them are GENERATED from the category's
 * inherited attribute chain — the behavior that makes the category/attribute/item split
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
    PeraTextareaComponent,
  ],
  template: `
    <pera-form-modal
      [eyebrow]="data.item ? 'PUT /api/crm/catalog/items/{itemId}' : 'POST /api/crm/catalog/items'"
      [title]="data.item ? catalog.t('cat.editItem') : catalog.t('cat.newItem')"
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
          <pera-form-field [label]="catalog.t('cat.descEnL')">
            <pera-textarea formControlName="descriptionEn" dir="ltr" [rows]="2" />
          </pera-form-field>
          <pera-form-field [label]="catalog.t('cat.descArL')">
            <pera-textarea formControlName="descriptionAr" dir="rtl" [rows]="2" />
          </pera-form-field>
        </div>
        <pera-form-field [label]="catalog.t('cat.imageUrlL')">
          <pera-input formControlName="imageUri" dir="ltr" type="url" />
        </pera-form-field>
        <pera-checkbox formControlName="isPurchasable">{{
          catalog.t('cat.isPurchasableL')
        }}</pera-checkbox>

        @if (defs(); as list) {
          @if (list.length > 0) {
            <div class="flex flex-col gap-3 pt-3 border-t border-border">
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
        } @else {
          <div class="flex justify-center py-4"><pera-spinner /></div>
        }
      </div>
    </pera-form-modal>
  `,
})
export class CrmCatalogItemDialogComponent {
  private readonly api = inject(CrmCatalogService);
  private readonly errorHandler = inject(ErrorHandlerService);
  private readonly toast = inject(ToastService);
  private readonly cache = inject(CatalogStore);
  private readonly fb = inject(FormBuilder);
  private readonly modalRef = inject(PeraModalRef) as PeraModalRef<string | null>;
  protected readonly catalog = inject(CatalogService);
  readonly data = inject(PERA_MODAL_DATA) as CatalogItemDialogData;

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
    descriptionEn: [''],
    descriptionAr: [''],
    imageUri: [''],
    isPurchasable: [true],
  });

  /** Controls are keyed by attribute id, built once the defs land — mirrors the board's
   * attribute editor exactly. */
  readonly specForm = new FormGroup<Record<string, FormControl<string>>>({});
  private built = false;

  constructor() {
    this.cache.loadEffectiveAttributes(this.data.categoryId);

    const item = this.data.item;
    if (item) {
      this.form.reset({
        code: item.code,
        nameEn: item.nameEn,
        nameAr: item.nameAr,
        descriptionEn: item.descriptionEn ?? '',
        descriptionAr: item.descriptionAr ?? '',
        imageUri: item.imageUri ?? '',
        isPurchasable: item.isPurchasable,
      });
    } else if (this.data.prefillName) {
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
        this.specForm.addControl(def.id, new FormControl(this.seed(def), { nonNullable: true }));
      }
    });
  }

  /** The recorded value as form text — the inverse of `valueFor`. */
  private seed(def: CatalogAttribute): string {
    const item = this.data.item;
    const v = item?.attributes.find((a) => a.attributeId === def.id);
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

  protected specLabel(def: CatalogAttribute): string {
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
          label: this.catalog.locale() === 'ar' ? o.nameAr || o.nameEn : o.nameEn,
        })),
    ];
  }

  close(): void {
    this.modalRef.close(null);
  }

  submit(): void {
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
      descriptionEn: v.descriptionEn.trim() || null,
      descriptionAr: v.descriptionAr.trim() || null,
      imageUri: v.imageUri.trim() || null,
    };

    const existing = this.data.item;
    if (existing) {
      this.api.updateItem(existing.id, body).subscribe({
        next: () => this.writeSpecValues(existing.id),
        error: (err: HttpErrorResponse) => this.fail(err),
      });
    } else {
      this.api.createItem({ ...body, categoryId: this.data.categoryId }).subscribe({
        next: (itemId) => this.writeSpecValues(itemId),
        error: (err: HttpErrorResponse) => this.fail(err),
      });
    }
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
