import { Injectable } from '@angular/core';
import { Observable } from 'rxjs';
import { map } from 'rxjs/operators';
import {
  CostCategoryResponse,
  CreateCostCategoryRequest,
  UpdateCostCategoryRequest,
} from '../model/cost-category.model';
import { PagedResult } from '@platform/types';
import { ApiService } from '@platform/http/api.service';

/**
 * Cost categories — `api-docs/11-finance.md` Section 1.
 *
 * `Finance.ManageBudget` for writes; `Finance.Read` for reads.
 */
@Injectable({ providedIn: 'root' })
export class CostCategoryService extends ApiService {
  create(req: CreateCostCategoryRequest): Observable<string> {
    return this.post<unknown>('/cost-categories', req).pipe(map((r) => this.unwrap<string>(r)));
  }

  update(id: string, req: UpdateCostCategoryRequest): Observable<unknown> {
    return this.put(`/cost-categories/${id}`, req);
  }

  activate(id: string): Observable<unknown> {
    return this.put(`/cost-categories/${id}/activate`, {});
  }

  deactivate(id: string): Observable<unknown> {
    return this.put(`/cost-categories/${id}/deactivate`, {});
  }

  getById(id: string): Observable<CostCategoryResponse> {
    return this.get<unknown>(`/cost-categories/${id}`).pipe(
      map((r) => this.unwrap<CostCategoryResponse>(r)),
    );
  }

  /**
   * List cost categories.
   *
   * Wire-level note (2026-06-14): `api-docs/11-finance.md` documents
   * `searchTerm`/`pageNumber`/`pageSize` query params, but the deployed
   * backend actually accepts `search`/`skip`/`take` and returns `pageIndex`
   * instead of `pageNumber`. The public surface here keeps the doc names —
   * the translation happens inside this service. Revert when the backend
   * doc catches up.
   */
  getAll(
    opts: { searchTerm?: string; isActive?: boolean; pageNumber?: number; pageSize?: number } = {},
  ): Observable<PagedResult<CostCategoryResponse>> {
    const pageNumber = opts.pageNumber ?? 1;
    const pageSize = opts.pageSize ?? 20;
    return this.get<unknown>('/cost-categories', {
      search: opts.searchTerm,
      isActive: opts.isActive,
      skip: (pageNumber - 1) * pageSize,
      take: pageSize,
    }).pipe(map((r) => this.normalisePaged<CostCategoryResponse>(r, pageNumber, pageSize)));
  }

  private normalisePaged<T>(
    response: unknown,
    requestedPage: number,
    requestedPageSize: number,
  ): PagedResult<T> {
    const value = this.unwrap<Record<string, unknown>>(response);
    const items = this.unwrapArray<T>(this.field<unknown>(value, 'items') ?? value);
    // Backend returns `pageIndex` (0-based) per the live contract; surface a
    // 1-based `page` to keep the rest of the app consistent with `PagedResult`.
    const pageIndex = this.field<number>(value, 'pageIndex');
    const page =
      pageIndex !== undefined
        ? pageIndex + 1
        : (this.field<number>(value, 'page', 'pageNumber') ?? requestedPage);
    return {
      items,
      totalCount: this.field<number>(value, 'totalCount') ?? items.length,
      page,
      pageSize: this.field<number>(value, 'pageSize') ?? requestedPageSize,
      totalPages: this.field<number>(value, 'totalPages') ?? 1,
    };
  }
}
