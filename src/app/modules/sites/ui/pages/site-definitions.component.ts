import { ChangeDetectionStrategy, Component, computed, inject, signal } from '@angular/core';
import { toSignal } from '@angular/core/rxjs-interop';
import type { Observable } from 'rxjs';
import { FormsModule } from '@angular/forms';
import { ActivatedRoute, Router, RouterLink } from '@angular/router';
import {
  ConfirmService,
  DrawerService,
  ModalService,
  PeraAlertComponent,
  PeraBadgeComponent,
  PeraButtonComponent,
  PeraCardComponent,
  PeraEmptyComponent,
  PeraInputComponent,
  PeraModalRef,
  PeraPageHeaderComponent,
  PeraSkeletonComponent,
  PeraSwitchComponent,
  PeraTabsComponent,
  type TabDef,
} from '@ds';
import { ToastService } from '@platform/feedback/toast.service';
import { CatalogService } from '@platform/i18n/catalog.service';
import type { CatalogKey } from '@platform/i18n/catalog/en';
import { SiteDefinitionService } from '../../data/site-definition.service';
import { SITE_ITEM_DATA_TYPE_LABEL } from '../../model/site-enums';
import type { SiteItem, SiteItemOption, SiteModule } from '../../model/site-definition.model';
import { definitionsQuery, parseDefinitionTab, type DefinitionTab } from '../../model/site-url';
import { SiteDefinitionsStore } from '../../stores/site-definitions.store';
import {
  SiteDefFormDialogComponent,
  type DefFormData,
} from '../definitions/site-def-form-dialog.component';
import {
  editItemForm,
  limitsText,
  moduleForm,
  newItemForm,
  optionForm,
  shapeForm,
} from '../definitions/site-def-forms';
import {
  SiteItemDrawerComponent,
  type SiteItemDrawerData,
} from '../definitions/site-item-drawer.component';

/**
 * sites S-10: `/admin/site-definitions?tab=modules|items` (prototype `sites.js:760-797`). Tabs with
 * counts, client-side search, "Show inactive" (`includeInactive=true`). Modules: sort order, code +
 * System chip, names, fields (from each schema, DEVIATION-S5), status; New module → its page. Items:
 * code + System chip, names, data type + unit, limits, used in / captured (D15 per item), status;
 * New item; a row opens the item drawer.
 */
