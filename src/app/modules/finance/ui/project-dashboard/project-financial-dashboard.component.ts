import {
  ChangeDetectionStrategy,
  Component,
  OnInit,
  computed,
  inject,
  signal,
} from '@angular/core';
import { ActivatedRoute, RouterLink } from '@angular/router';
import { ProjectFinancialDashboardService } from '../../data/project-financial-dashboard.service';
import { LocaleService } from '@platform/i18n';
import { CanDirective, PERM } from '@platform/permissions';
import {
  ProjectFinanceBudgetLine,
  ProjectFinanceLedgerRow,
  ProjectFinanceOverBudgetTask,
  ProjectFinanceStageFunding,
  ProjectFinancialDashboardResponse,
} from '../../model/project-financial-dashboard.model';
import * as LedgerDir from '../../model/enums/ledger-direction.enum';
import * as LedgerType from '../../model/enums/ledger-entry-type.enum';
import { CurrencyContextService } from '@shared/ui/currency.context';
import { MoneyService } from '@shared/ui/money.service';
import { formatShortDate } from '@shared/ui/status';
import {
  PeraBadgeComponent,
  PeraButtonComponent,
  PeraChartCardComponent,
  PeraCurrencyComponent,
  PeraEmptyComponent,
  PeraHealthIndicatorComponent,
  PeraKpiTileComponent,
  PeraPageHeaderComponent,
  PeraCardComponent,
  PeraSkeletonComponent,
  PeraStatCardComponent,
  PeraTrendArrowComponent,
  StatBreakdownRow,
} from '@ds';

/**
 * `/finance/projects/:projectId` — single source of truth for the project's
 * financial picture. Consumes `GET /api/projects/{projectId}/financial-dashboard`
 * (a one-shot call — `Application/DTOs/Finance/ProjectFinancialDashboardResponse.cs`
 * + `GetProjectFinancialDashboardQuery.cs`) and surfaces:
 *
 *   - A KPI strip (Allocated, Committed, Actual, Available, Client paid, Collection %).
 *   - Per-stage funding bars with `isFunded` lock indicators.
 *   - Budget lines grouped by `costCategoryName` (nullable on the wire — an
 *     "Uncategorized" bucket catches the rest), with available-amount tint when
 *     a line is exhausted.
 *   - Invoice and variation summary panels with quick links into the inboxes.
 *     The server sends BUCKETS (`invoices.byStatus[]`, `variations.byKindAndStatus[]`),
 *     not the tile counts shown — `invoiceRollup`/`variationRollup` derive them.
 *   - An over-budget tasks list.
 *   - Recent ledger entries (last N).
 *   - Latest BOQ snapshot totals.
 *
 * All money formatting routes through `MoneyService`, in the currency carried
 * by the dashboard response (which is also published to `CurrencyContextService`
 * so child pages and parent components share it).
 *
 * Not rendered (real fields, awaiting a home): `budget.estimatedBudget`,
 * `budget.actualBudget` (always `null` server-side today), `earnings.*`.
 * A vendor invoice's line-level cost-category `code` and a ledger entry's
 * reversal flag do not exist on THIS endpoint's DTOs and were removed rather
 * than faked — see the deletions noted in the template.
 */
@Component({
  selector: 'app-project-financial-dashboard',
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [
    RouterLink,
    CanDirective,
    PeraBadgeComponent,
    PeraButtonComponent,
    PeraChartCardComponent,
    PeraCurrencyComponent,
    PeraEmptyComponent,
    PeraHealthIndicatorComponent,
    PeraKpiTileComponent,
    PeraPageHeaderComponent,
    PeraCardComponent,
    PeraSkeletonComponent,
    PeraStatCardComponent,
    PeraTrendArrowComponent,
  ],
  host: { class: 'block bg-bg min-h-full' },
  templateUrl: './project-financial-dashboard.component.html',
})
export class ProjectFinancialDashboardComponent implements OnInit {
  private readonly route = inject(ActivatedRoute);
  private readonly api = inject(ProjectFinancialDashboardService);
  private readonly currencyCtx = inject(CurrencyContextService);
  private readonly money = inject(MoneyService);
  private readonly locale = inject(LocaleService);

  protected readonly cap = PERM.finance;
  readonly loading = signal(true);
  readonly error = signal<string | null>(null);
  readonly data = signal<ProjectFinancialDashboardResponse | null>(null);
  readonly projectId = signal<string>('');

