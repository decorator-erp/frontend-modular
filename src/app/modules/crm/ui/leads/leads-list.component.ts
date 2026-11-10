import {
  ChangeDetectionStrategy,
  Component,
  OnInit,
  TemplateRef,
  computed,
  inject,
  signal,
  viewChild,
} from '@angular/core';
import { FormsModule } from '@angular/forms';
import { Router } from '@angular/router';
import { Subscription, catchError, of } from 'rxjs';
import { CrmLeadService, type CrmLead } from '../../data/crm-lead.service';
import { CatalogService } from '@platform/i18n/catalog.service';
import { emptyPage, type PagedResult } from '@platform/types';
import type { CrmLeadStatusCounts } from '../../model';
import { LeadSource, LeadStatus } from '../../model/crm-enums';
import { CanDirective, PERM } from '@platform/permissions';
import { EmployeeService } from '@modules/people';
import {
  ColumnDef,
  EmptyCta,
  FilterFacet,
  FilterState,
  ModalService,
  PeraAvatarComponent,
  PeraAlertComponent,
  PeraButtonComponent,
  PeraDataTableComponent,
  PeraEmptyComponent,
  PeraFilterBarComponent,
  PeraPageHeaderComponent,
  PeraPaginationComponent,
  PeraSegmentedComponent,
  PeraSkeletonComponent,
  PeraStatusBadgeComponent,
  SegmentedOption,
} from '@ds';
import { CrmLeadFormComponent } from '../dashboard/forms/lead-form.component';
import { LEAD_SOURCE_KEYS, LEAD_STATUS_KEYS, LEAD_STATUS_TONE } from './lead-labels';

const STATUS_ORDER: LeadStatus[] = [
  LeadStatus.New,
  LeadStatus.Contacted,
  LeadStatus.Qualified,
  LeadStatus.Unqualified,
  LeadStatus.Converted,
];

/**
 * Office leads index — v2 house pattern (page-header + filter-bar + Cards|Table). The view choice
 * persists per the projects-list idiom (`pera.leads.view`); both views render the SAME filtered
 * `rows()` — toggling never refetches. Rows link to the intake editor (`crm/leads/:leadId`).
 * The list DTO carries no intake flag or sector, so the card's intake dot + sector chip are built
 * as hidden slots (they light up unchanged once `LeadListItemResponse` grows `hasIntake`/`sectorLabel`).
 */