@Component({
  selector: 'app-site-definitions',
  changeDetection: ChangeDetectionStrategy.OnPush,
  providers: [SiteDefinitionsStore],
  imports: [
    FormsModule,
    RouterLink,
    PeraAlertComponent,
    PeraBadgeComponent,
    PeraButtonComponent,
    PeraCardComponent,
    PeraEmptyComponent,
    PeraInputComponent,
    PeraPageHeaderComponent,
    PeraSkeletonComponent,
    PeraSwitchComponent,
    PeraTabsComponent,
  ],
  template: `
    <pera-page-header [title]="t('sv.navDefs')">
      @if (tab() === 'modules') {
        <pera-button
          actions
          variant="primary"
          iconStart="plus"
          [disabled]="store.busy()"
          (click)="newModule()"
          data-new-module
        >
          {{ t('sv.newModule') }}
        </pera-button>
      } @else {
        <pera-button
          actions
          variant="primary"
          iconStart="plus"
          [disabled]="store.busy()"
          (click)="newItem()"
          data-new-item
        >
          {{ t('sv.newItem') }}
        </pera-button>
      }
    </pera-page-header>

    <div class="px-8 py-6 flex flex-col gap-4">
      <p class="m-0 fs-body-sm text-text-secondary">{{ t('sv.defsSub') }}</p>
      <pera-tabs [tabs]="tabs()" [activeId]="tab()" (activeChange)="go($event)" />
      <div class="flex items-center justify-between gap-4 flex-wrap">
        <div class="w-full sm:w-72">
          <pera-input
            type="search"
            size="sm"
            iconStart="search"
            [placeholder]="t('sv.searchPh')"
            [attr.aria-label]="t('sv.search')"
            [ngModel]="query()"
            (ngModelChange)="query.set($event ?? '')"
            data-search
          />
        </div>
        <div class="inline-flex items-center gap-2 fs-body-sm">
          <pera-switch
            [ngModel]="store.includeInactive()"
            (ngModelChange)="store.setIncludeInactive(!!$event)"
            [attr.aria-label]="t('sv.showInactive')"
            data-inactive
          />
          {{ t('sv.showInactive') }}
        </div>
      </div>

      @if (store.error(); as message) {
        <pera-alert tone="danger" data-defs-error>
          {{ message }}
          <pera-button variant="secondary" size="sm" (click)="store.load()">{{
            t('sv.retry')
          }}</pera-button>
        </pera-alert>
      } @else if (store.modules() === null || store.items() === null) {
        <div class="flex flex-col gap-2" aria-busy="true">
          <pera-skeleton [height]="36" />
          <pera-skeleton [height]="36" />
          <pera-skeleton [height]="36" />
        </div>
      } @else if (tab() === 'modules') {
        <pera-card padding="none">
          <div class="overflow-x-auto">
            <table class="w-full fs-body-sm border-collapse" data-modules>
              <thead>
                <tr class="fs-micro uppercase text-text-muted border-b border-border">
                  <th class="text-start p-2">#</th>
                  <th class="text-start p-2">{{ t('sv.code') }}</th>
                  <th class="text-start p-2">{{ t('sv.name') }}</th>
                  <th class="text-end p-2">{{ t('sv.fieldsCount') }}</th>
                  <th class="text-start p-2">{{ t('sv.status') }}</th>
                </tr>
              </thead>
              <tbody>
                @for (m of modules(); track m.id) {
                  <tr
                    class="border-b border-border hover:bg-surface-muted"
                    [attr.data-module]="m.code"
                  >
                    <td class="p-2 text-text-muted">{{ m.sortOrder }}</td>
                    <td class="p-2">
                      <a
                        class="font-semibold text-accent underline"
                        dir="ltr"
                        [routerLink]="['/admin/site-definitions/modules', m.id]"
                        >{{ m.code }}</a
                      >
                      @if (m.isSystem) {
                        <pera-badge class="ms-2" tone="neutral">{{ t('sv.system') }}</pera-badge>
                      }
                    </td>
                    <td class="p-2">
                      <div>
                        <bdi>{{ m.nameEn }}</bdi>
                      </div>
                      <div class="fs-label text-text-muted">
                        <bdi>{{ m.nameAr }}</bdi>
                      </div>
                    </td>
                    <td class="p-2 text-end" data-fields-count>{{ fieldCount(m) }}</td>
                    <td class="p-2">
                      <pera-badge [tone]="m.isActive ? 'success' : 'neutral'" [dot]="true">{{
                        t(m.isActive ? 'sv.active' : 'sv.inactive')
                      }}</pera-badge>
                    </td>
                  </tr>
                } @empty {
                  <tr>
                    <td colspan="5" class="p-4"><pera-empty [title]="t('sv.noDefModules')" /></td>
                  </tr>
                }
              </tbody>
            </table>
          </div>
        </pera-card>
      } @else {
        <pera-card padding="none">
          <div class="overflow-x-auto">
            <table class="w-full fs-body-sm border-collapse" data-items>
              <thead>
                <tr class="fs-micro uppercase text-text-muted border-b border-border">
                  <th class="text-start p-2">{{ t('sv.code') }}</th>
                  <th class="text-start p-2">{{ t('sv.name') }}</th>
                  <th class="text-start p-2">{{ t('sv.dataType') }}</th>
                  <th class="text-start p-2">{{ t('sv.limits') }}</th>
                  <th class="text-start p-2">{{ t('sv.usedIn') }}</th>
                  <th class="text-end p-2">{{ t('sv.captured') }}</th>
                  <th class="text-start p-2">{{ t('sv.status') }}</th>
                </tr>
              </thead>
              <tbody>
                @for (i of items(); track i.id) {
                  <tr
                    class="border-b border-border hover:bg-surface-muted"
                    [attr.data-item]="i.code"
                  >
                    <td class="p-2">
                      <button
                        type="button"
                        class="font-semibold text-accent underline cursor-pointer bg-transparent border-0 p-0"
                        dir="ltr"
                        (click)="openItem(i)"
                        data-open-item
                      >
                        {{ i.code }}
                      </button>
                      @if (i.isSystem) {
                        <pera-badge class="ms-2" tone="neutral">{{ t('sv.system') }}</pera-badge>
                      }
                    </td>
                    <td class="p-2">
                      <div>
                        <bdi>{{ i.nameEn }}</bdi>
                      </div>
                      <div class="fs-label text-text-muted">
                        <bdi>{{ i.nameAr }}</bdi>
                      </div>
                    </td>
                    <td class="p-2">
                      <pera-badge tone="info">{{ t(typeKey(i.dataType)) }}</pera-badge>
                      @if (i.unit) {
                        <span class="ms-1 fs-label text-text-muted" dir="ltr">{{ i.unit }}</span>
                      }
                    </td>
                    <td class="p-2 fs-label text-text-secondary" dir="ltr" data-limits>
                      {{ limits(i) }}
                    </td>
                    <td class="p-2 fs-label" dir="ltr" data-used-in>{{ usedIn(i) }}</td>
                    <td class="p-2 text-end" data-captured>{{ captured(i) }}</td>
                    <td class="p-2">
                      <pera-badge [tone]="i.isActive ? 'success' : 'neutral'" [dot]="true">{{
                        t(i.isActive ? 'sv.active' : 'sv.inactive')
                      }}</pera-badge>
                    </td>
                  </tr>
                } @empty {
                  <tr>
                    <td colspan="7" class="p-4"><pera-empty [title]="t('sv.noDefItems')" /></td>
                  </tr>
                }
              </tbody>
            </table>
          </div>
        </pera-card>
      }
      <p class="m-0 fs-label text-text-muted">{{ t('sv.note.defs') }}</p>
    </div>
  `,
})
export class SiteDefinitionsComponent {
  protected readonly store = inject(SiteDefinitionsStore);
  private readonly api = inject(SiteDefinitionService);
  private readonly route = inject(ActivatedRoute);
  private readonly router = inject(Router);
  private readonly modal = inject(ModalService);
  private readonly drawer = inject(DrawerService);
  private readonly confirm = inject(ConfirmService);
  private readonly toast = inject(ToastService);
  private readonly catalog = inject(CatalogService);

