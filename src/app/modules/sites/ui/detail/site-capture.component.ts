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
import { ActivatedRoute, Router } from '@angular/router';
import {
  PeraAlertComponent,
  PeraButtonComponent,
  PeraCardComponent,
  PeraDateInputComponent,
  PeraEmptyComponent,
  PeraInputComponent,
  PeraSelectComponent,
  PeraSkeletonComponent,
  PeraTabsComponent,
  type SelectOption,
  type TabDef,
} from '@ds';
import { CatalogService } from '@platform/i18n/catalog.service';
import type { CatalogKey } from '@platform/i18n/catalog/en';
import { formatCairoDate } from '@platform/i18n/intl-locale';
import { SiteItemDataType } from '../../model/site-enums';
import type { SiteSchemaField } from '../../model/site-definition.model';
import type { DraftRow } from '../../model/site-grid';
import { localName } from '../../model/site-normalize';
import { siteQuery } from '../../model/site-url';
import type { CellValue } from '../../model/site-validation';
import type { SitePivotCell, SitePivotRow } from '../../model/site.model';
import { SiteCaptureStore } from '../../stores/site-capture.store';
import { SiteDetailStore } from '../../stores/site-detail.store';

/**
 * sites S-5: the capture tab (prototype `captureTab`, `sites.js:479-614`): module sub-tabs from the
 * active modules with record counts (`&m=` selects), then one grid. Read view from the pivot; edit
 * view (Editor, Draft/Rejected, open project) with typed editors, add / duplicate / remove rows and
 * ONE save. Hidden fields are never shown (their stored values are resent, DEVIATION-17).
 */
