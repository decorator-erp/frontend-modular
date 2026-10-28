import {
  ChangeDetectionStrategy,
  Component,
  computed,
  effect,
  inject,
  Injector,
  signal,
} from '@angular/core';
import { FormBuilder, FormsModule, ReactiveFormsModule, Validators } from '@angular/forms';
import { CatalogService } from '@platform/i18n/catalog.service';
import type { CatalogKey } from '@platform/i18n/catalog/en';
import { CanDirective, PERM } from '@platform/permissions';
import { ToastService } from '@platform/feedback/toast.service';
import { CatalogAttributeType, CatalogSelectionMode } from '../../../model/crm-enums';
import { CrmLookupService } from '../../../data/crm-lookup.service';
import type {
  CatalogAttribute,
  CatalogAttributeOption,
  CatalogCategory,
  CrmSpaceType,
} from '../../../model';
import {
  ConfirmService,
  ModalService,
  PeraButtonComponent,
  PeraCheckboxComponent,
  PeraFormFieldComponent,
  PeraIconComponent,
  PeraInputComponent,
  PeraSelectComponent,
  PeraStatusBadgeComponent,
  PeraTextareaComponent,
  SelectOption,
} from '@ds';
import { CatalogAdminStore } from '../../../stores/catalog-admin.store';
import type { MutationHandlers } from '../../../stores/mutation-handlers';
import { CatalogStore } from '../../../stores/catalog.store';
import { domainErrorKey } from '../../domain-error-key';
import {
  CatalogItemDialogData,
  CrmCatalogItemDialogComponent,
} from './catalog-item-dialog.component';

/**
 * The detail rail for the current category (v2, Run B F6): bilingual identity, branch
 * rules, attribute definitions (own + inherited), items, targeting, and move. Replaces
 * `catalog-node-detail.component.ts`. 009b #N-8: no category update, activate or delete
 * route exists, so the identity form is read-only (disabled, no Save) and Activate/Delete
 * are gone.
 *
 * Two things that existed in the v1 admin are gone, not merely changed: the
 * `isSelectable` checkbox and its invariant-enforcement (categories are ALWAYS branches
 * in v2 — the category/item split IS what `isSelectable` used to distinguish, so there is
 * nothing left for the field to mean here), and the Specs card (F6c — a category has no
 * spec values of its own; only its items do, edited through the item dialog below).
 *
 * Targeting is write-only: no route reads a category's mappings (009b #34, #N-7).
 */
