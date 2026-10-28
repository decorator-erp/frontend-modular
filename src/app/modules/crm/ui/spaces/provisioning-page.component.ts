import {
  ChangeDetectionStrategy,
  Component,
  computed,
  inject,
  signal,
  TemplateRef,
  viewChild,
} from '@angular/core';
import { ActivatedRoute } from '@angular/router';
import { CatalogService } from '@platform/i18n/catalog.service';
import { CrmProvisionStatus } from '../../model/crm-enums';
import type { ProvisionGroup } from '../../model';
import {
  ColumnDef,
  PeraAlertComponent,
  PeraDataTableComponent,
  PeraKpiTileComponent,
  PeraPageHeaderComponent,
  PeraTabsComponent,
  TabDef,
} from '@ds';
import { SpacesStore } from '../../stores/spaces.store';
import { PROVISION_STATUSES, provisionStatusKey } from './provision-status';

/**
 * `…/spaces/provisioning` — the buy list. A KPI tile per status, status tabs, and a
 * node-grouped table (item / occurrences / spaces).
 *
 * Both the KPI tiles and the table are live on custom rows — `crm-space.service.ts`
 * sends `includeCustom=true` on both reads, and the backend honors it on both as of
 * `f743454`. The table tolerates `nodeId: null` and renders the Custom chip for it,
 * keyed by `trackKey` (composed from `spaceItemId` on a custom row — see
 * `crm-space.service.ts`'s `normalizeProvisionGroup`).
 */
@Component({
  selector: 'app-crm-provisioning-page',
  changeDetection: ChangeDetectionStrategy.OnPush,
  host: { class: 'block bg-bg min-h-full' },
  imports: [
    PeraAlertComponent,
    PeraPageHeaderComponent,
    PeraKpiTileComponent,
    PeraTabsComponent,
    PeraDataTableComponent,
  ],
  template: `
    <pera-page-header
      [title]="catalog.t('space.provTitle')"
      [count]="store.provisioning().length"
    />

    <div class="p-6 flex flex-col gap-4">
      @if (store.error(); as failure) {
        <pera-alert tone="danger">{{ catalog.t(failure) }}</pera-alert>
      }

      <div class="grid grid-cols-2 lg:grid-cols-4 gap-3">
        @for (status of statuses; track status) {
          <pera-kpi-tile [caption]="statusLabel(status)" [value]="occurrences(status)" />
        }
      </div>

      <pera-tabs [tabs]="tabs()" [activeId]="activeId()" (activeChange)="activeId.set($event)" />

      <pera-data-table
        [columns]="columns()"
        [rows]="rows()"
        [rowId]="rowId"
        [empty]="{ title: catalog.t('space.provEmpty') }"
      />
    </div>

    <ng-template #itemTpl let-row>
      <div class="flex items-center gap-2 flex-wrap">
        <span dir="auto">{{ name(row) }}</span>
        @if (row.isCustom) {
          <span
            class="fs-micro px-1.5 py-0.5 rounded border border-warning bg-warning-soft text-warning"
            >{{ catalog.t('space.custom') }}</span
          >
        }
      </div>
    </ng-template>
  `,
})
export class CrmProvisioningPageComponent {
  private readonly route = inject(ActivatedRoute);
  protected readonly store = inject(SpacesStore);
  protected readonly catalog = inject(CatalogService);

  protected readonly statuses = PROVISION_STATUSES;
  readonly activeId = signal<string>('all');

  readonly tabs = computed<TabDef[]>(() => [
    { id: 'all', label: this.catalog.t('space.provAll') },
    ...this.statuses.map((s) => ({ id: String(s), label: this.statusLabel(s) })),
  ]);

  readonly rows = computed<ProvisionGroup[]>(() => {
    const all = this.store.provisioning();
    const active = this.activeId();
    return active === 'all' ? all : all.filter((g) => String(g.status) === active);
  });

  private readonly itemTpl = viewChild.required<TemplateRef<unknown>>('itemTpl');

  /** Custom rows carry no name→string worth sorting/searching by value alone, so the
   * item column renders through `itemTpl` (name + the Custom chip) rather than `value`. */
  readonly columns = computed<ColumnDef<ProvisionGroup>[]>(() => [
    { key: 'item', header: this.catalog.t('space.provItem'), template: this.itemTpl() },
    {
      key: 'status',
      header: this.catalog.t('space.provStatus'),
      value: (r) => this.statusLabel(r.status),
    },
    {
      key: 'occurrences',
      header: this.catalog.t('space.provOccurrences'),
      value: (r) => r.occurrences,
    },
    {
      key: 'spaces',
      header: this.catalog.t('space.provSpaces'),
      value: (r) => r.spaces.join(', '),
    },
  ]);

  /** Every row tracked by its own `trackKey`, catalog or custom alike — never the array
   * index, which would misattribute selection/expansion state across a refetch. */
  readonly rowId = (row: ProvisionGroup): string => row.trackKey;

  constructor() {
    const id = this.route.snapshot.paramMap.get('projectId') ?? '';
    // Bounded at TWO requests regardless of space count. `store.load()` would additionally
    // pull the registry, the whole project brief, the space-type lookup, and a board AND a
    // completeness call PER SPACE — none of which this page renders. `ProvisionGroup.spaces`
    // already carries resolved names, so the registry isn't needed for labels either.
    this.store.setProject(id);
    this.store.loadProvisioning();
    this.store.loadProvisioningSummary();
  }

  name(x: { nameEn: string; nameAr: string }): string {
    return this.catalog.locale() === 'ar' ? x.nameAr || x.nameEn : x.nameEn;
  }

  statusLabel(status: CrmProvisionStatus): string {
    return this.catalog.t(provisionStatusKey(status));
  }

  /**
   * KPI totals come from the provisioning SUMMARY (per-space counts by status), not from
   * the grouped rows — that is what the summary endpoint is for, and it stays correct even
   * when the table below is filtered to one status.
   */
  occurrences(status: CrmProvisionStatus): number {
    return this.store
      .provisioningSummary()
      .filter((row) => row.status === status)
      .reduce((n, row) => n + row.count, 0);
  }
}
