import { Injectable, inject } from '@angular/core';
import { Observable, of } from 'rxjs';
import { catchError, map, switchMap } from 'rxjs/operators';
import { CostCategoryService } from './cost-category.service';
import {
  BudgetLineResponse,
  CreateBudgetLineRequest,
  UpdateBudgetLineAllocationRequest,
} from '../model/budget-line.model';
import { ApiService } from '@platform/http/api.service';

/**
 * A budget line's picker label: "Category — Name", or just the name when the category is unknown
 * (sync W2-1: never "undefined — Name").
 */
export function budgetLineLabel(l: Pick<BudgetLineResponse, 'name' | 'costCategoryName'>): string {
  return l.costCategoryName ? `${l.costCategoryName} — ${l.name}` : l.name;
}

/**
 * Budget lines — `api-docs/11-finance.md` Section 2.
 *
 * `Finance.ManageBudget` for writes; `Finance.Read` for reads.
 */
@Injectable({ providedIn: 'root' })
export class BudgetLineService extends ApiService {
  private readonly categories = inject(CostCategoryService);
  create(req: CreateBudgetLineRequest): Observable<string> {
    return this.post<unknown>('/budget-lines', req).pipe(map((r) => this.unwrap<string>(r)));
  }

  updateAllocation(id: string, req: UpdateBudgetLineAllocationRequest): Observable<unknown> {
    return this.put(`/budget-lines/${id}/allocation`, req);
  }

  /** Rebuild `committedAmount` / `actualAmount` from the ledger — `PUT` (BudgetLineEndpoints.cs:70). */
  recalculate(id: string): Observable<unknown> {
    return this.put(`/budget-lines/${id}/recalculate`, {});
  }

  getById(id: string): Observable<BudgetLineResponse> {
    return this.get<unknown>(`/budget-lines/${id}`).pipe(
      map((r) => [this.unwrap<unknown>(r)]),
      switchMap((rows) => this.withCategoryNames(rows)),
      map((rows) => rows[0]),
    );
  }

  getByProject(projectId: string): Observable<BudgetLineResponse[]> {
    return this.get<unknown>(`/budget-lines/by-project/${projectId}`).pipe(
      map((r) => this.unwrapArray<unknown>(r)),
      switchMap((rows) => this.withCategoryNames(rows)),
    );
  }

  /**
   * Sync W2-1 (backend S5): budget-line responses carry `costCategoryName`. When a row lacks it (an
   * older backend, or a null), the name is joined from the cost-category list — read once, and only
   * when needed. A failed or missing lookup leaves the name '' (never `undefined`).
   */
  private withCategoryNames(rows: unknown[]): Observable<BudgetLineResponse[]> {
    const named = (r: unknown) => !!this.field<string>(r, 'costCategoryName');
    if (rows.every(named)) return of(rows.map((r) => this.normalizeLine(r, null)));
    return this.categories.getAll({ pageSize: 500 }).pipe(
      map((page) => new Map(page.items.map((c) => [c.id, c.name]))),
      catchError(() => of(new Map<string, string>())),
      map((names) => rows.map((r) => this.normalizeLine(r, names))),
    );
  }

  private normalizeLine(source: unknown, names: Map<string, string> | null): BudgetLineResponse {
    const row = (source ?? {}) as BudgetLineResponse;
    const categoryId = this.field<string>(source, 'costCategoryId') ?? '';
    return {
      ...row,
      costCategoryId: categoryId,
      costCategoryName:
        this.field<string>(source, 'costCategoryName') || names?.get(categoryId) || '',
    };
  }
}