@Component({
  selector: 'app-crm-catalog-category-detail',
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [
    ReactiveFormsModule,
    FormsModule,
    CanDirective,
    PeraButtonComponent,
    PeraCheckboxComponent,
    PeraFormFieldComponent,
    PeraIconComponent,
    PeraInputComponent,
    PeraSelectComponent,
    PeraTextareaComponent,
    PeraStatusBadgeComponent,
  ],
  template: `
    @if (category(); as c) {
      <div class="flex flex-col gap-4">
        <!-- Identity + rules -->
        <section class="bg-surface border border-border rounded-card">
          <header class="flex items-center gap-2 px-4 py-3 border-b border-border">
            <span class="fs-label uppercase tracking-wide text-text-muted">{{
              catalog.t('cat.identity')
            }}</span>
            @if (!c.isActive) {
              <pera-status-badge
                tone="neutral"
                [label]="catalog.t('cat.deactivate')"
                [dot]="false"
              />
            }
            <span class="font-mono fs-micro text-text-muted ms-auto">{{ c.code }}</span>
          </header>
          <div [formGroup]="form" class="flex flex-col gap-4 p-4">
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
            @if (imagePreview()) {
              <img
                [src]="imagePreview()"
                alt=""
                class="max-w-full h-24 w-auto object-contain rounded border border-border"
              />
            }

            <!-- Rules -->
            <div class="flex flex-col gap-3 pt-2 border-t border-border">
              <span class="fs-label uppercase tracking-wide text-text-muted">{{
                catalog.t('cat.rules')
              }}</span>
              <pera-form-field [label]="catalog.t('cat.selectionModeL')">
                <pera-select formControlName="selectionMode" [options]="modeOptions" />
              </pera-form-field>
              <pera-checkbox formControlName="isRequired">{{
                catalog.t('cat.requiredL')
              }}</pera-checkbox>
            </div>
          </div>
        </section>

        <!-- Effective attributes -->
        <section class="bg-surface border border-border rounded-card">
          <header class="flex items-center gap-2 px-4 py-3 border-b border-border">
            <span class="fs-label uppercase tracking-wide text-text-muted">{{
              catalog.t('cat.effectiveAttributes')
            }}</span>
            <button
              type="button"
              class="ms-auto fs-caption text-accent hover:underline"
              *peraCan="PERM.crm.catalog.manage"
              (click)="toggleAddAttr()"
            >
              {{ catalog.t('cat.addAttribute') }}
            </button>
          </header>
          <div class="flex flex-col gap-2 p-4">
            @for (attr of attributes(); track attr.id) {
              <div class="flex flex-col gap-1.5">
                <div class="flex items-center gap-2 flex-wrap">
                  <span class="fs-body text-text">{{ name(attr) }}</span>
                  <span class="fs-micro text-text-muted"
                    >{{ typeLabel(attr.dataType) }}{{ attr.unit ? ' · ' + attr.unit : '' }}</span
                  >
                  @if (attr.isRequired) {
                    <pera-status-badge
                      tone="error"
                      [label]="catalog.t('cat.attrRequired')"
                      [dot]="false"
                    />
                  }
                  <span class="fs-micro text-text-muted ms-auto">{{ origin(attr, c) }}</span>
                  @if (attr.categoryId === c.id) {
                    <ng-container *peraCan="PERM.crm.catalog.manage">
                      <button
                        type="button"
                        class="fs-micro text-accent hover:underline"
                        (click)="toggleEditAttr(attr)"
                      >
                        {{ catalog.t('common.edit') }}
                      </button>
                      <button
                        type="button"
                        class="fs-micro text-danger hover:underline"
                        (click)="removeAttr(attr)"
                      >
                        {{ catalog.t('cat.delete') }}
                      </button>
                    </ng-container>
                  }
                </div>

                <!-- The data type is absent by design: immutable once any value exists. -->
                @if (editingAttrId() === attr.id) {
                  <div [formGroup]="attrEditForm" class="flex flex-col gap-2">
                    <div class="grid grid-cols-1 sm:grid-cols-2 gap-2">
                      <pera-input
                        formControlName="code"
                        [placeholder]="catalog.t('cat.codeL')"
                        dir="ltr"
                      />
                      <pera-input
                        formControlName="unit"
                        [placeholder]="catalog.t('cat.attrUnit')"
                        dir="ltr"
                      />
                      <pera-input
                        formControlName="nameEn"
                        [placeholder]="catalog.t('cat.nameEnL')"
                        dir="ltr"
                      />
                      <pera-input
                        formControlName="nameAr"
                        [placeholder]="catalog.t('cat.nameArL')"
                        dir="rtl"
                      />
                    </div>
                    <div class="flex items-center gap-2">
                      <pera-checkbox formControlName="isRequired">{{
                        catalog.t('cat.attrRequired')
                      }}</pera-checkbox>
                      <pera-button
                        variant="primary"
                        size="xs"
                        class="ms-auto"
                        [loading]="store.saving()"
                        (click)="submitEditAttr(attr)"
                        >{{ catalog.t('cat.save') }}</pera-button
                      >
                    </div>
                  </div>
                }

                <!--
                  A Select attribute is unusable without options — the picker would offer a
                  dropdown with nothing in it. Only the DEFINING category may edit them.
                -->
                @if (attr.dataType === ATTR_TYPE.Select) {
                  <div class="flex flex-col gap-1 ps-3 border-s border-border">
                    <div class="flex items-center gap-1.5 flex-wrap">
                      @for (opt of sortedOptions(attr); track opt.id; let oi = $index) {
                        <span
                          class="inline-flex items-center gap-1 fs-micro px-1.5 py-0.5 rounded bg-surface-muted text-text-secondary"
                        >
                          <span dir="auto">{{ name(opt) }}</span>
                          @if (attr.categoryId === c.id) {
                            <ng-container *peraCan="PERM.crm.catalog.manage">
                              <button
                                type="button"
                                [attr.aria-label]="catalog.t('common.edit')"
                                (click)="toggleEditOption(opt)"
                              >
                                <pera-icon name="pencil" [size]="12" />
                              </button>
                              <button
                                type="button"
                                class="disabled:opacity-30"
                                [disabled]="oi === 0"
                                [attr.aria-label]="catalog.t('cat.moveUp')"
                                (click)="store.reorderOption(attr, opt.id, -1)"
                              >
                                <pera-icon name="chevron-up" [size]="12" />
                              </button>
                              <button
                                type="button"
                                class="disabled:opacity-30"
                                [disabled]="oi === attr.options.length - 1"
                                [attr.aria-label]="catalog.t('cat.moveDown')"
                                (click)="store.reorderOption(attr, opt.id, 1)"
                              >
                                <pera-icon name="chevron-down" [size]="12" />
                              </button>
                              <button
                                type="button"
                                class="text-danger"
                                [attr.aria-label]="catalog.t('cat.delete')"
                                (click)="removeOption(opt)"
                              >
                                <pera-icon name="x" [size]="12" />
                              </button>
                            </ng-container>
                          }
                        </span>
                      } @empty {
                        <!-- 009b #36: no route reads an attribute's options. -->
                        <span class="fs-micro text-text-muted" data-testid="cat-options-unavailable"
                          >{{ catalog.t('cat.options') }}: {{ catalog.t('cat.notAvailable') }}</span
                        >
                      }

                      @if (attr.categoryId === c.id) {
                        <button
                          type="button"
                          class="fs-micro text-accent hover:underline"
                          *peraCan="PERM.crm.catalog.manage"
                          (click)="toggleAddOption(attr.id)"
                        >
                          {{ catalog.t('cat.addOption') }}
                        </button>
                      }
                    </div>

                    @if (editingOptionOf(attr); as editing) {
                      <div
                        [formGroup]="optionEditForm"
                        class="grid grid-cols-1 sm:grid-cols-3 gap-2"
                      >
                        <pera-input
                          formControlName="code"
                          [placeholder]="catalog.t('cat.codeL')"
                          dir="ltr"
                        />
                        <pera-input
                          formControlName="nameEn"
                          [placeholder]="catalog.t('cat.nameEnL')"
                          dir="ltr"
                        />
                        <pera-input
                          formControlName="nameAr"
                          [placeholder]="catalog.t('cat.nameArL')"
                          dir="rtl"
                        />
                        <pera-button
                          variant="primary"
                          size="xs"
                          [loading]="store.saving()"
                          (click)="submitEditOption(editing)"
                          >{{ catalog.t('cat.save') }}</pera-button
                        >
                      </div>
                    }

                    @if (addingOptionFor() === attr.id) {
                      <div [formGroup]="optionForm" class="grid grid-cols-1 sm:grid-cols-3 gap-2">
                        <pera-input
                          formControlName="code"
                          [placeholder]="catalog.t('cat.codeL')"
                          dir="ltr"
                        />
                        <pera-input
                          formControlName="nameEn"
                          [placeholder]="catalog.t('cat.nameEnL')"
                          dir="ltr"
                        />
                        <pera-input
                          formControlName="nameAr"
                          [placeholder]="catalog.t('cat.nameArL')"
                          dir="rtl"
                        />
                        <pera-button
                          variant="primary"
                          size="xs"
                          [loading]="store.saving()"
                          (click)="submitOption(attr.id)"
                          >{{ catalog.t('cat.addOption') }}</pera-button
                        >
                      </div>
                    }
                  </div>
                }
              </div>
            } @empty {
              <p class="fs-caption text-text-muted m-0">{{ catalog.t('cat.noAttributes') }}</p>
            }

            @if (addingAttr()) {
              <div [formGroup]="attrForm" class="flex flex-col gap-2 pt-3 border-t border-border">
                <div class="grid grid-cols-1 sm:grid-cols-2 gap-2">
                  <pera-input
                    formControlName="code"
                    [placeholder]="catalog.t('cat.codeL')"
                    dir="ltr"
                  />
                  <pera-select
                    formControlName="dataType"
                    [options]="typeOptions"
                    [placeholder]="catalog.t('cat.attrDataType')"
                  />
                  <pera-input
                    formControlName="nameEn"
                    [placeholder]="catalog.t('cat.nameEnL')"
                    dir="ltr"
                  />
                  <pera-input
                    formControlName="nameAr"
                    [placeholder]="catalog.t('cat.nameArL')"
                    dir="rtl"
                  />
                  <pera-input
                    formControlName="unit"
                    [placeholder]="catalog.t('cat.attrUnit')"
                    dir="ltr"
                  />
                </div>
                <div class="flex items-center gap-2">
                  <pera-checkbox formControlName="isRequired">{{
                    catalog.t('cat.attrRequired')
                  }}</pera-checkbox>
                  <pera-button
                    variant="primary"
                    size="sm"
                    class="ms-auto"
                    [loading]="store.saving()"
                    (click)="submitAttr(c)"
                    >{{ catalog.t('cat.addAttribute') }}</pera-button
                  >
                </div>
              </div>
            }
          </div>
        </section>

        <!-- Items -->
        <section class="bg-surface border border-border rounded-card">
          <header class="flex items-center gap-2 px-4 py-3 border-b border-border">
            <span class="fs-label uppercase tracking-wide text-text-muted">{{
              catalog.t('cat.items')
            }}</span>
            <span class="fs-micro text-text-muted font-mono">{{ items().length }}</span>
            <button
              type="button"
              class="ms-auto fs-caption text-accent hover:underline"
              *peraCan="PERM.crm.catalog.manage"
              (click)="openItemDialog(c)"
            >
              {{ catalog.t('cat.addItem') }}
            </button>
          </header>
          <div class="flex flex-col p-2">
            @for (item of items(); track item.trackKey) {
              <div
                class="flex items-center gap-2 px-2 py-2 border-b border-border last:border-b-0"
                [class.opacity-50]="!item.isActive"
              >
                <span class="fs-body text-text truncate flex-1 min-w-0" dir="auto">{{
                  name(item)
                }}</span>
                @if (!item.isActive) {
                  <pera-status-badge
                    tone="neutral"
                    [label]="catalog.t('cat.inactive')"
                    [dot]="false"
                  />
                }
              </div>
            } @empty {
              <p class="fs-caption text-text-muted m-0 p-2">{{ catalog.t('cat.noItems') }}</p>
            }
          </div>
        </section>

        <!--
          Space-type targeting. 009b #34: no route reads a category's mappings, so the
          current set is "not available"; mapping a new type still works (row 37).
        -->
        <section class="bg-surface border border-border rounded-card">
          <header class="px-4 py-3 border-b border-border">
            <span class="fs-label uppercase tracking-wide text-text-muted">{{
              catalog.t('cat.targeting')
            }}</span>
          </header>
          <div class="p-4 flex flex-col gap-2">
            <p class="fs-caption text-text-muted m-0" data-testid="cat-targeting-unavailable">
              {{ catalog.t('cat.notAvailable') }}
            </p>
            <div class="flex items-center gap-2" *peraCan="PERM.crm.catalog.manage">
              <pera-select
                class="flex-1"
                [options]="unmappedSpaceTypeOptions()"
                [ngModel]="targetType()"
                (ngModelChange)="targetType.set($event)"
                [placeholder]="catalog.t('cat.targeting')"
              />
              <pera-button
                variant="secondary"
                size="sm"
                [disabled]="!targetType()"
                (click)="mapType(c)"
                >{{ catalog.t('cat.mapType') }}</pera-button
              >
            </div>
          </div>
        </section>

        <!-- Actions -->
        <div class="flex items-center gap-2 flex-wrap" *peraCan="PERM.crm.catalog.manage">
          <pera-button variant="secondary" size="sm" (click)="moving.set(!moving())">{{
            catalog.t('cat.move')
          }}</pera-button>
        </div>

        @if (moving()) {
          <div class="bg-surface border border-border rounded-card p-4 flex flex-col gap-2">
            <span class="fs-label uppercase tracking-wide text-text-muted">{{
              catalog.t('cat.moveTitle')
            }}</span>
            <pera-select
              [options]="moveOptions(c)"
              [ngModel]="moveTarget()"
              (ngModelChange)="moveTarget.set($event)"
              [placeholder]="catalog.t('cat.moveTo')"
            />
            <pera-button variant="primary" size="sm" class="self-start" (click)="doMove(c)">{{
              catalog.t('cat.move')
            }}</pera-button>
          </div>
        }
      </div>
    } @else {
      <p class="fs-caption text-text-muted p-4 m-0">{{ catalog.t('cat.selectPrompt') }}</p>
    }
  `,
})
export class CrmCatalogCategoryDetailComponent {
  protected readonly store = inject(CatalogAdminStore);
  private readonly cache = inject(CatalogStore);
  protected readonly catalog = inject(CatalogService);
  private readonly confirm = inject(ConfirmService);
  private readonly lookup = inject(CrmLookupService);
  private readonly toast = inject(ToastService);
  private readonly fb = inject(FormBuilder);
  private readonly modal = inject(ModalService);
  /** Lent to the item dialog so it can reach this route's `CatalogAdminStore`. */
  private readonly injector = inject(Injector);
  protected readonly PERM = PERM;