  /** Currency to format with — published to the global context once data arrives. */
  protected readonly currency = computed(
    () => this.data()?.currency ?? this.currencyCtx.currency(),
  );

  /** Fallback group for lines with a null `costCategoryName` (the wire allows it). */
  private static readonly UNCATEGORIZED = 'Uncategorized';

  /** Budget lines grouped by category, sorted by category name; Uncategorized sinks last. */
  protected readonly budgetGroups = computed<{ name: string; lines: ProjectFinanceBudgetLine[] }[]>(
    () => {
      const uncategorized = ProjectFinancialDashboardComponent.UNCATEGORIZED;
      const lines = this.data()?.budgetLines ?? [];
      const groups = new Map<string, ProjectFinanceBudgetLine[]>();
      for (const line of lines) {
        const key = line.costCategoryName?.trim() || uncategorized;
        const list = groups.get(key) ?? [];
        list.push(line);
        groups.set(key, list);
      }
      return Array.from(groups, ([name, lines]) => ({ name, lines })).sort((a, b) => {
        // Uncategorized always sinks to the bottom, whatever the locale collation.
        if (a.name === uncategorized) return 1;
        if (b.name === uncategorized) return -1;
        return a.name.localeCompare(b.name);
      });
    },
  );

  protected readonly recentActivity = computed(() => this.data()?.recentActivity ?? []);
  protected readonly overBudgetTasks = computed(() => this.data()?.overBudgetTasks ?? []);
  protected readonly stages = computed(() => this.data()?.collection.stages ?? []);

  /**
   * Invoice tiles, DERIVED from `invoices.byStatus[]` — the server sends buckets, not
   * the three counts the panel shows. Statuses are `InvoiceStatus.ToString()`: exactly
   * `Open`, `Paid`, `Cancelled`.
   *
   * `totalInvoiced` = Σ bucket totals EXCLUDING Cancelled — a cancelled invoice was
   * never really invoiced. `totalPaid` = invoiced − outstanding, NOT the `Paid` bucket
   * total: the server's `totalOutstanding` is Σ(total − paid) over OPEN invoices, so
   * subtracting it credits partial payments the Paid bucket cannot see. Arithmetic is
   * BigInt string-decimal throughout.
   *
   * CAVEAT: these buckets are NOT filtered by invoice type, so vendor invoices are
   * counted alongside client invoices — a backend semantics note, not a bug here.
   */
  protected readonly invoiceRollup = computed(() => {
    const invoices = this.data()?.invoices;
    if (!invoices) {
      return {
        openCount: 0,
        paidCount: 0,
        cancelledCount: 0,
        totalInvoiced: '0',
        totalPaid: '0',
        totalOutstanding: '0',
      };
    }
    let openCount = 0;
    let paidCount = 0;
    let cancelledCount = 0;
    let totalInvoiced = '0';
    for (const bucket of invoices.byStatus) {
      if (bucket.status === 'Open') openCount += bucket.count;
      else if (bucket.status === 'Paid') paidCount += bucket.count;
      else if (bucket.status === 'Cancelled') cancelledCount += bucket.count;
      if (bucket.status !== 'Cancelled') {
        totalInvoiced = this.money.add(totalInvoiced, bucket.total);
      }
    }
    return {
      openCount,
      paidCount,
      cancelledCount,
      totalInvoiced,
      totalPaid: this.money.subtract(totalInvoiced, invoices.totalOutstanding),
      totalOutstanding: invoices.totalOutstanding,
    };
  });

  /**
   * Variation tiles, DERIVED from `variations.byKindAndStatus[]`. Kinds are
   * `VariationKind.ToString()` → `ClientDifference` | `InternalChange`; statuses are
   * `VariationStatus.ToString()` → Draft | Submitted | Approved | Rejected | Cancelled
   * | Applied.
   *
   * "Pending" = Draft + Submitted — the set still awaiting a decision. Approved
   * (decided, not yet applied), Rejected and Cancelled are deliberately NOT pending;
   * the old fictional field carried no definition at all.
   */
  protected readonly variationRollup = computed(() => {
    const variations = this.data()?.variations;
    if (!variations) {
      return {
        clientDifferenceCount: 0,
        internalChangeCount: 0,
        pendingCount: 0,
        appliedCount: 0,
        totalDifferenceAmount: '0',
      };
    }
    let clientDifferenceCount = 0;
    let internalChangeCount = 0;
    let pendingCount = 0;
    let appliedCount = 0;
    for (const bucket of variations.byKindAndStatus) {
      if (bucket.kind === 'ClientDifference') clientDifferenceCount += bucket.count;
      else if (bucket.kind === 'InternalChange') internalChangeCount += bucket.count;
      if (bucket.status === 'Draft' || bucket.status === 'Submitted') pendingCount += bucket.count;
      else if (bucket.status === 'Applied') appliedCount += bucket.count;
    }
    return {
      clientDifferenceCount,
      internalChangeCount,
      pendingCount,
      appliedCount,
      totalDifferenceAmount: variations.signedClientDifferenceTotal,
    };
  });

