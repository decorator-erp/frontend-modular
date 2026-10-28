import {
  ChangeDetectionStrategy,
  Component,
  OnInit,
  computed,
  inject,
  signal,
} from '@angular/core';
import { ActivatedRoute, Router } from '@angular/router';
import { LocaleService } from '@platform/i18n';
import {
  CostCategoryRow,
  MonthlyCashRow,
  StageBudgetRow,
} from '../../model/project-dashboard-splits.model';
import { CurrencyContextService } from '@shared/ui/currency.context';
import { MoneyService } from '@shared/ui/money.service';
import {
  ColumnDef,
  PeraAlertComponent,
  PeraCardComponent,
  PeraDataTableComponent,
  PeraEmptyComponent,
  PeraCurrencyComponent,
  PeraKpiTileComponent,
  PeraPageHeaderComponent,
  PeraProgressBarComponent,
  PeraSkeletonComponent,
} from '@ds';
import { ProjectFinancialStore } from '../../stores/project-financial.store';

/**
 * `/finance/projects/:projectId/summary` — the financial-query dashboard splits
 * (totals + per-stage budgets + by-category + monthly cashflow). Sibling to the
 * one-shot operational dashboard. Money formats via `MoneyService`; the cashflow
 * uses plain CSS bars (no chart dependency).
 */
@Component({
  selector: 'app-project-financial-summary',
  changeDetection: ChangeDetectionStrategy.OnPush,
  providers: [ProjectFinancialStore],
  imports: [
    PeraAlertComponent,
    PeraCardComponent,
    PeraCurrencyComponent,
    PeraDataTableComponent,
    PeraEmptyComponent,
    PeraKpiTileComponent,
    PeraPageHeaderComponent,
    PeraProgressBarComponent,
    PeraSkeletonComponent,
  ],
  host: { class: 'block bg-bg min-h-full' },
  template: `
    <pera-page-header
      title="Financial summary"
      subtitle="Totals, per-stage budgets, cost categories and monthly cashflow."
    />

    <div class="px-8 py-6 flex flex-col gap-6">
      @if (store.error()) {
        <pera-alert tone="danger" title="Couldn't load the financial summary">{{
          store.error()
        }}</pera-alert>
      }

      <!-- Totals -->
      <section class="flex flex-col gap-3">
        <pera-page-header variant="section" title="PROJECT TOTALS" />
        @if (store.summaryLoading()) {
          <pera-skeleton [height]="120" />
        } @else if (totals(); as t) {
          <div class="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-6 gap-3">
            <pera-kpi-tile caption="Effective cap" [value]="fmt(t.effectiveCap)" />
            <pera-kpi-tile caption="Allocated" [value]="fmt(t.allocatedAmount)" />
            <pera-kpi-tile caption="Committed" [value]="fmt(t.committedAmount)" />
            <pera-kpi-tile
              caption="Actual"
              [value]="fmt(t.actualAmount)"
              [progress]="pct(t.actualAmount, t.effectiveCap)"
            />
            <pera-kpi-tile
              caption="Available"
              [value]="fmt(t.availableAmount)"
              [progress]="pct(t.availableAmount, t.effectiveCap)"
            />
            <pera-kpi-tile caption="Earnings" [value]="fmt(t.earnings)" />
          </div>
          <div class="grid grid-cols-2 lg:grid-cols-4 gap-3">
            <pera-kpi-tile caption="Client paid" [value]="fmt(t.clientPaidAmount)" />
            <pera-kpi-tile caption="Vendor paid" [value]="fmt(t.vendorPaidAmount)" />
            <pera-kpi-tile
              caption="Collection"
              [value]="pctText(t.collectionPercent)"
              [progress]="clampPct(t.collectionPercent)"
            />
            <pera-kpi-tile
              caption="Cost"
              [value]="pctText(t.costPercent)"
              [progress]="clampPct(t.costPercent)"
            />
          </div>
        } @else {
          <pera-empty
            title="No summary"
            description="No financial summary available for this project."
          />
        }
      </section>

      <!-- Per-stage budgets -->
      <section class="flex flex-col gap-3">
        <pera-page-header variant="section" title="STAGES" />
        <pera-data-table
          [columns]="stageColumns"
          [rows]="stages()"
          [loading]="store.summaryLoading()"
          [hasRowClick]="true"
          (rowClick)="openStage($event)"
          [empty]="{ title: 'No stages', description: 'This project has no stage-level budgets.' }"
        />
      </section>

      <!-- By cost category -->
      <section class="flex flex-col gap-3">
        <pera-page-header variant="section" title="BY COST CATEGORY" />
        <pera-card padding="none">
          @if (store.byCategoryLoading()) {
            <div class="p-4"><pera-skeleton [height]="120" /></div>
          } @else if (byCategory().length) {
            <div class="flex flex-col gap-3 p-4">
              @for (row of byCategory(); track row.costCategoryId) {
                <div class="flex flex-col gap-1">
                  <div class="flex items-center justify-between fs-caption gap-3">
                    <span class="text-text-primary truncate">{{ row.categoryName }}</span>
                    <span class="font-mono tabular-nums text-text-secondary shrink-0">
                      <pera-currency [amount]="row.actualAmount" /> /
                      <pera-currency [amount]="row.allocatedAmount" />
                    </span>
                  </div>
                  <pera-progress-bar
                    [value]="pct(row.actualAmount, row.allocatedAmount)"
                    [height]="6"
                    [tone]="overAllocated(row) ? 'muted' : 'accent'"
                  />
                </div>
              }
            </div>
          } @else {
            <pera-empty
              title="No categories"
              description="No cost-category breakdown for this project."
            />
          }
        </pera-card>
      </section>

      <!-- Monthly cashflow -->
      <section class="flex flex-col gap-3">
        <pera-page-header variant="section" title="MONTHLY CASHFLOW" />
        <pera-card padding="none">
          @if (store.cashflowLoading()) {
            <div class="p-4"><pera-skeleton [height]="160" /></div>
          } @else if (cashflow().length) {
            <div
              class="p-4 flex items-end gap-3 overflow-x-auto"
              style="min-height: var(--h-chart-lg)"
            >
              @for (row of cashflow(); track row.year + '-' + row.month) {
                <div
                  class="flex flex-col items-center gap-1.5 shrink-0"
                  style="width: var(--space-12)"
                >
                  <div class="flex items-end justify-center gap-1 h-[var(--h-chart)]">
                    <div
                      class="w-3 bg-success"
                      [style.height.%]="pct(row.inflow, cashMax())"
                      [attr.title]="fmt(row.inflow)"
                    ></div>
                    <div
                      class="w-3 bg-warning"
                      [style.height.%]="pct(row.outflow, cashMax())"
                      [attr.title]="fmt(row.outflow)"
                    ></div>
                  </div>
                  <span class="font-mono fs-micro text-text-muted whitespace-nowrap">{{
                    monthLabel(row)
                  }}</span>
                </div>
              }
            </div>
            <div class="px-4 pb-3 flex items-center gap-4 font-mono fs-micro text-text-muted">
              <span class="inline-flex items-center gap-1"
                ><span class="w-2.5 h-2.5 bg-success inline-block"></span> Inflow</span
              >
              <span class="inline-flex items-center gap-1"
                ><span class="w-2.5 h-2.5 bg-warning inline-block"></span> Outflow</span
              >
            </div>
          } @else {
            <pera-empty
              title="No cashflow"
              description="No monthly cashflow recorded for this project."
            />
          }
        </pera-card>
      </section>
    </div>
  `,
})
export class ProjectFinancialSummaryComponent implements OnInit {
  private readonly route = inject(ActivatedRoute);
  private readonly router = inject(Router);
  private readonly money = inject(MoneyService);
  private readonly locale = inject(LocaleService);
  private readonly currencyCtx = inject(CurrencyContextService);
  readonly store = inject(ProjectFinancialStore);