  readonly category = this.store.currentCategory;
  /** Space types for the targeting card — one lookup, shared by every category. */
  private readonly spaceTypes = signal<CrmSpaceType[]>([]);

  readonly attributes = this.store.effectiveAttributes;
  readonly items = this.store.items;

  protected readonly ATTR_TYPE = CatalogAttributeType;

  // Four inline panels share one open slot — see `closePanels()`.
  readonly addingAttr = signal(false);
  /** The attribute id whose "add option" row is open, or `null`. */
  readonly addingOptionFor = signal<string | null>(null);
  /** The attribute id whose inline edit panel is open, or `null`. */
  readonly editingAttrId = signal<string | null>(null);
  /** The option id whose inline edit row is open, or `null`. */
  readonly editingOptionId = signal<string | null>(null);
  /** The space type selected in the targeting card's "add" row. */
  readonly targetType = signal<string>('');

  /**
   * Every active space type (009b #27). The current mappings cannot be read (009b #N-7), so
   * an already-mapped type is offered too and answers 409 `DuplicateMapping`.
   * `spaceTypeName` still names an inactive type.
   */
  readonly unmappedSpaceTypeOptions = computed<SelectOption[]>(() => {
    return this.spaceTypes()
      .filter((s) => s.isActive !== false)
      .map((s) => ({
        value: s.id,
        label: this.catalog.locale() === 'ar' ? s.nameAr || s.nameEn : s.nameEn,
      }));
  });