@Component({
  selector: 'app-crm-leads-list',
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [
    CanDirective,
    FormsModule,
    PeraAvatarComponent,
    PeraAlertComponent,
    PeraButtonComponent,
    PeraDataTableComponent,
    PeraEmptyComponent,
    PeraFilterBarComponent,
    PeraPageHeaderComponent,
    PeraPaginationComponent,
    PeraSegmentedComponent,
    PeraSkeletonComponent,
    PeraStatusBadgeComponent,
  ],
  host: { class: 'block' },
  template: `
    <pera-page-header [title]="catalog.t('leads.listTitle')" [count]="paged().totalCount">
      <div actions>
        <pera-button
          *peraCan="PERM.crm.leads.create"
          variant="primary"
          iconStart="plus"
          (click)="openNew()"
          >{{ catalog.t('nav.lead') }}</pera-button
        >
      </div>
      <div toolbar class="w-full flex items-center gap-3">
        <pera-filter-bar
          class="flex-1 min-w-0"
          [search]="true"
          [facets]="facets()"
          [value]="filters()"
          (valueChange)="onFilters($event)"
          (clearAll)="onClear()"
        />
        <pera-segmented
          class="shrink-0"
          [ngModel]="view()"
          (ngModelChange)="setView($any($event))"
          [options]="viewOptions()"
        />
      </div>
    </pera-page-header>

    <div class="p-4">
      @if (loading()) {
        @if (view() === 'cards') {
          <div
            class="grid gap-3"
            [style.gridTemplateColumns]="'repeat(auto-fill, minmax(var(--w-panel), 1fr))'"
          >
            @for (i of skeletonRows; track i) {
              <pera-skeleton [height]="132" rounded="sm" />
            }
          </div>
        } @else {
          <pera-skeleton [height]="360" rounded="sm" />
        }
      } @else if (loadError()) {
        <pera-alert tone="danger" data-testid="leads-load-error">
          <div class="flex items-center justify-between gap-3 flex-wrap">
            <span>{{ catalog.t('leads.loadFailed') }}</span>
            <pera-button size="sm" variant="secondary" (click)="retry()">{{
              catalog.t('common.retry')
            }}</pera-button>
          </div>
        </pera-alert>
      } @else if (!rows().length) {
        <pera-empty
          [title]="catalog.t('leads.empty')"
          [description]="catalog.t('leads.emptyMsg')"
          iconName="inbox"
          [cta]="emptyCta()"
        />
      } @else if (view() === 'cards') {
        <div
          class="grid gap-3"
          [style.gridTemplateColumns]="'repeat(auto-fill, minmax(var(--w-panel), 1fr))'"
        >
          @for (row of rows(); track row.id) {
            <button
              type="button"
              (click)="open(row)"
              class="text-start bg-surface border border-border rounded-card p-4 flex flex-col gap-2.5 cursor-pointer hover:bg-surface-muted transition-colors outline-none focus-visible:outline-2 focus-visible:outline-accent focus-visible:outline-offset-2"
              [class.opacity-60]="isConverted(row)"
            >
              <!-- Header: intake dot (hidden until DTO carries it) + name + phone · status -->
              <div class="flex items-start justify-between gap-2">
                <div class="min-w-0">
                  <div class="flex items-center gap-2">
                    @if (intakePresent(row)) {
                      <span
                        class="w-2 h-2 shrink-0 bg-accent-soft border border-accent"
                        [title]="catalog.t('leads.identity')"
                      ></span>
                    }
                    <span class="font-medium text-text-primary truncate"
                      >{{ row.firstName }} {{ row.lastName }}</span
                    >
                  </div>
                  @if (row.phone) {
                    <div class="fs-label text-text-muted mt-0.5" dir="ltr">{{ row.phone }}</div>
                  }
                </div>
                <pera-status-badge
                  class="shrink-0"
                  [tone]="statusTone(row.status)"
                  [label]="catalog.t(statusKey(row.status))"
                />
              </div>

              <!-- Meta: source + sector chip (hidden until DTO carries it) -->
              <div class="flex items-center gap-2.5 flex-wrap fs-label text-text-secondary">
                <span
                  ><span class="text-text-muted">{{ catalog.t('leads.colSource') }}:</span>
                  {{ catalog.t(sourceKey(row.source)) }}</span
                >
                @if (sectorLabel(row); as sector) {
                  <span class="px-1.5 py-0.5 border border-border-strong text-text-secondary">{{
                    sector
                  }}</span>
                }
              </div>

              <!-- Footer: owner avatar + name · open action -->
              <div class="flex items-center justify-between gap-2 pt-2 border-t border-border">
                <div class="flex items-center gap-1.5 min-w-0">
                  <pera-avatar [name]="ownerName(row)" size="xs" />
                  <span class="fs-label text-text-secondary truncate">{{ ownerName(row) }}</span>
                </div>
                <!-- Decorative affordance: the whole card is the button; nesting a real button here would be invalid HTML. -->
                <span class="fs-label text-accent shrink-0" aria-hidden="true"
                  >{{ catalog.t('common.view') }}
                  <span class="inline-block rtl:rotate-180">→</span></span
                >
              </div>
            </button>
          }
        </div>
        <div class="mt-3">
          <pera-pagination
            [page]="paged().page"
            [pageSize]="paged().pageSize || pageSize"
            [totalCount]="paged().totalCount"
            (pageChange)="goToPage($event)"
          />
        </div>
      } @else {
        <pera-data-table
          [columns]="columns()"
          [rows]="rows()"
          [rowId]="rowId"
          [hasRowClick]="true"
          [page]="paged().page"
          [pageSize]="paged().pageSize || pageSize"
          [totalCount]="paged().totalCount"
          (pageChange)="goToPage($event)"
          (rowClick)="open($event)"
        />
      }
    </div>

    <ng-template #nameTpl let-row>
      <div class="flex flex-col gap-0.5">
        <span class="font-medium text-text-primary">{{ row.firstName }} {{ row.lastName }}</span>
        @if (row.phone) {
          <span class="fs-label text-text-muted" dir="ltr">{{ row.phone }}</span>
        }
      </div>
    </ng-template>
    <ng-template #statusTpl let-row>
      <pera-status-badge
        [tone]="statusTone(row.status)"
        [label]="catalog.t(statusKey(row.status))"
      />
    </ng-template>
  `,
})
export class CrmLeadsListComponent implements OnInit {
  private readonly leads = inject(CrmLeadService);
  private readonly directory = inject(EmployeeService);
  private readonly modal = inject(ModalService);
  private readonly router = inject(Router);
  protected readonly catalog = inject(CatalogService);
  protected readonly PERM = PERM;