  readonly projectId = signal('');

  readonly totals = computed(() => this.store.summary()?.totals ?? null);
  readonly stages = computed(() => this.store.summary()?.stages ?? []);
  readonly byCategory = computed(() => this.store.byCategory());
  readonly cashflow = computed(() => this.store.cashflow());

  readonly currency = computed(() => this.totals()?.currency ?? this.currencyCtx.currency());

  /** Largest single inflow/outflow across the series — scales the cashflow bars. */
  readonly cashMax = computed(() => {
    let max = '0';
    for (const row of this.cashflow()) {
      if (this.money.compare(row.inflow, max) > 0) max = row.inflow;
      if (this.money.compare(row.outflow, max) > 0) max = row.outflow;
    }
    return max;
  });

  readonly stageColumns: ColumnDef<StageBudgetRow>[] = [
    { key: 'name', header: 'Stage', minWidth: 160 },
    {
      key: 'effectiveCap',
      header: 'Effective cap',
      width: 140,
      value: (r) => this.fmt(r.effectiveCap),
    },
    {
      key: 'allocatedAmount',
      header: 'Allocated',
      width: 130,
      value: (r) => this.fmt(r.allocatedAmount),
    },
    { key: 'actualAmount', header: 'Actual', width: 130, value: (r) => this.fmt(r.actualAmount) },
    {
      key: 'availableAmount',
      header: 'Available',
      width: 130,
      value: (r) => this.fmt(r.availableAmount),
    },
    {
      key: 'requiredBudget',
      header: 'Required',
      width: 130,
      value: (r) => this.fmt(r.requiredBudget),
    },
    {
      key: 'clientPaidAmount',
      header: 'Client paid',
      width: 130,
      value: (r) => this.fmt(r.clientPaidAmount),
    },
  ];

  ngOnInit(): void {
    const id = this.route.snapshot.paramMap.get('projectId') ?? '';
    this.projectId.set(id);
    if (!id) return;
    this.store.loadSummary(id);
    this.store.loadByCategory(id);
    this.store.loadCashflow(id);
  }

  openStage(row: StageBudgetRow): void {
    void this.router.navigate(['/projects', this.projectId(), 'stages', row.projectStageId]);
  }

  overAllocated(row: CostCategoryRow): boolean {
    return this.money.compare(row.actualAmount, row.allocatedAmount) > 0;
  }

  monthLabel(row: MonthlyCashRow): string {
    const d = new Date(row.year, row.month - 1, 1);
    const month = d.toLocaleDateString(this.locale.locale() === 'ar' ? 'ar-EG' : 'en-US', {
      month: 'short',
    });
    return `${month} ${String(row.year).slice(2)}`;
  }

  fmt(amount: string): string {
    return this.money.format(amount, this.currency(), this.locale.locale());
  }

  pct(part: string, whole: string): number {
    return this.money.percentOf(part, whole);
  }

  pctText(value: string): string {
    return this.money.formatPercent(value);
  }

  clampPct(value: string): number {
    const n = +value;
    return Number.isFinite(n) ? Math.min(100, Math.max(0, n)) : 0;
  }
}