@Component({
  selector: 'app-site-capture',
  changeDetection: ChangeDetectionStrategy.OnPush,
  providers: [SiteCaptureStore],
  imports: [
    FormsModule,
    PeraAlertComponent,
    PeraButtonComponent,
    PeraCardComponent,
    PeraDateInputComponent,
    PeraEmptyComponent,
    PeraInputComponent,
    PeraSelectComponent,
    PeraSkeletonComponent,
    PeraTabsComponent,
  ],
  template: `
    @if (detail.modulesLoaded() && modules().length === 0) {
      <pera-empty [title]="t('sv.noModules')" iconName="inbox" />
    } @else {
      <div class="flex flex-col gap-4">
        <pera-tabs
          variant="pill"
          [tabs]="moduleTabs()"
          [activeId]="store.module()?.id ?? ''"
          (activeChange)="selectModule($event)"
          data-module-tabs
        />

        @if (store.module(); as m) {
          <pera-card padding="none">
            <div class="flex items-start justify-between gap-3 p-4 border-b border-border">
              <div>
                <h2 class="m-0 fs-body font-semibold">
                  {{ name(m) }} <span class="fs-label text-text-muted" dir="ltr">{{ m.code }}</span>
                </h2>
                <p class="m-0 mt-1 fs-label text-text-secondary" data-card-sub>
                  {{ description(m) }}
                  @if (store.hidden().length) {
                    <span> · {{ t('sv.hiddenFields', { n: store.hidden().length }) }}</span>
                  }
                </p>
              </div>
              <div class="flex items-center gap-2 flex-wrap">
                @if (editing()) {
                  <pera-button size="sm" iconStart="plus" (click)="store.addRow()" data-add-row>
                    {{ t('sv.addRow') }}
                  </pera-button>
                  <pera-button
                    size="sm"
                    variant="ghost"
                    [disabled]="store.saving()"
                    (click)="store.cancel()"
                    data-cancel
                  >
                    {{ t('sv.cancel') }}
                  </pera-button>
                  <pera-button
                    size="sm"
                    variant="primary"
                    iconStart="check"
                    [loading]="store.saving()"
                    [disabled]="store.saving()"
                    (click)="store.save()"
                    data-save
                    >{{ t('sv.saveGrid') }}</pera-button
                  >
                } @else if (canEdit() && store.rows().length) {
                  <pera-button
                    size="sm"
                    variant="primary"
                    iconStart="pencil"
                    (click)="store.startEdit()"
                    data-edit-grid
                  >
                    {{ t('sv.editGrid') }}
                  </pera-button>
                }
              </div>
            </div>

            <div class="flex flex-col gap-2 px-4 pt-3 empty:hidden">
              @if (editing() && store.spacesUnavailable()) {
                <pera-alert tone="info" data-spaces-unavailable>{{
                  t('sv.spacesUnavailable')
                }}</pera-alert>
              }
              @if (editing() && store.catalogUnavailable()) {
                <pera-alert tone="info" data-catalog-unavailable>{{
                  t('sv.catalogUnavailable')
                }}</pera-alert>
              }
              @if (editing() && store.unreadableHidden()) {
                <pera-alert tone="warning" data-hidden-unreadable>{{
                  t('sv.hiddenUnreadable', { n: store.unreadableHidden() })
                }}</pera-alert>
              }
              @if (store.banner(); as message) {
                <pera-alert tone="danger" data-grid-banner>{{ message }}</pera-alert>
              }
            </div>

            @if (store.moduleGone()) {
              <div class="p-4">
                <pera-alert tone="warning" data-module-gone>{{ t('sv.moduleGone') }}</pera-alert>
              </div>
            } @else if (store.error(); as message) {
              <div class="p-4">
                <pera-alert tone="danger" data-grid-error>
                  {{ message }}
                  <pera-button variant="secondary" size="sm" (click)="store.load()">{{
                    t('sv.retry')
                  }}</pera-button>
                </pera-alert>
              </div>
            } @else if (store.loading() && !store.pivot()) {
              <div class="p-4 flex flex-col gap-2" aria-busy="true">
                <pera-skeleton [height]="32" />
                <pera-skeleton [height]="32" />
                <pera-skeleton [height]="32" />
              </div>
            } @else if (editing()) {
              <div class="overflow-x-auto">
                <table class="w-full fs-body-sm border-collapse" data-grid="edit">
                  <thead>
                    <tr
                      class="text-start fs-micro uppercase text-text-muted border-b border-border"
                    >
                      <th class="text-start p-2">{{ t('sv.label') }} *</th>
                      <th class="text-start p-2">{{ t('sv.space') }}</th>
                      @for (f of store.visible(); track f.itemId) {
                        <th class="text-start p-2" [attr.data-col]="f.code">
                          {{ fieldLabel(f) }}{{ f.isRequired ? ' *' : '' }}
                        </th>
                      }
                      <th class="text-start p-2">{{ t('sv.catalogItem') }}</th>
                      <th class="text-start p-2">{{ t('sv.note') }}</th>
                      <th class="p-2"></th>
                    </tr>
                  </thead>
                  <tbody>
                    @for (row of store.draft(); track row.key; let i = $index) {
                      <tr
                        class="border-b border-border align-top"
                        [class.bg-info-soft]="!row.recordId"
                        [attr.data-row]="i"
                      >
                        <td class="p-2 min-w-28">
                          <pera-input
                            size="sm"
                            dir="auto"
                            [ngModel]="row.label"
                            (ngModelChange)="store.setLabel(row.key, $event)"
                            [error]="err(row, 'label')"
                            data-cell="label"
                          />
                          @if (err(row, 'label'); as e) {
                            <div class="fs-label text-danger mt-1" data-cell-error="label">
                              {{ e }}
                            </div>
                          }
                        </td>
                        <td class="p-2 min-w-36">
                          <pera-select
                            size="sm"
                            [options]="spaceOptions(row)"
                            [ngModel]="row.spaceId"
                            (ngModelChange)="store.setSpace(row.key, $event)"
                            [error]="err(row, 'space')"
                            data-cell="space"
                          />
                          @if (err(row, 'space'); as e) {
                            <div class="fs-label text-danger mt-1" data-cell-error="space">
                              {{ e }}
                            </div>
                          }
                        </td>
                        @for (f of store.visible(); track f.itemId) {
                          <td class="p-2 min-w-28" [attr.data-cell]="f.code">
                            @switch (f.dataType) {
                              @case (types.Number) {
                                <pera-input
                                  size="sm"
                                  type="number"
                                  dir="ltr"
                                  [ngModel]="row.values[f.itemId] ?? ''"
                                  (ngModelChange)="setNumber(row, f, $event)"
                                  [error]="err(row, f.itemId)"
                                />
                              }
                              @case (types.Bool) {
                                <pera-select
                                  size="sm"
                                  [options]="boolOptions()"
                                  [ngModel]="row.values[f.itemId] ?? null"
                                  (ngModelChange)="store.setValue(row.key, f.itemId, $event)"
                                  [error]="err(row, f.itemId)"
                                />
                              }
                              @case (types.Select) {
                                <pera-select
                                  size="sm"
                                  [options]="optionChoices(f, row.values[f.itemId] ?? null)"
                                  [ngModel]="row.values[f.itemId] ?? null"
                                  (ngModelChange)="store.setValue(row.key, f.itemId, $event)"
                                  [error]="err(row, f.itemId)"
                                />
                              }
                              @case (types.Date) {
                                <pera-date-input
                                  size="sm"
                                  [ngModel]="row.values[f.itemId] ?? ''"
                                  (ngModelChange)="
                                    store.setValue(row.key, f.itemId, $event || null)
                                  "
                                  [error]="err(row, f.itemId)"
                                />
                              }
                              @default {
                                <pera-input
                                  size="sm"
                                  dir="auto"
                                  [ngModel]="row.values[f.itemId] ?? ''"
                                  (ngModelChange)="store.setValue(row.key, f.itemId, $event)"
                                  [error]="err(row, f.itemId)"
                                />
                              }
                            }
                            @if (err(row, f.itemId); as e) {
                              <div
                                class="fs-label text-danger mt-1"
                                [attr.data-cell-error]="f.code"
                              >
                                {{ e }}
                              </div>
                            }
                          </td>
                        }
                        <td class="p-2 min-w-48">
                          @if (store.catalogUnavailable()) {
                            <span class="text-text-muted">—</span>
                          } @else {
                            <div class="flex flex-col gap-1">
                              <pera-select
                                size="sm"
                                [options]="categoryOptions()"
                                [placeholder]="t('sv.catalogCategory')"
                                [ngModel]="categoryOf(row)"
                                (ngModelChange)="pickCategory(row, $event)"
                                data-cell="catalog-category"
                              />
                              <pera-select
                                size="sm"
                                [options]="itemOptions(row)"
                                [ngModel]="row.catalogItemId"
                                (ngModelChange)="store.setCatalogItem(row.key, $event)"
                                [error]="err(row, 'catalog')"
                                data-cell="catalog"
                              />
                            </div>
                          }
                          @if (err(row, 'catalog'); as e) {
                            <div class="fs-label text-danger mt-1" data-cell-error="catalog">
                              {{ e }}
                            </div>
                          }
                        </td>
                        <td class="p-2 min-w-36">
                          <pera-input
                            size="sm"
                            dir="auto"
                            [ngModel]="row.note"
                            (ngModelChange)="store.setNote(row.key, $event)"
                            [error]="err(row, 'note')"
                            data-cell="note"
                          />
                          @if (err(row, 'note'); as e) {
                            <div class="fs-label text-danger mt-1" data-cell-error="note">
                              {{ e }}
                            </div>
                          }
                        </td>
                        <td class="p-2">
                          <div class="flex items-center gap-1">
                            <pera-button
                              size="xs"
                              variant="ghost"
                              (click)="store.duplicate(row.key)"
                              data-duplicate
                            >
                              {{ t('sv.duplicateRow') }}
                            </pera-button>
                            <pera-button
                              size="xs"
                              variant="ghost"
                              iconStart="trash"
                              (click)="store.remove(row.key)"
                              data-remove
                            >
                              {{ t('sv.removeRow') }}
                            </pera-button>
                          </div>
                        </td>
                      </tr>
                    } @empty {
                      <tr>
                        <td [attr.colspan]="store.visible().length + 5" class="p-4">
                          <pera-empty [title]="t('sv.gridEmptyEdit')" />
                        </td>
                      </tr>
                    }
                  </tbody>
                </table>
              </div>
              <p class="m-0 p-4 fs-label text-text-muted">{{ t('sv.gridFoot') }}</p>
            } @else if (store.rows().length === 0) {
              <div class="p-4">
                <pera-empty
                  [title]="t('sv.gridEmpty', { m: name(m) })"
                  [description]="canEdit() ? t('sv.gridEmptySub') : undefined"
                  [cta]="canEdit() ? startCta : undefined"
                  iconName="inbox"
                />
              </div>
            } @else {
              <div class="overflow-x-auto">
                <table class="w-full fs-body-sm border-collapse" data-grid="read">
                  <thead>
                    <tr class="fs-micro uppercase text-text-muted border-b border-border">
                      <th class="text-start p-2">{{ t('sv.label') }}</th>
                      <th class="text-start p-2">{{ t('sv.space') }}</th>
                      @for (f of store.visible(); track f.itemId) {
                        <th class="text-start p-2" [attr.data-col]="f.code">{{ fieldLabel(f) }}</th>
                      }
                      <th class="text-start p-2">{{ t('sv.catalogItem') }}</th>
                      <th class="text-start p-2">{{ t('sv.note') }}</th>
                    </tr>
                  </thead>
                  <tbody>
                    @for (r of store.rows(); track r.recordId) {
                      <tr class="border-b border-border" [attr.data-record]="r.recordId">
                        <td class="p-2 font-semibold" dir="auto">{{ r.label }}</td>
                        <td class="p-2" dir="auto">{{ r.spaceName || t('sv.wholeUnit') }}</td>
                        @for (f of store.visible(); track f.itemId) {
                          <td class="p-2" [attr.data-cell]="f.code">
                            {{ format(f, r.cells[f.code]) }}
                          </td>
                        }
                        <td class="p-2" dir="auto">{{ catalogName(r) }}</td>
                        <td class="p-2 text-text-secondary" dir="auto">{{ r.note }}</td>
                      </tr>
                    }
                  </tbody>
                </table>
              </div>
            }
          </pera-card>
        }
      </div>
    }
  `,
})
export class SiteCaptureComponent {
  protected readonly store = inject(SiteCaptureStore);
  protected readonly detail = inject(SiteDetailStore);
  private readonly catalog = inject(CatalogService);
  private readonly router = inject(Router);
  private readonly route = inject(ActivatedRoute);