  private readonly nameTpl = viewChild.required<TemplateRef<unknown>>('nameTpl');
  private readonly statusTpl = viewChild.required<TemplateRef<unknown>>('statusTpl');

  readonly loading = signal(true);
  /** The last page fetch failed: say so with a Retry, never render it as "no leads". */
  readonly loadError = signal(false);
  /** One server page (009b #1): status and search filter server-side, newest first. */
  readonly paged = signal<PagedResult<CrmLead>>(emptyPage<CrmLead>());
  readonly pageSize = 50;
  private readonly page = signal(1);
  private readonly owners = signal<Record<string, string>>({});
  readonly filters = signal<FilterState>({});
  private listSub?: Subscription;
  private countsSub?: Subscription;
  /** Pill counts from `status-counts` (009b #2), under the list's search filter. */
  private readonly counts = signal<CrmLeadStatusCounts | null>(null);

  readonly rows = computed(() => this.paged().items);

  readonly facets = computed<FilterFacet[]>(() => [
    {
      key: 'status',
      label: this.catalog.t('leads.colStatus'),
      options: STATUS_ORDER.map((s) => {
        const label = this.catalog.t(LEAD_STATUS_KEYS[s]);
        const count = this.statusCount(s);
        return { value: String(s), label: count === null ? label : `${label} · ${count}` };
      }),
    },
  ]);

  readonly columns = computed<ColumnDef<CrmLead>[]>(() => [
    {
      key: 'name',
      header: this.catalog.t('leads.colName'),
      minWidth: 200,
      template: this.nameTpl(),
    },
    {
      key: 'source',
      header: this.catalog.t('leads.colSource'),
      minWidth: 120,
      value: (r) => this.catalog.t(this.sourceKey(r.source)),
    },
    {
      key: 'status',
      header: this.catalog.t('leads.colStatus'),
      width: 140,
      template: this.statusTpl(),
    },
    {
      key: 'owner',
      header: this.catalog.t('leads.colOwner'),
      minWidth: 140,
      value: (r) => this.ownerName(r),
    },
  ]);

  /** Cards|Table, persisted per the projects-list idiom (`pera.<feature>.view`). */
  readonly view = signal<'cards' | 'table'>(
    (typeof localStorage !== 'undefined' &&
      (localStorage.getItem('pera.leads.view') as 'cards' | 'table')) ||
      'cards',
  );
  protected readonly skeletonRows = [0, 1, 2, 3, 4, 5];

  readonly viewOptions = computed<SegmentedOption[]>(() => [
    { value: 'cards', label: this.catalog.t('leads.cards') },
    { value: 'table', label: this.catalog.t('leads.table') },
  ]);

  readonly emptyCta = computed<EmptyCta>(() => ({
    label: this.catalog.t('nav.lead'),
    action: () => void this.openNew(),
    capability: PERM.crm.leads.create,
  }));

  setView(v: 'cards' | 'table'): void {
    this.view.set(v);
    if (typeof localStorage !== 'undefined') localStorage.setItem('pera.leads.view', v);
  }