  private readonly params = toSignal(this.route.queryParamMap, {
    initialValue: this.route.snapshot.queryParamMap,
  });
  protected readonly tab = computed<DefinitionTab>(() =>
    parseDefinitionTab(this.params().get('tab')),
  );
  protected readonly query = signal('');

  private match(o: { code: string; nameEn: string; nameAr: string }): boolean {
    const q = this.query().trim().toLowerCase();
    return !q || `${o.code} ${o.nameEn} ${o.nameAr}`.toLowerCase().includes(q);
  }

  protected readonly modules = computed(() =>
    (this.store.modules() ?? []).filter((m) => this.match(m)),
  );
  protected readonly items = computed(() =>
    (this.store.items() ?? []).filter((i) => this.match(i)),
  );

  protected readonly tabs = computed<TabDef[]>(() => {
    this.catalog.locale();
    return [
      {
        id: 'modules',
        label: `${this.t('sv.modules')} ${this.store.modules()?.length ?? ''}`.trim(),
      },
      { id: 'items', label: `${this.t('sv.items')} ${this.store.items()?.length ?? ''}`.trim() },
    ];
  });

  constructor() {
    this.store.load();
  }

  protected t(key: CatalogKey, params?: Record<string, string | number>): string {
    return this.catalog.t(key, params);
  }

  protected typeKey(d: number): CatalogKey {
    return SITE_ITEM_DATA_TYPE_LABEL[d] ?? 'sv.none';
  }

  protected limits(i: SiteItem): string {
    return limitsText(i, (k, p) => this.t(k, p));
  }

  protected fieldCount(m: SiteModule): string {
    const n = this.store.fieldCounts()[m.id];
    return n == null ? '—' : String(n);
  }

  /** Active links only, by module code (D15; detached links are listed in the drawer). */
  protected usedIn(i: SiteItem): string {
    const u = this.store.usage()[i.id];
    if (!u) return '—';
    return (
      u.modules
        .filter((m) => m.isActive)
        .map((m) => m.code)
        .join(', ') || '—'
    );
  }

  protected captured(i: SiteItem): string {
    const u = this.store.usage()[i.id];
    return u ? String(u.capturedValueCount) : '—';
  }

  protected go(tab: string): void {
    void this.router.navigate([], {
      relativeTo: this.route,
      queryParams: definitionsQuery(parseDefinitionTab(tab)),
    });
  }