  /** `&m=` from the URL; the first module when absent or unknown. */
  readonly moduleId = input<string | null>(null);

  protected readonly types = SiteItemDataType;
  /** Category picked per row (UI only; the row stores the item). */
  private readonly categoryByRow = signal<Record<string, string | null>>({});

  protected readonly modules = computed(() => this.detail.modules());
  protected readonly selected = computed(() => {
    const mods = this.modules();
    return mods.find((m) => m.id === this.moduleId()) ?? mods[0] ?? null;
  });
  protected readonly editing = computed(() => !!this.store.draft() && this.canEdit());
  protected readonly canEdit = computed(() => this.detail.caps().edit);

  protected readonly moduleTabs = computed<TabDef[]>(() => {
    const counts = new Map(
      (this.detail.site()?.recordCounts ?? []).map((c) => [c.moduleId, c.recordCount]),
    );
    this.catalog.locale();
    return this.modules().map((m) => ({
      id: m.id,
      label: `${this.name(m)} ${counts.get(m.id) ?? 0}`,
    }));
  });

  protected readonly startCta = {
    label: this.catalog.t('sv.startCapture'),
    action: () => this.store.startEdit(),
  };

  protected readonly boolOptions = computed<SelectOption[]>(() => {
    this.catalog.locale();
    return [
      { value: null, label: this.t('sv.none') },
      { value: true, label: this.t('sv.yes') },
      { value: false, label: this.t('sv.no') },
    ];
  });