  readonly optionForm = this.fb.nonNullable.group({
    code: ['', [Validators.required]],
    nameEn: ['', [Validators.required]],
    nameAr: ['', [Validators.required]],
  });
  readonly optionEditForm = this.fb.nonNullable.group({
    code: ['', [Validators.required]],
    nameEn: ['', [Validators.required]],
    nameAr: ['', [Validators.required]],
  });
  readonly attrEditForm = this.fb.nonNullable.group({
    code: ['', [Validators.required]],
    nameEn: ['', [Validators.required]],
    nameAr: ['', [Validators.required]],
    unit: [''],
    isRequired: [false],
  });
  readonly moving = signal(false);
  readonly moveTarget = signal<string>('');
  readonly imagePreview = signal<string>('');

  readonly modeOptions: SelectOption[] = [
    { value: String(CatalogSelectionMode.None), label: this.catalog.t('cat.modeNone') },
    { value: String(CatalogSelectionMode.Single), label: this.catalog.t('cat.modeSingle') },
    { value: String(CatalogSelectionMode.Multi), label: this.catalog.t('cat.modeMulti') },
  ];
  readonly typeOptions: SelectOption[] = [
    { value: String(CatalogAttributeType.Text), label: this.catalog.t('cat.attrTypeText') },
    { value: String(CatalogAttributeType.Number), label: this.catalog.t('cat.attrTypeNumber') },
    { value: String(CatalogAttributeType.Boolean), label: this.catalog.t('cat.attrTypeBoolean') },
    { value: String(CatalogAttributeType.Date), label: this.catalog.t('cat.attrTypeDate') },
    { value: String(CatalogAttributeType.Select), label: this.catalog.t('cat.attrTypeSelect') },
  ];