  private openForm(data: DefFormData): void {
    this.modal.open(SiteDefFormDialogComponent, { size: 'lg', data });
  }

  private drawerRef: PeraModalRef<unknown> | null = null;

  private readonly tt = (k: CatalogKey, p?: Record<string, string | number>) => this.t(k, p);

  protected newModule(): void {
    const next = (this.store.modules() ?? []).reduce((n, m) => Math.max(n, m.sortOrder), 0) + 1;
    this.openForm(
      moduleForm(this.tt, null, next, (req) =>
        this.store.run(
          () => this.api.createModule(req),
          null,
          (id) => {
            this.toast.show({
              tone: 'success',
              message: this.t('sv.createdToast', { c: req.code }),
            });
            void this.router.navigate(['/admin/site-definitions/modules', id]);
          },
        ),
      ),
    );
  }

  protected newItem(): void {
    this.openForm(
      newItemForm(this.tt, (req) =>
        this.store.run(
          () => this.api.createItem(req),
          null,
          (id) => {
            this.toast.show({
              tone: 'success',
              message: this.t('sv.createdToast', { c: req.code }),
            });
            this.store.load();
            this.openItemById(id);
          },
        ),
      ),
    );
  }

  protected openItem(i: SiteItem): void {
    this.store.refreshUsage(i.id);
    this.openItemById(i.id);
  }

  private openItemById(itemId: string): void {
    const data: SiteItemDrawerData = {
      itemId,
      store: this.store,
      edit: (i) => this.editItem(i),
      shape: (i) => this.shapeItem(i),
      toggleActive: (i) =>
        void this.toggle(() => this.api.setItemActive(i.id, !i.isActive), i.isActive),
      remove: (i) => void this.removeItem(i),
      addOption: (i) => this.optionDialog(i, null),
      editOption: (i, o) => this.optionDialog(i, o),
      toggleOption: (_i, o) =>
        void this.toggle(() => this.api.setOptionActive(o.id, !o.isActive), o.isActive),
    };
    this.drawerRef = this.drawer.open(SiteItemDrawerComponent, { data });
  }

  private editItem(i: SiteItem): void {
    this.openForm(
      editItemForm(this.tt, i, (req) =>
        this.store.run(() => this.api.updateItem(i.id, req), 'sv.saved'),
      ),
    );
  }

  private shapeItem(i: SiteItem): void {
    const captured = !!this.store.usage()[i.id]?.hasCapturedValues;
    this.openForm(
      shapeForm(this.tt, i, captured, (req) =>
        this.store.run(
          () => this.api.changeShape(i.id, req),
          'sv.saved',
          () => {
            this.store.load();
          },
        ),
      ),
    );
  }

  private optionDialog(i: SiteItem, o: SiteItemOption | null): void {
    this.openForm(
      optionForm(this.tt, i, o, (v) =>
        o
          ? this.store.run(
              () =>
                this.api.updateOption(o.id, {
                  nameEn: v.nameEn,
                  nameAr: v.nameAr,
                  sortOrder: v.sortOrder,
                }),
              'sv.saved',
            )
          : this.store.run(() => this.api.addOption(i.id, v), 'sv.saved'),
      ),
    );
  }

  /** A5: activate/deactivate an item or option; a refusal shows its catalog message. */
  private async toggle(call: () => Observable<void>, wasActive: boolean): Promise<void> {
    const out = await this.store.run(call, wasActive ? 'sv.deactivated' : 'sv.activated');
    if (!out.ok && out.message) this.toast.show({ tone: 'warning', message: out.message });
  }

  private async removeItem(i: SiteItem): Promise<void> {
    const ok = await this.confirm.open({
      title: this.t('sv.deleteItemQ', { c: i.code }),
      body: this.t('sv.deleteDefBody'),
      confirmLabel: this.t('sv.delete'),
      cancelLabel: this.t('sv.cancel'),
      tone: 'danger',
    });
    if (!ok) return;
    const out = await this.store.run(
      () => this.api.deleteItem(i.id),
      null,
      () => {
        this.toast.show({ tone: 'success', message: this.t('sv.deleted', { c: i.code }) });
        this.drawerRef?.close();
        this.store.load();
      },
    );
    // SystemItemNotDeletable / ItemInUse: the catalog message (offer deactivate instead).
    if (!out.ok && out.message) this.toast.show({ tone: 'warning', message: out.message });
  }
}
