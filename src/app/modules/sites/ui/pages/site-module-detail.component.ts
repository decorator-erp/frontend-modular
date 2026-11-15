import { ChangeDetectionStrategy, Component, computed, inject, signal } from '@angular/core';
import { toSignal } from '@angular/core/rxjs-interop';
import { FormsModule } from '@angular/forms';
import { ActivatedRoute, Router, RouterLink } from '@angular/router';
import { type Observable, map } from 'rxjs';
import {
  ConfirmService,
  ModalService,
  PeraAlertComponent,
  PeraBadgeComponent,
  PeraButtonComponent,
  PeraCardComponent,
  PeraCheckboxComponent,
  PeraEmptyComponent,
  PeraFormFieldComponent,
  PeraInputComponent,
  PeraSelectComponent,
  PeraSkeletonComponent,
  type SelectOption,
} from '@ds';
import { ToastService } from '@platform/feedback/toast.service';
import { CatalogService } from '@platform/i18n/catalog.service';
import type { CatalogKey } from '@platform/i18n/catalog/en';
import { SiteDefinitionService } from '../../data/site-definition.service';
import { SITE_ITEM_DATA_TYPE_LABEL, SiteItemDataType } from '../../model/site-enums';
import type { SiteModule, SiteSchemaField } from '../../model/site-definition.model';
import { localName } from '../../model/site-normalize';
import { SiteDefinitionsStore } from '../../stores/site-definitions.store';
import { SiteDefFormDialogComponent } from '../definitions/site-def-form-dialog.component';
import { attachForm, moduleForm } from '../definitions/site-def-forms';

/**
 * sites S-10: `/admin/site-definitions/modules/:moduleId` (prototype `sites.js:799-884`). Header with
 * Edit (D4; a system module's names are locked), Activate/Deactivate (D6), Delete (D5). The fields
 * table from the schema (D2): Required / Visible checkboxes (D9 with all three link fields), move
 * up/down (D8 with the full order), Detach (D10, values kept); Attach (D7) of an active, unlinked
 * item. A read-only live preview renders the visible fields with the capture editors' controls. An
 * inactive module has no schema (D2 404s): its fields cannot be listed (DEVIATION-S5).
 */