  /** LI-1: a website lead arrives unassigned. */
  protected ownerName(row: CrmLead): string {
    if (!row.ownerId) return this.catalog.t('leads.unassigned');
    return this.owners()[row.ownerId] ?? '—';
  }
  protected isConverted(row: CrmLead): boolean {
    return row.status === LeadStatus.Converted;
  }
  /**
   * Prepared-but-inert adornments: `CrmLead` carries no intake flag or sector today, so
   * both slots stay hidden. They light up unchanged the moment `LeadListItemResponse` grows a
   * `hasIntake` boolean / a resolved `sectorLabel` — no template change needed.
   */
  protected intakePresent(row: CrmLead): boolean {
    return Boolean((row as { hasIntake?: boolean }).hasIntake);
  }
  protected sectorLabel(row: CrmLead): string | null {
    return (row as { sectorLabel?: string }).sectorLabel ?? null;
  }

  ngOnInit(): void {
    this.loadPage();
    this.loadCounts();
    this.directory
      .listPaged({ page: 1, pageSize: 500, isActive: true })
      .pipe(catchError(() => of(null)))
      .subscribe((paged) => {
        const map: Record<string, string> = {};
        for (const e of paged?.items ?? []) map[e.id] = e.fullName;
        this.owners.set(map);
      });
  }

  /** Fetch the current page under the current filters; a newer fetch cancels the older one. */
  private loadPage(): void {
    const status = this.filters().facets?.['status']?.at(-1);
    this.listSub?.unsubscribe();
    this.loading.set(true);
    this.loadError.set(false);
    this.listSub = this.leads
      .search({
        pageNumber: this.page(),
        pageSize: this.pageSize,
        status: status ? (Number(status) as LeadStatus) : undefined,
        search: this.filters().search,
      })
      .pipe(
        catchError(() => {
          this.loadError.set(true);
          return of(emptyPage<CrmLead>());
        }),
      )
      .subscribe((paged) => {
        this.paged.set(paged);
        this.loading.set(false);
      });
  }

  /** Re-run the failed page fetch (and the pill counts) under the same filters. */
  retry(): void {
    this.loadPage();
    this.loadCounts();
  }

  /** Status counts follow the search filter, never the status pick or the page. */
  private loadCounts(): void {
    this.countsSub?.unsubscribe();
    this.countsSub = this.leads
      .statusCounts({ search: this.filters().search })
      .pipe(catchError(() => of(null)))
      .subscribe((counts) => this.counts.set(counts));
  }

  statusCount(status: LeadStatus): number | null {
    const c = this.counts();
    if (!c) return null;
    switch (status) {
      case LeadStatus.New:
        return c.new;
      case LeadStatus.Contacted:
        return c.contacted;
      case LeadStatus.Qualified:
        return c.qualified;
      case LeadStatus.Unqualified:
        return c.unqualified;
      case LeadStatus.Converted:
        return c.converted;
    }
  }

  goToPage(page: number): void {
    this.page.set(page);
    this.loadPage();
  }

  protected statusKey(status: LeadStatus) {
    return LEAD_STATUS_KEYS[status];
  }
  protected statusTone(status: LeadStatus) {
    return LEAD_STATUS_TONE[status];
  }
  protected sourceKey(source: LeadSource) {
    return LEAD_SOURCE_KEYS[source];
  }

  rowId = (row: CrmLead): string => row.id;

  onFilters(state: FilterState): void {
    this.filters.set(state);
    this.page.set(1);
    this.loadPage();
    this.loadCounts();
  }
  onClear(): void {
    this.filters.set({});
    this.page.set(1);
    this.loadPage();
    this.loadCounts();
  }

  open(row: CrmLead): void {
    void this.router.navigate(['/crm/leads', row.id]);
  }

  async openNew(): Promise<void> {
    const created = await this.modal
      .open<boolean>(CrmLeadFormComponent, { size: 'lg' })
      .afterClosed();
    if (created) this.ngOnInit();
  }
}
