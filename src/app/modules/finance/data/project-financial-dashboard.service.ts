import { Injectable } from '@angular/core';
import { Observable } from 'rxjs';
import { map } from 'rxjs/operators';
import type {
  ProjectFinanceBoqSummary,
  ProjectFinanceBudgetLine,
  ProjectFinanceBudgetSummary,
  ProjectFinanceCollectionSummary,
  ProjectFinanceEarningsSummary,
  ProjectFinanceInvoiceStatusBucket,
  ProjectFinanceInvoiceSummary,
  ProjectFinanceLedgerRow,
  ProjectFinanceOverBudgetTask,
  ProjectFinanceStageFunding,
  ProjectFinanceVariationBucket,
  ProjectFinanceVariationSummary,
  ProjectFinancialDashboardResponse,
} from '../model/project-financial-dashboard.model';
import { ApiService } from '@platform/http/api.service';

/**
 * Project financial dashboard — `GET /api/projects/{projectId}/financial-dashboard`.
 *
 * The endpoint returns the DTO BARE (`Results.Ok(result.Value)`), so `unwrap` is a
 * defensive no-op here; kept for symmetry with the rest of this layer.
 *
 * NORMALIZATION IS MANDATORY, not cosmetic. Every money field on the wire is a C#
 * `decimal` and therefore a JSON NUMBER, while `MoneyService`'s arithmetic
 * (`add`/`subtract`/`compare`/`percentOf`/`isNegative`/`signed`/`parse`) accepts
 * `string` ONLY. `decimalOf()` is the single funnel that makes that true.
 */
@Injectable({ providedIn: 'root' })
export class ProjectFinancialDashboardService extends ApiService {
  forProject(
    projectId: string,
    recentActivityCount = 10,
  ): Observable<ProjectFinancialDashboardResponse> {
    return this.get<unknown>(`/projects/${projectId}/financial-dashboard`, {
      recentActivityCount,
    }).pipe(map((r) => this.normalize(this.unwrap(r))));
  }

  private normalize(source: unknown): ProjectFinancialDashboardResponse {
    return {
      projectId: this.field<string>(source, 'projectId') ?? '',
      currency: this.field<string>(source, 'currency') ?? 'EGP',
      budget: this.normalizeBudget(this.field<unknown>(source, 'budget')),
      collection: this.normalizeCollection(this.field<unknown>(source, 'collection')),
      earnings: this.normalizeEarnings(this.field<unknown>(source, 'earnings')),
      budgetLines: (this.field<unknown[]>(source, 'budgetLines') ?? []).map((l) =>
        this.normalizeBudgetLine(l),
      ),
      invoices: this.normalizeInvoices(this.field<unknown>(source, 'invoices')),
      variations: this.normalizeVariations(this.field<unknown>(source, 'variations')),
      overBudgetTasks: (this.field<unknown[]>(source, 'overBudgetTasks') ?? []).map((t) =>
        this.normalizeOverBudgetTask(t),
      ),
      boq: this.normalizeBoq(this.field<unknown>(source, 'boq')),
      recentActivity: (this.field<unknown[]>(source, 'recentActivity') ?? []).map((e) =>
        this.normalizeLedgerRow(e),
      ),
    };
  }

  private normalizeBudget(source: unknown): ProjectFinanceBudgetSummary {
    const actualBudget = this.field<number | string | null>(source, 'actualBudget');
    return {
      estimatedBudget: this.money(source, 'estimatedBudget'),
      approvedAdjustments: this.money(source, 'approvedAdjustments'),
      effectiveCap: this.money(source, 'effectiveCap'),
      // Distinct from 0: the server sends literal null today. Preserve it.
      actualBudget:
        actualBudget === null || actualBudget === undefined ? null : this.decimalOf(actualBudget),
      totalAllocated: this.money(source, 'totalAllocated'),
      totalCommitted: this.money(source, 'totalCommitted'),
      totalActual: this.money(source, 'totalActual'),
      totalAvailable: this.money(source, 'totalAvailable'),
    };
  }

  private normalizeCollection(source: unknown): ProjectFinanceCollectionSummary {
    return {
      totalClientPayments: this.money(source, 'totalClientPayments'),
      collectionPercentOfEstimatedBudget: this.money(source, 'collectionPercentOfEstimatedBudget'),
      stages: (this.field<unknown[]>(source, 'stages') ?? []).map((s) => this.normalizeStage(s)),
    };
  }

  private normalizeStage(source: unknown): ProjectFinanceStageFunding {
    return {
      stageId: this.field<string>(source, 'stageId') ?? '',
      name: this.field<string>(source, 'name') ?? '',
      requiredBudget: this.money(source, 'requiredBudget'),
      clientPaidAmount: this.money(source, 'clientPaidAmount'),
      isFunded: this.field<boolean>(source, 'isFunded') ?? false,
    };
  }

  private normalizeEarnings(source: unknown): ProjectFinanceEarningsSummary {
    return {
      totalIn: this.money(source, 'totalIn'),
      totalOut: this.money(source, 'totalOut'),
      net: this.money(source, 'net'),
      marginPercent: this.money(source, 'marginPercent'),
    };
  }

  private normalizeBudgetLine(source: unknown): ProjectFinanceBudgetLine {
    return {
      budgetLineId: this.field<string>(source, 'budgetLineId') ?? '',
      costCategoryId: this.field<string | null>(source, 'costCategoryId') ?? null,
      costCategoryName: this.field<string | null>(source, 'costCategoryName') ?? null,
      budgetLineName: this.field<string>(source, 'budgetLineName') ?? '',
      allocated: this.money(source, 'allocated'),
      adjustment: this.money(source, 'adjustment'),
      committed: this.money(source, 'committed'),
      actual: this.money(source, 'actual'),
      available: this.money(source, 'available'),
    };
  }

