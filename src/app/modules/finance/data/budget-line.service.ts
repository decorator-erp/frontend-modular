import { Injectable } from '@angular/core';
import { Observable } from 'rxjs';
import { map } from 'rxjs/operators';
import {
  BudgetLineResponse,
  CreateBudgetLineRequest,
  UpdateBudgetLineAllocationRequest,
} from '../model/budget-line.model';
import { ApiService } from '@platform/http/api.service';

/**
 * Budget lines — `api-docs/11-finance.md` Section 2.
 *
 * `Finance.ManageBudget` for writes; `Finance.Read` for reads.
 */
@Injectable({ providedIn: 'root' })
export class BudgetLineService extends ApiService {
  create(req: CreateBudgetLineRequest): Observable<string> {
    return this.post<unknown>('/budget-lines', req).pipe(map((r) => this.unwrap<string>(r)));
  }

  updateAllocation(id: string, req: UpdateBudgetLineAllocationRequest): Observable<unknown> {
    return this.put(`/budget-lines/${id}/allocation`, req);
  }

  /** Rebuild `committedAmount` / `actualAmount` from the ledger. */
  recalculate(id: string): Observable<unknown> {
    return this.post(`/budget-lines/${id}/recalculate`, {});
  }

  getById(id: string): Observable<BudgetLineResponse> {
    return this.get<unknown>(`/budget-lines/${id}`).pipe(
      map((r) => this.unwrap<BudgetLineResponse>(r)),
    );
  }

  getByProject(projectId: string): Observable<BudgetLineResponse[]> {
    return this.get<unknown>(`/budget-lines/by-project/${projectId}`).pipe(
      map((r) => this.unwrapArray<BudgetLineResponse>(r)),
    );
  }
}