  readonly form = this.fb.nonNullable.group({
    nameEn: ['', [Validators.required, Validators.maxLength(200)]],
    nameAr: ['', [Validators.required, Validators.maxLength(200)]],
    descriptionEn: [''],
    descriptionAr: [''],
    imageUri: [''],
    selectionMode: [String(CatalogSelectionMode.None)],
    isRequired: [false],
  });

  readonly attrForm = this.fb.nonNullable.group({
    code: ['', [Validators.required]],
    nameEn: ['', [Validators.required]],
    nameAr: ['', [Validators.required]],
    dataType: [String(CatalogAttributeType.Text)],
    unit: [''],
    isRequired: [false],
  });

  constructor() {
    this.lookup.spaceTypes().subscribe({
      next: (types) => this.spaceTypes.set(types),
      error: () => undefined, // the targeting card simply stays empty
    });

    // Sync the identity/rules form whenever the current category changes.
    effect(() => {
      const c = this.category();
      if (!c) return;
      this.form.reset({
        nameEn: c.nameEn,
        nameAr: c.nameAr,
        // 009b #34: the tree carries no description or image — the fields start empty.
        descriptionEn: '',
        descriptionAr: '',
        imageUri: '',
        selectionMode: String(c.selectionMode),
        isRequired: c.isRequired,
      });
      this.imagePreview.set('');
    });

    this.form.controls.imageUri.valueChanges.subscribe((v) => this.imagePreview.set(v ?? ''));
    this.form.disable(); // 009b #N-8: no update route — the identity is read-only.
  }