  protected readonly categoryOptions = computed<SelectOption[]>(() => {
    const locale = this.catalog.locale();
    return (this.store.categories() ?? []).map((c) => ({
      value: c.id,
      label: localName(c, locale),
    }));
  });

  constructor() {
    effect(() => {
      const site = this.detail.site();
      const module = this.selected();
      if (!site || !module) return;
      untracked(() => this.store.open(site.id, site.projectId, module));
    });
  }

  protected t(key: CatalogKey, params?: Record<string, string | number>): string {
    return this.catalog.t(key, params);
  }

  protected name(o: { nameEn: string; nameAr: string }): string {
    return localName(o, this.catalog.locale());
  }

  protected description(m: { descriptionEn: string | null; descriptionAr: string | null }): string {
    return (
      (this.catalog.locale() === 'ar'
        ? m.descriptionAr || m.descriptionEn
        : m.descriptionEn || m.descriptionAr) ?? ''
    );
  }

  protected fieldLabel(f: SiteSchemaField): string {
    return f.unit ? `${this.name(f)} (${f.unit})` : this.name(f);
  }

  protected err(row: DraftRow, field: string): string | undefined {
    return this.store.cellErrors()[`${row.key}:${field}`];
  }

  protected selectModule(id: string): void {
    if (id === this.store.module()?.id) return;
    void this.router.navigate([], {
      relativeTo: this.route,
      queryParams: siteQuery('capture', id),
    });
  }