  private normalizeInvoices(source: unknown): ProjectFinanceInvoiceSummary {
    return {
      totalCount: this.field<number>(source, 'totalCount') ?? 0,
      totalOutstanding: this.money(source, 'totalOutstanding'),
      byStatus: (this.field<unknown[]>(source, 'byStatus') ?? []).map(
        (b): ProjectFinanceInvoiceStatusBucket => ({
          status: this.field<string>(b, 'status') ?? '',
          count: this.field<number>(b, 'count') ?? 0,
          total: this.money(b, 'total'),
        }),
      ),
    };
  }

  private normalizeVariations(source: unknown): ProjectFinanceVariationSummary {
    return {
      totalCount: this.field<number>(source, 'totalCount') ?? 0,
      signedClientDifferenceTotal: this.money(source, 'signedClientDifferenceTotal'),
      byKindAndStatus: (this.field<unknown[]>(source, 'byKindAndStatus') ?? []).map(
        (b): ProjectFinanceVariationBucket => ({
          kind: this.field<string>(b, 'kind') ?? '',
          status: this.field<string>(b, 'status') ?? '',
          count: this.field<number>(b, 'count') ?? 0,
          total: this.money(b, 'total'),
        }),
      ),
    };
  }

  private normalizeOverBudgetTask(source: unknown): ProjectFinanceOverBudgetTask {
    return {
      taskId: this.field<string>(source, 'taskId') ?? '',
      name: this.field<string>(source, 'name') ?? '',
      allocated: this.money(source, 'allocated'),
      actual: this.money(source, 'actual'),
      overrun: this.money(source, 'overrun'),
    };
  }

  /** `BoqSummary?` — absent for a project with no snapshot. */
  private normalizeBoq(source: unknown): ProjectFinanceBoqSummary | null {
    if (source === null || source === undefined || typeof source !== 'object') return null;
    return {
      snapshotId: this.field<string>(source, 'snapshotId') ?? '',
      version: this.field<number>(source, 'version') ?? 0,
      generatedAt: this.field<string>(source, 'generatedAt') ?? '',
      budgetedTotal: this.money(source, 'budgetedTotal'),
      purchaseTotal: this.money(source, 'purchaseTotal'),
      differenceTotal: this.money(source, 'differenceTotal'),
      actualTotal: this.money(source, 'actualTotal'),
    };
  }

  private normalizeLedgerRow(source: unknown): ProjectFinanceLedgerRow {
    const direction = this.field<string>(source, 'direction');
    const type = this.field<string>(source, 'type');
    return {
      ledgerEntryId: this.field<string>(source, 'ledgerEntryId') ?? '',
      // DateOnly serialises as "yyyy-MM-dd"; kept as the raw string.
      occurredOn: this.field<string>(source, 'occurredOn') ?? '',
      direction: direction === 'Out' ? 'Out' : 'In',
      type: type === 'Commitment' || type === 'ClientPayment' ? type : 'ActualCost',
      amount: this.money(source, 'amount'),
      clientId: this.field<string | null>(source, 'clientId') ?? null,
      vendorName: this.field<string | null>(source, 'vendorName') ?? null,
      reference: this.field<string | null>(source, 'reference') ?? null,
    };
  }

  /** `field` + `decimalOf` — the only way a money value enters the model. */
  private money(source: unknown, ...keys: string[]): string {
    return this.decimalOf(this.field<unknown>(source, ...keys));
  }

  /**
   * Canonical decimal STRING for a wire `decimal` (a JSON number).
   *
   * `String(1234.5)` → `"1234.5"`, which `MoneyService.parse`'s
   * `/^([+-]?)(\d+)(?:\.(\d+))?$/` accepts — but `String()` switches to exponent
   * notation for |v| < 1e-6, and that regex REJECTS `"5.7e-7"`, silently degrading
   * every downstream `format`, `compare` and `add` to `—` / `0`. `toFixed(4)` never
   * emits an exponent below 1e21, and 4 fractional digits is exactly
   * `decimal(19,4)`'s scale, so it is lossless for money. Percentages
   * (`marginPercent`, `collectionPercentOfEstimatedBudget`) are .NET decimal
   * DIVISIONS and can carry 20+ significant digits — those are the real exponent
   * risk here, and they round harmlessly (they render at 1 dp).
   *
   * Trailing zeros are stripped so `pera-currency` keeps its "render the digits
   * the server sent, minimum two" behaviour instead of forcing 4 dp everywhere.
   *
   * |v| >= 1e21 is unreachable from a `decimal(19,4)` column (max ~9.99e14); were
   * it ever to occur, `toFixed` falls back to exponent and the value renders as
   * `—` rather than as a wrong number.
   *
   * DO NOT replace this with `String(value ?? 0)` — that reintroduces the
   * exponent-notation failure mode this comment describes.
   */
  private decimalOf(value: unknown): string {
    if (value === null || value === undefined || value === '') return '0';
    if (typeof value === 'string') return value.trim();
    if (typeof value !== 'number' || !Number.isFinite(value)) return '0';
    return value
      .toFixed(4)
      .replace(/(\.\d*?)0+$/, '$1')
      .replace(/\.$/, '');
  }
}
