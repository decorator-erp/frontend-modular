import { Injectable, inject } from '@angular/core';
import { Observable } from 'rxjs';
import { map } from 'rxjs/operators';
import { ApiService } from '@platform/http/api.service';
import { ProjectService } from './project.service';
import { Project, ProjectStatus, WorkflowType } from '../model/project.model';

/** ProjectResponse + the `code` field core/models drops. */
export interface ProjectWithCode extends Project {
  code: string;
  estimatedStartDate: string | null;
  estimatedEndDate: string | null;
}

export interface ProjectSearchQuery {
  searchTerm?: string;
  status?: ProjectStatus;
  workflowType?: WorkflowType;
  clientId?: string;
  sortBy?: string;
  sortDir?: 'asc' | 'desc';
  page?: number;
  pageSize?: number;
}

/**
 * The uniform, **1-based** paged shape — the same field names as `PagedResult<T>`.
 *
 * `/projects/search` answers with a **0-based `pageIndex`**, matching the live
 * contract already documented on `/cost-categories` and `/notifications`. That
 * quirk is normalised here so it never reaches a component: `pera-data-table`
 * and `pera-pagination` both speak 1-based pages.
 */
export interface ProjectSearchResult {
  items: ProjectWithCode[];
  totalCount: number;
  page: number;
  pageSize: number;
  totalPages: number;
}

/** Server-side project search (`/projects/search`) — term/status/type/client + sort + paging. */
@Injectable({ providedIn: 'root' })
export class ProjectSearchService extends ApiService {
  private readonly projects = inject(ProjectService);

  /** Single project including the `code` field that core/models drops. */
  byId(id: string): Observable<ProjectWithCode> {
    return this.get<unknown>(`/projects/${id}`).pipe(map((r) => this.withCode(this.unwrap(r))));
  }

  search(q: ProjectSearchQuery = {}): Observable<ProjectSearchResult> {
    const params: Record<string, unknown> = {
      pageNumber: q.page ?? 1,
      pageSize: q.pageSize ?? 20,
    };
    if (q.searchTerm) params['searchTerm'] = q.searchTerm;
    if (q.status) params['status'] = this.projects.statusInt(q.status);
    if (q.workflowType) params['workflowType'] = this.projects.workflowInt(q.workflowType);
    if (q.clientId) params['clientId'] = q.clientId;
    if (q.sortBy) {
      params['sortBy'] = q.sortBy;
      params['sortDir'] = q.sortDir ?? 'asc';
    }
    return this.get<unknown>('/projects/search', params).pipe(
      map((r) => this.normalize(r, q.page ?? 1, q.pageSize ?? 20)),
    );
  }

  withCode(source: unknown): ProjectWithCode {
    return {
      ...this.projects.normalizeProject(source),
      code: this.field<string>(source, 'code') ?? '',
      estimatedStartDate:
        this.field<string | null>(source, 'estimatedStartDate', 'startDate') ?? null,
      estimatedEndDate: this.field<string | null>(source, 'estimatedEndDate', 'endDate') ?? null,
    };
  }

  private normalize(
    response: unknown,
    requestedPage: number,
    requestedPageSize: number,
  ): ProjectSearchResult {
    const value = this.unwrap<Record<string, unknown>>(response);
    const items = this.unwrapArray(this.field<unknown>(value, 'items') ?? value).map((p) =>
      this.withCode(p),
    );
    // `pageIndex` is 0-based on the wire; `page` / `pageNumber` are 1-based.
    // Mirrors CostCategoryService.normalizePage.
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
