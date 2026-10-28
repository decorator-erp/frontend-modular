import { Injectable } from '@angular/core';
import { Observable } from 'rxjs';
import { map } from 'rxjs/operators';
import { ApiService } from '@platform/http/api.service';
import type {
  CostCategoryRow,
  MonthlyCashRow,
  ProjectFinancialSummaryResponse,
} from '../model/project-dashboard-splits.model';

/**
 * Project financial dashboard splits — `/projects/{id}/financial/{summary,
 * by-category,cashflow}` (financial-queries spec).
 *
 * Sibling to `ProjectFinancialDashboardService` (the one-shot
 * `/financial-dashboard` endpoint); this one serves the breakdown queries the
 * summary page composes.
 */
@Injectable({ providedIn: 'root' })
export class ProjectFinancialService extends ApiService {
  summary(projectId: string): Observable<ProjectFinancialSummaryResponse> {
    return this.get<unknown>(`/projects/${projectId}/financial/summary`).pipe(
      map((r) => this.unwrap<ProjectFinancialSummaryResponse>(r)),
    );
  }

  byCategory(projectId: string): Observable<CostCategoryRow[]> {
    return this.get<unknown>(`/projects/${projectId}/financial/by-category`).pipe(
      map((r) => this.unwrapArray<CostCategoryRow>(r)),
    );
  }

  cashflow(
    projectId: string,
    params?: { fromDate?: string; toDate?: string },
  ): Observable<MonthlyCashRow[]> {
    return this.get<unknown>(`/projects/${projectId}/financial/cashflow`, params).pipe(
      map((r) => this.unwrapArray<MonthlyCashRow>(r)),
    );
  }
}