@Component({
  selector: 'app-site-module-detail',
  changeDetection: ChangeDetectionStrategy.OnPush,
  providers: [SiteDefinitionsStore],
  imports: [
    FormsModule,
    RouterLink,
    PeraAlertComponent,
    PeraBadgeComponent,
    PeraButtonComponent,
    PeraCardComponent,
    PeraCheckboxComponent,
    PeraEmptyComponent,
    PeraFormFieldComponent,
    PeraInputComponent,
    PeraSelectComponent,
    PeraSkeletonComponent,
  ],
  template: `
    @if (store.error(); as message) {
      <div class="px-4 md:px-6 lg:px-8 py-6">
        <pera-alert tone="danger" data-module-error>
          {{ message }}
          <pera-button variant="secondary" size="sm" (click)="reload()">{{
            t('sv.retry')
          }}</pera-button>
        </pera-alert>
      </div>
    } @else if (store.modules() === null) {
      <div class="px-4 md:px-6 lg:px-8 py-6 flex flex-col gap-3" aria-busy="true">
        <pera-skeleton [height]="40" width="30%" />
        <pera-skeleton [height]="240" />
      </div>
    } @else if (!module()) {
      <div class="px-4 md:px-6 lg:px-8 py-10" data-not-found>
        <pera-empty [title]="t('sv.moduleNotFound')" iconName="alert-circle" [cta]="backCta()" />
      </div>
    } @else if (module(); as m) {
      <header class="bg-surface border-b border-border px-4 md:px-6 lg:px-8 pt-7 pb-5">
        <a class="fs-label text-accent underline" [routerLink]="['/admin/site-definitions']">{{
          t('sv.backToDefs')
        }}</a>
        <div class="flex items-start justify-between gap-6 flex-wrap mt-2">
          <div class="flex flex-col gap-2">
            <h1 class="m-0 font-semibold fs-h1">
              {{ name(m) }} <span class="fs-label text-text-muted" dir="ltr">{{ m.code }}</span>
            </h1>
            <div class="flex items-center gap-2 flex-wrap fs-body-sm text-text-secondary">
              <span dir="auto">{{ description(m) }}</span>
              @if (m.isSystem) {
                <pera-badge tone="neutral" data-system>{{ t('sv.system') }}</pera-badge>
              }
              @if (!m.isActive) {
                <pera-badge tone="neutral" data-inactive>{{ t('sv.inactive') }}</pera-badge>
              }
            </div>
          </div>
          <div class="flex items-center gap-2 flex-wrap" data-actions>
            <pera-button
              iconStart="pencil"
              [disabled]="store.busy()"
              (click)="edit(m)"
              data-act="edit"
            >
              {{ t('sv.edit') }}
            </pera-button>
            <pera-button [disabled]="store.busy()" (click)="toggleActive(m)" data-act="active">
              {{ t(m.isActive ? 'sv.deactivate' : 'sv.activate') }}
            </pera-button>
            <pera-button
              variant="danger"
              iconStart="trash"
              [disabled]="store.busy()"
              (click)="remove(m)"
              data-act="delete"
            >
              {{ t('sv.delete') }}
            </pera-button>
          </div>
        </div>
      </header>

      <div class="px-4 md:px-6 lg:px-8 py-6 grid gap-4 lg:grid-cols-3">
        <div class="lg:col-span-2 flex flex-col gap-4">
          @if (actionError(); as message) {
            <pera-alert tone="danger" data-action-error>{{ message }}</pera-alert>
          }
          <pera-card padding="none">
            <div class="flex items-start justify-between gap-3 p-4 border-b border-border">
              <div>
                <h2 class="m-0 fs-body font-semibold">{{ t('sv.formFields') }}</h2>
                <p class="m-0 mt-1 fs-label text-text-secondary">{{ t('sv.formFieldsSub') }}</p>
              </div>
              @if (fields()) {
                <pera-button
                  size="sm"
                  variant="primary"
                  iconStart="plus"
                  [disabled]="store.busy()"
                  (click)="attach(m)"
                  data-attach
                >
                  {{ t('sv.attachItem') }}
                </pera-button>
              }
            </div>
            @if (store.schema() === 'inactive') {
              <div class="p-4">
                <pera-alert tone="warning" data-module-inactive>{{
                  t('sv.moduleInactiveFields')
                }}</pera-alert>
              </div>
            } @else if (fields() === null) {
              <div class="p-4 flex flex-col gap-2" aria-busy="true">
                <pera-skeleton [height]="32" />
                <pera-skeleton [height]="32" />
              </div>
            } @else if (fields()!.length === 0) {
              <div class="p-4"><pera-empty [title]="t('sv.noFields')" /></div>
            } @else {
              <div class="overflow-x-auto">
                <table class="w-full fs-body-sm border-collapse" data-fields>
                  <thead>
                    <tr class="fs-micro uppercase text-text-muted border-b border-border">
                      <th class="text-start p-2">#</th>
                      <th class="text-start p-2">{{ t('sv.code') }}</th>
                      <th class="text-start p-2">{{ t('sv.name') }}</th>
                      <th class="text-start p-2">{{ t('sv.dataType') }}</th>
                      <th class="p-2">
                        <span class="sr-only">{{ t('sv.required') }}</span>
                      </th>
                      <th class="p-2">
                        <span class="sr-only">{{ t('sv.visible') }}</span>
                      </th>
                      <th class="p-2">
                        <span class="sr-only">{{ t('sv.more') }}</span>
                      </th>
                    </tr>
                  </thead>
                  <tbody>
                    @for (f of fields(); track f.itemId; let i = $index, last = $last) {
                      <tr class="border-b border-border" [attr.data-field]="f.code">
                        <td class="p-2 text-text-muted">{{ i + 1 }}</td>
                        <td class="p-2 font-semibold" dir="ltr">{{ f.code }}</td>
                        <td class="p-2" dir="auto">{{ name(f) }}</td>
                        <td class="p-2">
                          <pera-badge tone="info">{{ t(typeKey(f.dataType)) }}</pera-badge>
                        </td>
                        <td class="p-2">
                          <pera-checkbox
                            [disabled]="store.busy()"
                            [ngModel]="f.isRequired"
                            (ngModelChange)="setFlag(m, f, 'isRequired', $event)"
                            data-flag="required"
                            >{{ t('sv.required') }}</pera-checkbox
                          >
                        </td>
                        <td class="p-2">
                          <pera-checkbox
                            [disabled]="store.busy()"
                            [ngModel]="f.isVisible"
                            (ngModelChange)="setFlag(m, f, 'isVisible', $event)"
                            data-flag="visible"
                            >{{ t('sv.visible') }}</pera-checkbox
                          >
                        </td>
                        <td class="p-2">
                          <div class="flex items-center gap-1">
                            <pera-button
                              size="xs"
                              variant="ghost"
                              iconStart="arrow-up"
                              [iconOnly]="true"
                              [disabled]="i === 0 || store.busy()"
                              [attr.aria-label]="t('sv.moveUp')"
                              (click)="move(m, i, -1)"
                              data-move="up"
                            />
                            <pera-button
                              size="xs"
                              variant="ghost"
                              iconStart="arrow-down"
                              [iconOnly]="true"
                              [disabled]="last || store.busy()"
                              [attr.aria-label]="t('sv.moveDown')"
                              (click)="move(m, i, 1)"
                              data-move="down"
                            />
                            <pera-button
                              size="xs"
                              variant="ghost"
                              iconStart="x"
                              [iconOnly]="true"
                              [disabled]="store.busy()"
                              [attr.aria-label]="t('sv.detach')"
                              (click)="detach(m, f)"
                              data-detach
                            />
                          </div>
                        </td>
                      </tr>
                    }
                  </tbody>
                </table>
              </div>
            }
          </pera-card>
          <p class="m-0 fs-label text-text-muted">{{ t('sv.note.detach') }}</p>
        </div>

        <pera-card>
          <h2 class="m-0 fs-body font-semibold">{{ t('sv.preview') }}</h2>
          <p class="m-0 mt-1 mb-4 fs-label text-text-secondary">{{ t('sv.previewSub') }}</p>
          <div class="flex flex-col gap-3" data-preview>
            @for (f of preview(); track f.itemId) {
              <pera-form-field
                [label]="fieldLabel(f)"
                [required]="f.isRequired"
                [attr.data-preview-field]="f.code"
              >
                @switch (f.dataType) {
                  @case (types.Select) {
                    <pera-select
                      [options]="optionsOf(f)"
                      placeholder="—"
                      [disabled]="true"
                      [ngModel]="null"
                    />
                  }
                  @case (types.Bool) {
                    <pera-checkbox [disabled]="true" [ngModel]="false">{{
                      t('sv.yes')
                    }}</pera-checkbox>
                  }
                  @default {
                    <pera-input
                      size="sm"
                      [type]="f.dataType === types.Number ? 'number' : 'text'"
                      [placeholder]="t(typeKey(f.dataType))"
                      [disabled]="true"
                      [ngModel]="null"
                    />
                  }
                }
              </pera-form-field>
            } @empty {
              <span class="fs-label text-text-muted">{{ t('sv.noFields') }}</span>
            }
          </div>
        </pera-card>
      </div>
    }
  `,
})
export class SiteModuleDetailComponent {
  protected readonly store = inject(SiteDefinitionsStore);
  private readonly api = inject(SiteDefinitionService);
  private readonly route = inject(ActivatedRoute);
  private readonly router = inject(Router);
  private readonly modal = inject(ModalService);
  private readonly confirm = inject(ConfirmService);
  private readonly toast = inject(ToastService);
  private readonly catalog = inject(CatalogService);

