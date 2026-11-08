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
import { NgTemplateOutlet } from '@angular/common';
import { CatalogService } from '@platform/i18n/catalog.service';
import type { CatalogKey } from '@platform/i18n/catalog/en';
import { CanDirective, PERM, PermissionsService } from '@platform/permissions';
import { ToastService } from '@platform/feedback/toast.service';
import { friendly } from '@platform/http/error-handler.service';
import { Router } from '@angular/router';
import type { CatalogEntryKind } from '../../../data/crm-catalog.service';
import {
  CatalogEntryDialogData,
  CrmCatalogEntryDialogComponent,
} from './catalog-entry-dialog.component';
import { CatalogAttributeType, CatalogSelectionMode } from '../../../model/crm-enums';
import { CrmLookupService } from '../../../data/crm-lookup.service';
import type {
  CatalogAttribute,
  CatalogAttributeOption,
  CatalogCategory,
  CatalogItem,
  CrmSpaceType,
} from '../../../model';
import {
  ConfirmService,
  ModalService,
  PeraButtonComponent,
  PeraSwitchComponent,
  PeraCheckboxComponent,
  PeraFormFieldComponent,
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
 * `catalog-node-detail.component.ts`. The identity form stays a read-only view; crmp C-4
 * (D4) adds Edit (`CrmCatalogEntryDialogComponent`), Activate/Deactivate and Delete for the
 * category, its own attributes, their options and its items — every write gated on
 * `crm.catalog.manage` — plus the options read with an "include inactive" toggle and unmap.
 *
 * Two things that existed in the v1 admin are gone, not merely changed: the
 * `isSelectable` checkbox and its invariant-enforcement (categories are ALWAYS branches
 * in v2 — the category/item split IS what `isSelectable` used to distinguish, so there is
 * nothing left for the field to mean here), and the Specs card (F6c — a category has no
 * spec values of its own; only its items do, edited through the item dialog below).
 *
 * Targeting: no route reads one category's mappings, so the card maps or unmaps a picked
 * type; the page's space-type filter (`tree?spaceTypeId`) shows what a type targets.
 */
@Component({
  selector: 'app-crm-catalog-category-detail',
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [
    NgTemplateOutlet,
    ReactiveFormsModule,
    FormsModule,
    CanDirective,
    PeraButtonComponent,
    PeraCheckboxComponent,
    PeraFormFieldComponent,
    PeraInputComponent,
    PeraSelectComponent,
    PeraTextareaComponent,
    PeraStatusBadgeComponent,
    PeraSwitchComponent,
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
          @if (canManage()) {
            <div
              class="flex items-center gap-2 flex-wrap px-4 pt-3"
              data-testid="cat-category-actions"
            >
              <pera-button variant="secondary" size="xs" (click)="edit('categories', c)">{{
                catalog.t('cat.edit')
              }}</pera-button>
              <pera-button
                variant="secondary"
                size="xs"
                [disabled]="store.saving()"
                (click)="toggleActive('categories', c)"
                >{{ catalog.t(c.isActive ? 'cat.deactivate' : 'cat.activate') }}</pera-button
              >
              <pera-button
                variant="danger"
                size="xs"
                [disabled]="store.saving()"
                (click)="remove('categories', c)"
                >{{ catalog.t('cat.delete') }}</pera-button
              >
            </div>
          }
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
            <pera-switch
              class="ms-auto fs-caption"
              data-testid="cat-include-inactive"
              [ngModel]="store.includeInactiveOptions()"
              (ngModelChange)="store.setIncludeInactiveOptions($event)"
              >{{ catalog.t('cat.includeInactive') }}</pera-switch
            >
            <button
              type="button"
              class="fs-caption text-accent hover:underline"
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
                  @if (!attr.isActive) {
                    <pera-status-badge
                      tone="neutral"
                      [label]="catalog.t('cat.inactive')"
                      [dot]="false"
                    />
                  }
                  <span class="fs-micro text-text-muted ms-auto">{{ origin(attr, c) }}</span>
                  @if (canManage() && attr.categoryId === c.id) {
                    <ng-container
                      *ngTemplateOutlet="rowActions; context: { kind: 'attributes', entry: attr }"
                    />
                  }
                </div>

                <!--
                  A Select attribute is unusable without options — the picker would offer a
                  dropdown with nothing in it. Only the DEFINING category may add them.
                -->
                @if (attr.dataType === ATTR_TYPE.Select) {
                  <div class="flex flex-col gap-1 ps-3 border-s border-border">
                    <div class="flex items-center gap-1.5 flex-wrap">
                      @for (opt of optionsOf(attr); track opt.id) {
                        <span
                          class="inline-flex items-center gap-1 fs-micro px-1.5 py-0.5 rounded bg-surface-muted text-text-secondary"
                          [class.opacity-50]="!opt.isActive"
                          data-testid="cat-option"
                        >
                          <span dir="auto">{{ name(opt) }}</span>
                          @if (canManage() && attr.categoryId === c.id) {
                            <ng-container
                              *ngTemplateOutlet="
                                rowActions;
                                context: { kind: 'options', entry: opt }
                              "
                            />
                          }
                        </span>
                      } @empty {
                        <span class="fs-micro text-text-muted">{{
                          catalog.t('cat.noOptions')
                        }}</span>
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
                @if (canManage()) {
                  <ng-container
                    *ngTemplateOutlet="rowActions; context: { kind: 'items', entry: item }"
                  />
                }
              </div>
            } @empty {
              <p class="fs-caption text-text-muted m-0 p-2">{{ catalog.t('cat.noItems') }}</p>
            }
          </div>
        </section>

        <!--
          Space-type targeting. No route reads one category's mappings: pick a type, then map
          (#61) or unmap (#116, 404 MappingNotFound shown). The page filter shows a type's tree.
        -->
        <section class="bg-surface border border-border rounded-card">
          <header class="px-4 py-3 border-b border-border">
            <span class="fs-label uppercase tracking-wide text-text-muted">{{
              catalog.t('cat.targeting')
            }}</span>
          </header>
          <div class="p-4 flex flex-col gap-2">
            <p class="fs-caption text-text-muted m-0" data-testid="cat-targeting-hint">
              {{ catalog.t('cat.targetingHint') }}
            </p>
            @if (store.spaceTypeFilter() && targetedByFilter(c)) {
              <pera-status-badge
                tone="info"
                [label]="catalog.t('cat.targetedHere')"
                [dot]="false"
              />
            }
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
              <pera-button
                variant="secondary"
                size="sm"
                [disabled]="!targetType() || store.saving()"
                (click)="unmapType(c)"
                >{{ catalog.t('cat.unmapType') }}</pera-button
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

    <!-- crmp C-4: Edit / Activate-Deactivate / Delete for one entry (real buttons, labelled). -->
    <ng-template #rowActions let-kind="kind" let-entry="entry">
      <span class="inline-flex items-center gap-1">
        <button
          type="button"
          class="fs-micro text-accent hover:underline"
          [attr.aria-label]="catalog.t('cat.editAria', { name: name(entry) })"
          (click)="edit(kind, entry)"
        >
          {{ catalog.t('cat.edit') }}
        </button>
        <button
          type="button"
          class="fs-micro text-accent hover:underline"
          [disabled]="store.saving()"
          [attr.aria-label]="
            catalog.t(entry.isActive ? 'cat.deactivateAria' : 'cat.activateAria', {
              name: name(entry),
            })
          "
          (click)="toggleActive(kind, entry)"
        >
          {{ catalog.t(entry.isActive ? 'cat.deactivate' : 'cat.activate') }}
        </button>
        <button
          type="button"
          class="fs-micro text-danger hover:underline"
          [disabled]="store.saving()"
          [attr.aria-label]="catalog.t('cat.deleteAria', { name: name(entry) })"
          (click)="remove(kind, entry)"
        >
          {{ catalog.t('cat.delete') }}
        </button>
      </span>
    </ng-template>
  `,
})
export class CrmCatalogCategoryDetailComponent {
  protected readonly store = inject(CatalogAdminStore);
  private readonly cache = inject(CatalogStore);
  protected readonly catalog = inject(CatalogService);
  private readonly lookup = inject(CrmLookupService);
  private readonly toast = inject(ToastService);
  private readonly fb = inject(FormBuilder);
  private readonly modal = inject(ModalService);
  private readonly confirm = inject(ConfirmService);
  private readonly permissions = inject(PermissionsService);
  private readonly router = inject(Router);
  /** crmp C-4: every catalog write is gated on `crm.catalog.manage`. */
  protected readonly canManage = computed(() => this.permissions.can(PERM.crm.catalog.manage));
  /** Lent to the item dialog so it can reach this route's `CatalogAdminStore`. */
  private readonly injector = inject(Injector);
  protected readonly PERM = PERM;

  readonly category = this.store.currentCategory;
  /** Space types for the targeting card — one lookup, shared by every category. */
  private readonly spaceTypes = signal<CrmSpaceType[]>([]);

  readonly attributes = this.store.effectiveAttributes;
  readonly items = this.store.items;

  protected readonly ATTR_TYPE = CatalogAttributeType;

  // Two inline panels share one open slot — see `closePanels()`. 009b #N-10: no attribute
  // or option update/delete/reorder route exists, so only the add panels remain.
  readonly addingAttr = signal(false);
  /** The attribute id whose "add option" row is open, or `null`. */
  readonly addingOptionFor = signal<string | null>(null);
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
        // Sync S9: the category response carries its description and image (009b #34 is closed);
        // an older response without them still starts empty.
        descriptionEn: c.descriptionEn ?? '',
        descriptionAr: c.descriptionAr ?? '',
        imageUri: c.imageUri ?? '',
        selectionMode: String(c.selectionMode),
        isRequired: c.isRequired,
      });
      this.imagePreview.set(c.imageUri ?? '');
    });

    this.form.controls.imageUri.valueChanges.subscribe((v) => this.imagePreview.set(v ?? ''));
    // A read-only view: edits go through the Edit dialog (crmp C-4), which sends only what it shows.
    this.form.disable();

    // crmp C-4: read the options of every Select attribute on screen (#115), once each.
    effect(() => {
      const loaded = this.store.options();
      for (const attr of this.attributes()) {
        if (attr.dataType === CatalogAttributeType.Select && !(attr.id in loaded)) {
          this.store.loadOptions(attr.id);
        }
      }
    });
  }

  /** The options read for this attribute (falls back to whatever the attribute carried). */
  optionsOf(attr: CatalogAttribute): CatalogAttributeOption[] {
    const list = this.store.options()[attr.id] ?? attr.options;
    return [...list].sort((a, b) => a.sortOrder - b.sortOrder);
  }

  /** True when the page's space-type filter tree holds this category. */
  targetedByFilter(category: CatalogCategory): boolean {
    return this.store.spaceTypeResults().some((r) => r.id === category.id);
  }

  // ── crmp C-4: edit / activate / delete ─────────────────────────────

  async edit(kind: CatalogEntryKind, entry: CatalogEntryLike): Promise<void> {
    const data: CatalogEntryDialogData = {
      kind,
      id: entry.id,
      code: entry.code,
      nameEn: entry.nameEn,
      nameAr: entry.nameAr,
      selectionMode: 'selectionMode' in entry ? entry.selectionMode : undefined,
      isRequired: 'isRequired' in entry ? entry.isRequired : undefined,
      isPurchasable: 'isPurchasable' in entry ? entry.isPurchasable : undefined,
      unit: 'unit' in entry ? entry.unit : undefined,
    };
    const saved = await this.modal
      .open<boolean>(CrmCatalogEntryDialogComponent, { size: 'md', data })
      .afterClosed();
    if (saved) this.store.reload();
  }

  toggleActive(kind: CatalogEntryKind, entry: CatalogEntryLike): void {
    const next = !entry.isActive;
    this.store.setActive(
      kind,
      entry.id,
      next,
      this.toastOn(next ? 'cat.activated' : 'cat.deactivated'),
    );
  }

  async remove(kind: CatalogEntryKind, entry: CatalogEntryLike): Promise<void> {
    const ok = await this.confirm.open({
      title: this.catalog.t('cat.delete'),
      body: this.catalog.t('cat.deleteEntryConfirm', { name: this.name(entry) }),
      confirmLabel: this.catalog.t('cat.delete'),
      cancelLabel: this.catalog.t('common.cancel'),
      tone: 'danger',
    });
    if (!ok) return;
    this.store.deleteEntry(kind, entry.id, {
      onDone: () => {
        this.toast.show({ tone: 'success', message: this.catalog.t('cat.entryDeleted') });
        if (kind === 'categories' && entry.id === this.category()?.id) {
          const parentId = 'parentId' in entry ? entry.parentId : null;
          void this.router.navigate([], {
            queryParams: { category: parentId },
            queryParamsHandling: 'merge',
          });
        }
      },
      onError: (err) => {
        if (err.code === 'crm.catalog.InUse') {
          void this.offerDeactivate(kind, entry);
          return;
        }
        this.toast.show({ tone: 'danger', message: friendly(err) });
      },
    });
  }

  /** 409 `crm.catalog.InUse`: the entry is referenced — offer deactivate instead (D4). */
  private async offerDeactivate(kind: CatalogEntryKind, entry: CatalogEntryLike): Promise<void> {
    const ok = await this.confirm.open({
      title: this.catalog.t('cat.inUseTitle'),
      body: this.catalog.t('cat.inUseOffer', { name: this.name(entry) }),
      confirmLabel: this.catalog.t('cat.deactivate'),
      cancelLabel: this.catalog.t('common.cancel'),
    });
    if (ok) this.store.setActive(kind, entry.id, false, this.toastOn('cat.deactivated'));
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
          message: err.code ? friendly(err) : this.catalog.t(domainErrorKey(err.code, fallback)),
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

  mapType(category: CatalogCategory): void {
    const id = this.targetType();
    if (!id) return;
    this.store.mapSpaceType(category.id, id, this.toastOn('cat.nodeSaved'));
    this.targetType.set('');
  }

  /** #116 — 404 `crm.catalog.MappingNotFound` when the category is not targeted to the type. */
  unmapType(category: CatalogCategory): void {
    const id = this.targetType();
    if (!id) return;
    this.store.unmapSpaceType(category.id, id, this.toastOn('cat.nodeSaved'));
    this.targetType.set('');
  }

  /** Only one inline panel is open at a time — stacked forms would be unreadable. */
  private closePanels(): void {
    this.addingAttr.set(false);
    this.addingOptionFor.set(null);
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

/** Any one catalog entry the row actions act on. */
type CatalogEntryLike = CatalogCategory | CatalogItem | CatalogAttribute | CatalogAttributeOption;