  name(x: { nameEn: string; nameAr: string }): string {
    return this.catalog.locale() === 'ar' ? x.nameAr || x.nameEn : x.nameEn;
  }

  spaceTypeName(id: string): string {
    const st = this.spaceTypes().find((s) => s.id === id);
    return st ? this.name(st) : id;
  }

  typeLabel(type: CatalogAttributeType): string {
    const map: Record<CatalogAttributeType, string> = {
      [CatalogAttributeType.Text]: 'cat.attrTypeText',
      [CatalogAttributeType.Number]: 'cat.attrTypeNumber',
      [CatalogAttributeType.Boolean]: 'cat.attrTypeBoolean',
      [CatalogAttributeType.Date]: 'cat.attrTypeDate',
      [CatalogAttributeType.Select]: 'cat.attrTypeSelect',
    };
    return this.catalog.t(map[type] as 'cat.attrTypeText');
  }

  origin(attr: CatalogAttribute, category: CatalogCategory): string {
    if (attr.categoryId === category.id) return this.catalog.t('cat.definedHere');
    const owner = this.cache.category(attr.categoryId);
    return this.catalog.t('cat.inheritedFrom', {
      name: owner ? this.name(owner) : attr.categoryId,
    });
  }

  moveOptions(category: CatalogCategory): SelectOption[] {
    const blocked = this.cache.categorySubtreeIds(category.id);
    const options: SelectOption[] = [{ value: '', label: this.catalog.t('cat.moveToRoot') }];
    for (const candidate of this.cache.categories()) {
      if (blocked.has(candidate.id)) continue;
      options.push({
        value: candidate.id,
        label: '— '.repeat(candidate.depth) + this.name(candidate),
      });
    }
    return options;
  }

  /**
   * Toast the real outcome, never the intent — a rejected save (`CodeTaken`, `CycleDetected`)
   * must not read as success. `onError` gets the parsed error so the toast names the reason.
   */
  private toastOn(successKey: CatalogKey): MutationHandlers {
    return {
      onDone: () => this.toast.show({ tone: 'success', message: this.catalog.t(successKey) }),
      onError: (err, fallback) =>
        this.toast.show({
          tone: 'danger',
          message: this.catalog.t(domainErrorKey(err.code, fallback)),
        }),
    };
  }

  submitAttr(category: CatalogCategory): void {
    if (this.attrForm.invalid) {
      this.attrForm.markAllAsTouched();
      return;
    }
    const v = this.attrForm.getRawValue();
    this.store.addAttribute(category.id, {
      code: v.code.trim(),
      nameEn: v.nameEn.trim(),
      nameAr: v.nameAr.trim(),
      dataType: Number(v.dataType),
      unit: v.unit.trim() || null,
      isRequired: v.isRequired,
    });
    this.attrForm.reset({ dataType: String(CatalogAttributeType.Text) });
    this.addingAttr.set(false);
  }

  /** Options render in server order; sort defensively so reorder feedback is stable. */
  sortedOptions(attr: CatalogAttribute): CatalogAttributeOption[] {
    return [...attr.options].sort((a, b) => a.sortOrder - b.sortOrder);
  }

  mapType(category: CatalogCategory): void {
    const id = this.targetType();
    if (!id) return;
    this.store.mapSpaceType(category.id, id, this.toastOn('cat.nodeSaved'));
    this.targetType.set('');
  }

  /** Only one inline panel is open at a time — four stacked forms would be unreadable. */
  private closePanels(): void {
    this.addingAttr.set(false);
    this.addingOptionFor.set(null);
    this.editingAttrId.set(null);
    this.editingOptionId.set(null);
  }