  protected setNumber(row: DraftRow, f: SiteSchemaField, raw: unknown): void {
    const s = raw == null ? '' : String(raw).trim();
    const n = Number(s);
    const value: CellValue = s === '' ? null : Number.isFinite(n) ? n : s;
    this.store.setValue(row.key, f.itemId, value);
  }

  protected spaceOptions(row: DraftRow): SelectOption[] {
    const list = this.store.spaces() ?? [];
    const out: SelectOption[] = [
      { value: null, label: this.t('sv.wholeUnit') },
      ...list.map((s) => ({ value: s.id, label: s.name })),
    ];
    // A stored space not in the list (403, or inactive) stays selectable under its stored name.
    if (row.spaceId && !list.some((s) => s.id === row.spaceId)) {
      out.push({ value: row.spaceId, label: row.spaceName ?? '—' });
    }
    return out;
  }

  /** Active options in order, plus the stored one when it is no longer active. */
  protected optionChoices(f: SiteSchemaField, current: CellValue): SelectOption[] {
    const active = f.options
      .filter((o) => o.isActive || o.id === current)
      .sort((a, b) => a.sortOrder - b.sortOrder)
      .map((o) => ({
        value: o.id,
        label: o.isActive ? this.name(o) : `${this.name(o)} ${this.t('sv.inactiveOption')}`,
      }));
    const out: SelectOption[] = [{ value: null, label: this.t('sv.none') }, ...active];
    if (current && !f.options.some((o) => o.id === current)) {
      out.push({ value: current, label: `— ${this.t('sv.inactiveOption')}` });
    }
    return out;
  }

  protected categoryOf(row: DraftRow): string | null {
    const picked = this.categoryByRow()[row.key];
    if (picked !== undefined) return picked;
    const item = (this.store.catalogItems() ?? []).find((i) => i.id === row.catalogItemId);
    return item?.categoryId ?? null;
  }

  protected pickCategory(row: DraftRow, categoryId: unknown): void {
    const id = typeof categoryId === 'string' ? categoryId : null;
    this.categoryByRow.update((m) => ({ ...m, [row.key]: id }));
    const item = (this.store.catalogItems() ?? []).find((i) => i.id === row.catalogItemId);
    if (item && item.categoryId !== id) this.store.setCatalogItem(row.key, null);
  }

  protected itemOptions(row: DraftRow): SelectOption[] {
    const category = this.categoryOf(row);
    const items = (this.store.catalogItems() ?? []).filter(
      (i) => i.categoryId === category && (i.isActive || i.id === row.catalogItemId),
    );
    return [
      { value: null, label: this.t('sv.none') },
      ...items.map((i) => ({ value: i.id, label: this.name(i) })),
    ];
  }

  protected catalogName(r: SitePivotRow): string {
    const id = this.store.catalogItemOf(r.recordId);
    if (!id) return '—';
    const item = (this.store.catalogItems() ?? []).find((i) => i.id === id);
    return item ? this.name(item) : '—';
  }

  protected format(f: SiteSchemaField, cell: SitePivotCell | null | undefined): string {
    if (!cell) return '—';
    const locale = this.catalog.locale();
    switch (f.dataType) {
      case SiteItemDataType.Number:
        return cell.valueNumber == null
          ? '—'
          : `${new Intl.NumberFormat(locale === 'ar' ? 'ar-EG' : 'en-GB', { maximumFractionDigits: 4 }).format(cell.valueNumber)}${f.unit ? ' ' + f.unit : ''}`;
      case SiteItemDataType.Bool:
        return cell.valueBool == null ? '—' : this.t(cell.valueBool ? 'sv.yes' : 'sv.no');
      case SiteItemDataType.Select:
        return (
          (locale === 'ar'
            ? cell.optionNameAr || cell.optionNameEn
            : cell.optionNameEn || cell.optionNameAr) ?? '—'
        );
      case SiteItemDataType.Date:
        return cell.valueDate ? formatCairoDate(`${cell.valueDate}T12:00:00Z`, locale) : '—';
      default:
        return cell.valueText ?? '—';
    }
  }
}