  protected readonly types = SiteItemDataType;
  private readonly moduleId = toSignal(
    this.route.paramMap.pipe(map((p) => p.get('moduleId') ?? '')),
    {
      initialValue: '',
    },
  );
  private readonly lastError = signal<string | null>(null);
  protected readonly actionError = this.lastError.asReadonly();

  protected readonly module = computed(
    () => this.store.modules()?.find((m) => m.id === this.moduleId()) ?? null,
  );
  /** The linked fields in form order; null while loading or when the module is inactive. */
  protected readonly fields = computed<SiteSchemaField[] | null>(() => {
    const s = this.store.schema();
    if (!s || s === 'inactive') return null;
    return [...s.fields].sort((a, b) => a.sortOrder - b.sortOrder);
  });
  protected readonly preview = computed(() => (this.fields() ?? []).filter((f) => f.isVisible));

  protected readonly backCta = computed(() => ({
    label: this.catalog.t('sv.backToDefs'),
    action: () => void this.router.navigate(['/admin/site-definitions']),
  }));

  private readonly tt = (k: CatalogKey, p?: Record<string, string | number>) => this.t(k, p);

  constructor() {
    this.route.paramMap
      .pipe(map((p) => p.get('moduleId') ?? ''))
      .subscribe((id) => id && this.store.loadModule(id));
  }

  protected reload(): void {
    const id = this.moduleId();
    if (id) this.store.loadModule(id);
  }

  protected t(key: CatalogKey, params?: Record<string, string | number>): string {
    return this.catalog.t(key, params);
  }

  protected name(o: { nameEn: string; nameAr: string }): string {
    return localName(o, this.catalog.locale());
  }

  protected description(m: SiteModule): string {
    return (
      (this.catalog.locale() === 'ar'
        ? m.descriptionAr || m.descriptionEn
        : m.descriptionEn || m.descriptionAr) ?? ''
    );
  }

  protected typeKey(d: number): CatalogKey {
    return SITE_ITEM_DATA_TYPE_LABEL[d] ?? 'sv.none';
  }

  protected fieldLabel(f: SiteSchemaField): string {
    return f.unit ? `${this.name(f)} (${f.unit})` : this.name(f);
  }

