import { Injectable } from '@angular/core';
import { Observable } from 'rxjs';
import { map } from 'rxjs/operators';
import { ApiService } from '@platform/http/api.service';
import { handled } from '@platform/http/handled-errors';
import {
  ConfirmScopeOfWorkResponse,
  ScopeOfWork,
  ScopeOfWorkItem,
  ScopeOfWorkStatus,
  UpdateScopeOfWorkHeaderRequest,
  UpdateScopeOfWorkItemRequest,
} from '../model/scope-of-work.model';

/**
 * The project's scope of work — `/api/projects/{projectId}/scope-of-work`
 * (`Projects.Infrastructure/Endpoints/ScopeOfWorkEndpoints.cs`, CRM-API-CONTRACT §2.16).
 * One method per route (#95–#102). Office only; every route is project-scoped, so an
 * unreachable or inactive project is a 404 `projects.NotFound`.
 */
@Injectable({ providedIn: 'root' })
export class ScopeOfWorkService extends ApiService {
  /** #95 `GET` → `ScopeOfWorkResponse`. Never creates a row: `id` is null when none is saved. */
  getScope(projectId: string): Observable<ScopeOfWork> {
    return this.get<unknown>(this.path(projectId)).pipe(
      map((r) => this.normalizeScope(r, projectId)),
    );
  }

  /** #96 `PUT` → 204. A full replace of the header; creates the Draft on first save. */
  updateHeader(projectId: string, req: UpdateScopeOfWorkHeaderRequest): Observable<void> {
    return this.put<void>(this.path(projectId), req);
  }

  /** #97 `POST …/items { sourceStageIds }` → 200, the added items. Template **stage** ids. */
  addItems(projectId: string, sourceStageIds: string[]): Observable<ScopeOfWorkItem[]> {
    return this.post<unknown>(`${this.path(projectId)}/items`, { sourceStageIds }).pipe(
      map((r) => this.unwrapArray(r).map((i) => this.normalizeItem(i))),
    );
  }

  /** #98 `POST …/items/from-template/{id}` (no body) → 200; stages already picked are skipped. */
  addFromTemplate(projectId: string, stageTemplateId: string): Observable<ScopeOfWorkItem[]> {
    return this.post<unknown>(
      `${this.path(projectId)}/items/from-template/${stageTemplateId}`,
      null,
    ).pipe(map((r) => this.unwrapArray(r).map((i) => this.normalizeItem(i))));
  }

  /** #99 `PUT …/items/order { itemIds }` → 204. The **full** new order, each item once. */
  reorder(projectId: string, itemIds: string[]): Observable<void> {
    return this.put<void>(`${this.path(projectId)}/items/order`, { itemIds });
  }

  /** #100 `PUT …/items/{itemId} { name, description, fee }` → 204. */
  updateItem(
    projectId: string,
    itemId: string,
    req: UpdateScopeOfWorkItemRequest,
  ): Observable<void> {
    return this.put<void>(`${this.path(projectId)}/items/${itemId}`, req);
  }

  /** #101 `DELETE …/items/{itemId}` → 204; the server renumbers the rest. */
  removeItem(projectId: string, itemId: string): Observable<void> {
    return this.delete<void>(`${this.path(projectId)}/items/${itemId}`);
  }

  /**
   * #102 `POST …/confirm` (no body) → 200 `{ createdStageIds }`. 403 `projects.AccessDenied`
   * (the caller is not an HR employee) is shown by the page, so no global toast (B14).
   */
  confirm(projectId: string): Observable<ConfirmScopeOfWorkResponse> {
    return this.post<unknown>(`${this.path(projectId)}/confirm`, null, {
      context: handled(403),
    }).pipe(
      map((r) => ({
        createdStageIds: (this.field<string[]>(r, 'createdStageIds') ?? []).map(String),
      })),
    );
  }

  private path(projectId: string): string {
    return `/projects/${projectId}/scope-of-work`;
  }

  private normalizeScope(raw: unknown, projectId: string): ScopeOfWork {
    const s = this.unwrap<unknown>(raw);
    return {
      id: this.field<string | null>(s, 'id') ?? null,
      projectId: this.field<string>(s, 'projectId') ?? projectId,
      status:
        Number(this.field(s, 'status')) === ScopeOfWorkStatus.Confirmed
          ? ScopeOfWorkStatus.Confirmed
          : ScopeOfWorkStatus.Draft,
      durationDays: this.numberOrNull(this.field(s, 'durationDays')),
      plannedStartDate: this.field<string | null>(s, 'plannedStartDate') ?? null,
      estimatedEndDate: this.field<string | null>(s, 'estimatedEndDate') ?? null,
      subtotal: Number(this.field(s, 'subtotal') ?? 0),
      adjustmentAmount: Number(this.field(s, 'adjustmentAmount') ?? 0),
      adjustmentNote: this.field<string | null>(s, 'adjustmentNote') ?? null,
      total: Number(this.field(s, 'total') ?? 0),
      notes: this.field<string | null>(s, 'notes') ?? null,
      confirmedAtUtc: this.field<string | null>(s, 'confirmedAtUtc') ?? null,
      confirmedById: this.field<string | null>(s, 'confirmedById') ?? null,
      items: (this.field<unknown[]>(s, 'items') ?? [])
        .map((i) => this.normalizeItem(i))
        .sort((a, b) => a.order - b.order),
      canConfirm: this.field<boolean>(s, 'canConfirm') ?? false,
      blockingReason: this.field<string | null>(s, 'blockingReason') ?? null,
    };
  }

  private normalizeItem(i: unknown): ScopeOfWorkItem {
    return {
      id: this.field<string>(i, 'id') ?? '',
      sourceStageId: this.field<string>(i, 'sourceStageId') ?? '',
      sourceTemplateName: this.field<string | null>(i, 'sourceTemplateName') ?? null,
      name: this.field<string>(i, 'name') ?? '',
      description: this.field<string | null>(i, 'description') ?? null,
      order: Number(this.field(i, 'order') ?? 0),
      fee: Number(this.field(i, 'fee') ?? 0),
      createdStageId: this.field<string | null>(i, 'createdStageId') ?? null,
      sourceMissing: this.field<boolean>(i, 'sourceMissing') ?? false,
    };
  }

  private numberOrNull(v: unknown): number | null {
    return v === null || v === undefined ? null : Number(v);
  }
}