  toggleAddAttr(): void {
    const open = this.addingAttr();
    this.closePanels();
    this.addingAttr.set(!open);
  }

  toggleAddOption(attributeId: string): void {
    const open = this.addingOptionFor() === attributeId;
    this.closePanels();
    this.addingOptionFor.set(open ? null : attributeId);
    this.optionForm.reset();
  }

  toggleEditAttr(attr: CatalogAttribute): void {
    const open = this.editingAttrId() === attr.id;
    this.closePanels();
    if (open) return;
    this.editingAttrId.set(attr.id);
    this.attrEditForm.reset({
      code: attr.code,
      nameEn: attr.nameEn,
      nameAr: attr.nameAr,
      unit: attr.unit ?? '',
      isRequired: attr.isRequired,
    });
  }

  submitEditAttr(attr: CatalogAttribute): void {
    if (this.attrEditForm.invalid) {
      this.attrEditForm.markAllAsTouched();
      return;
    }
    const v = this.attrEditForm.getRawValue();
    this.store.updateAttribute(
      attr.id,
      {
        code: v.code.trim(),
        nameEn: v.nameEn.trim(),
        nameAr: v.nameAr.trim(),
        unit: v.unit.trim() || null,
        isRequired: v.isRequired,
      },
      this.toastOn('cat.attrSaved'),
    );
    this.editingAttrId.set(null);
  }

  toggleEditOption(option: CatalogAttributeOption): void {
    const open = this.editingOptionId() === option.id;
    this.closePanels();
    if (open) return;
    this.editingOptionId.set(option.id);
    this.optionEditForm.reset({
      code: option.code,
      nameEn: option.nameEn,
      nameAr: option.nameAr,
    });
  }

  /** The option under edit within THIS attribute, so the row renders in the right block. */
  editingOptionOf(attr: CatalogAttribute): CatalogAttributeOption | null {
    const id = this.editingOptionId();
    return id ? (attr.options.find((o) => o.id === id) ?? null) : null;
  }

  submitEditOption(option: CatalogAttributeOption): void {
    if (this.optionEditForm.invalid) {
      this.optionEditForm.markAllAsTouched();
      return;
    }
    const v = this.optionEditForm.getRawValue();
    this.store.updateOption(
      option.id,
      {
        code: v.code.trim(),
        nameEn: v.nameEn.trim(),
        nameAr: v.nameAr.trim(),
        // The wire layer sends `imageUri ?? null`, so omitting it would CLEAR a persisted
        // image. This form does not edit it — resend what the option already carries.
        imageUri: option.imageUri,
      },
      this.toastOn('cat.attrSaved'),
    );
    this.editingOptionId.set(null);
  }

  submitOption(attributeId: string): void {
    if (this.optionForm.invalid) {
      this.optionForm.markAllAsTouched();
      return;
    }
    const v = this.optionForm.getRawValue();
    this.store.addOption(
      attributeId,
      { code: v.code.trim(), nameEn: v.nameEn.trim(), nameAr: v.nameAr.trim() },
      this.toastOn('cat.attrSaved'),
    );
    this.optionForm.reset();
    this.addingOptionFor.set(null);
  }

  removeOption(option: CatalogAttributeOption): void {
    void this.confirm
      .open({ title: this.catalog.t('cat.delete'), body: this.name(option), tone: 'danger' })
      .then((ok) => ok && this.store.deleteOption(option.id, this.toastOn('cat.attrSaved')));
  }

  removeAttr(attr: CatalogAttribute): void {
    void this.confirm
      .open({ title: this.catalog.t('cat.delete'), body: attr.nameEn, tone: 'danger' })
      .then((ok) => ok && this.store.deleteAttribute(attr.id));
  }

  doMove(category: CatalogCategory): void {
    this.store.moveCategory(category.id, this.moveTarget() || null, this.toastOn('cat.moved'));
    this.moving.set(false);
  }

  // ── Items ────────────────────────────────────────────────────────────

  /** Create-only (009b #N-9: no item update route). */
  openItemDialog(category: CatalogCategory): void {
    const data: CatalogItemDialogData = { categoryId: category.id };
    this.modal.open<string | null>(CrmCatalogItemDialogComponent, {
      size: 'md',
      data,
      injector: this.injector,
    });
  }
}