  /** Breakdown rows beneath the Collection stat card. */
  protected readonly invoiceBreakdown = computed<StatBreakdownRow[]>(() => {
    const rollup = this.invoiceRollup();
    return [
      { label: 'Invoiced', value: this.fmtCompact(rollup.totalInvoiced) },
      { label: 'Paid', value: this.fmtCompact(rollup.totalPaid) },
      { label: 'Outstanding', value: this.fmtCompact(rollup.totalOutstanding) },
    ];
  });

  /**
   * Cached per-amount formatters for `pera-trend-arrow`. The arrow takes a
   * `number` for direction and a `format` callback for the text; keeping the
   * callback identity stable per amount avoids re-running the computed on every
   * change-detection pass. The closure re-reads locale and currency at call
   * time, so a locale switch still re-renders.
   */
  private readonly signedFormatters = new Map<string, (n: number) => string>();

  ngOnInit(): void {
    this.route.paramMap.subscribe((params) => {
      const projectId = params.get('projectId') ?? '';
      this.projectId.set(projectId);
      if (projectId) this.reload();
    });
  }

  reload(): void {
    this.loading.set(true);
    this.error.set(null);
    this.signedFormatters.clear();
    this.api.forProject(this.projectId()).subscribe({
      next: (response) => {
        this.data.set(response);
        this.currencyCtx.set(response.currency);
        this.loading.set(false);
      },
      error: () => {
        this.error.set('Could not load the financial dashboard.');
        this.loading.set(false);
      },
    });
  }

  protected fmt(amount: string | null | undefined): string {
    if (amount === null || amount === undefined) return '—';
    return this.money.format(amount, this.currency(), this.locale.locale());
  }

  /** Compact format for headline KPI tiles where columns are narrow. */
  protected fmtCompact(amount: string | null | undefined): string {
    if (amount === null || amount === undefined) return '—';
    return this.money.formatCompact(amount, this.currency(), this.locale.locale());
  }

  protected signed(amount: string): string {
    return this.money.signed(amount, this.currency(), this.locale.locale());
  }

  /**
   * `-1 | 0 | 1` — the sign of a string-decimal, via BigInt. Feeds
   * `pera-trend-arrow`'s direction without the amount ever becoming a number.
   */
  protected signOf(amount: string): number {
    return this.money.compare(amount, '0');
  }

  /** A stable `format` callback that renders the exact server decimal. */
  protected signedFormat(amount: string): (n: number) => string {
    let formatter = this.signedFormatters.get(amount);
    if (!formatter) {
      formatter = () => this.signed(amount);
      this.signedFormatters.set(amount, formatter);
    }
    return formatter;
  }

  protected stagePaidPercent(stage: ProjectFinanceStageFunding): number {
    return this.money.percentOf(stage.clientPaidAmount, stage.requiredBudget);
  }

  protected isLineOver(line: ProjectFinanceBudgetLine): boolean {
    return this.money.isNegative(line.available);
  }

  protected overByPercent(task: ProjectFinanceOverBudgetTask): number {
    // A task over budget with a zero (or negative) cap is 100% over, not 0% —
    // percentOf returns 0 for a non-positive whole, so guard it explicitly.
    if (this.money.compare(task.allocated, '0') <= 0) return 100;
    return this.money.percentOf(task.overrun, task.allocated);
  }

  protected collectionPercent(): number {
    const raw = this.data()?.collection.collectionPercentOfEstimatedBudget ?? '0';
    const n = +raw;
    return Number.isFinite(n) ? Math.min(100, Math.max(0, n)) : 0;
  }

  protected formatDate(iso: string | null | undefined): string {
    return formatShortDate(iso, this.locale.locale());
  }

  protected ledgerDirectionLabel(entry: ProjectFinanceLedgerRow): string {
    return LedgerDir.label(entry.direction, this.locale.locale());
  }

  protected ledgerTypeLabel(entry: ProjectFinanceLedgerRow): string {
    return LedgerType.label(entry.type, this.locale.locale());
  }
}