  protected optionsOf(f: SiteSchemaField): SelectOption[] {
    return f.options
      .filter((o) => o.isActive)
      .sort((a, b) => a.sortOrder - b.sortOrder)
      .map((o) => ({ value: o.id, label: this.name(o) }));
  }

  private async write<T>(
    call: () => Observable<T>,
    successKey: CatalogKey | null,
    after?: (v: T) => void,
  ): Promise<boolean> {
    this.lastError.set(null);
    const out = await this.store.run(call, successKey, after ?? (() => this.reload()));
    if (!out.ok && out.message) this.lastError.set(out.message);
    return out.ok;
  }

  protected edit(m: SiteModule): void {
    this.modal.open(SiteDefFormDialogComponent, {
      size: 'lg',
      data: moduleForm(this.tt, m, m.sortOrder, (req) =>
        this.store.run(
          () =>
            this.api.updateModule(m.id, {
              // System modules keep their names (SystemDefinitionNotRenameable): the inputs are locked.
              nameEn: m.isSystem ? m.nameEn : req.nameEn,
              nameAr: m.isSystem ? m.nameAr : req.nameAr,
              descriptionEn: req.descriptionEn ?? null,
              descriptionAr: req.descriptionAr ?? null,
              sortOrder: req.sortOrder ?? m.sortOrder,
            }),
          'sv.saved',
          () => this.reload(),
        ),
      ),
    });
  }

  protected toggleActive(m: SiteModule): void {
    void this.write(
      () => this.api.setModuleActive(m.id, !m.isActive),
      m.isActive ? 'sv.deactivated' : 'sv.activated',
    );
  }

  protected async remove(m: SiteModule): Promise<void> {
    const ok = await this.confirm.open({
      title: this.t('sv.deleteModuleQ', { c: m.code }),
      body: this.t('sv.deleteDefBody'),
      confirmLabel: this.t('sv.delete'),
      cancelLabel: this.t('sv.cancel'),
      tone: 'danger',
    });
    if (!ok) return;
    // SystemModuleNotDeletable / ModuleInUse come back as the inline message.
    await this.write(
      () => this.api.deleteModule(m.id),
      null,
      () => {
        this.toast.show({ tone: 'success', message: this.t('sv.deleted', { c: m.code }) });
        void this.router.navigate(['/admin/site-definitions']);
      },
    );
  }

  /** D9 sends all three link fields. */
  protected setFlag(
    m: SiteModule,
    f: SiteSchemaField,
    flag: 'isRequired' | 'isVisible',
    value: boolean,
  ): void {
    void this.write(
      () =>
        this.api.updateLink(m.id, f.itemId, {
          isRequired: flag === 'isRequired' ? !!value : f.isRequired,
          isVisible: flag === 'isVisible' ? !!value : f.isVisible,
          sortOrder: f.sortOrder,
        }),
      'sv.saved',
    );
  }

  /** D8 with the FULL order after the swap (`sortOrder` = position + 1). */
  protected move(m: SiteModule, index: number, delta: number): void {
    const list = [...(this.fields() ?? [])];
    const j = index + delta;
    if (j < 0 || j >= list.length) return;
    [list[index], list[j]] = [list[j], list[index]];
    void this.write(
      () =>
        this.api.reorderItems(
          m.id,
          list.map((f, k) => ({ itemId: f.itemId, sortOrder: k + 1 })),
        ),
      'sv.reordered',
    );
  }

  protected async detach(m: SiteModule, f: SiteSchemaField): Promise<void> {
    const ok = await this.confirm.open({
      title: this.t('sv.detachQ', { c: f.code }),
      body: this.t('sv.detachBody'),
      confirmLabel: this.t('sv.detach'),
      cancelLabel: this.t('sv.cancel'),
    });
    if (!ok) return;
    await this.write(() => this.api.detachItem(m.id, f.itemId), 'sv.detached');
  }

  protected attach(m: SiteModule): void {
    const linked = new Set((this.fields() ?? []).map((f) => f.itemId));
    const locale = this.catalog.locale();
    const choices: SelectOption[] = (this.store.items() ?? [])
      .filter((i) => i.isActive && !linked.has(i.id))
      .map((i) => ({
        value: i.id,
        label: `${i.code} · ${localName(i, locale)} (${this.t(this.typeKey(i.dataType))})`,
      }));
    const next = (this.fields() ?? []).length + 1;
    this.modal.open(SiteDefFormDialogComponent, {
      size: 'lg',
      data: attachForm(this.tt, m.code, choices, (v) =>
        this.store.run(
          () => this.api.attachItem(m.id, { ...v, sortOrder: next }),
          'sv.attached',
          () => this.reload(),
        ),
      ),
    });
  }
}
