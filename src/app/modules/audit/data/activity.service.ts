import { Injectable } from '@angular/core';
import { Observable } from 'rxjs';
import { map } from 'rxjs/operators';
import { ActivityPagedResult, ActivityQueryParams, ActivityResponse } from '../model/audit.model';
import { ApiService } from '@platform/http/api.service';

/** `AuditAction` ints (dms BuildingBlocks/Auditing/AuditAction.cs) → the names the feed renders. */
const ACTION: Record<number, string> = { 1: 'Create', 2: 'Update', 3: 'Delete' };

/**
 * Activity feed reads — one route, `GET /api/activities?entityName=&entityId=&projectId=&pageNumber=&pageSize=`
 * (dms `AuditEndpoints.cs` ActivityEndpoints; `PagedResult<ActivityResponse>`, 1-based `pageNumber`, page
 * size clamped to 1..100). The per-entity and per-project paths the old app called do not exist (sync W1-5).
 * Rows: `{ id, actorUserId, actorName, action (AuditAction int), entityName, entityId, entityDisplayName,
 * projectId, message, occurredAtUtc }` (NotificationContracts.cs `ActivityResponse`). The backend writes
 * `entityName` "Project", "ProjectStage" or "ProjectTask".
 *
 * Permission: `activities.read`.
 */
@Injectable({ providedIn: 'root' })
export class ActivityService extends ApiService {
  /** Per-entity timeline (e.g. one ProjectTask / ProjectStage / Project). */
  getEntityTimeline(
    entityName: string,
    entityId: string,
    params: { page?: number; pageSize?: number } = {},
  ): Observable<ActivityPagedResult> {
    return this.get<unknown>('/activities', {
      entityName,
      entityId,
      pageNumber: params.page ?? 1,
      pageSize: params.pageSize ?? 50,
    }).pipe(map((r) => this.normalize(r)));
  }

  /** Activity feed; the backend filters only by project (the other query fields are not sent). */
  getFeed(params: ActivityQueryParams = {}): Observable<ActivityPagedResult> {
    return this.get<unknown>('/activities', {
      projectId: params.projectId,
      pageNumber: params.page ?? 1,
      pageSize: params.pageSize ?? 50,
    }).pipe(map((r) => this.normalize(r)));
  }

  /** Project-scoped activity feed — every row whose `projectId` is this project. */
  getProjectFeed(
    projectId: string,
    params: ActivityQueryParams = {},
  ): Observable<ActivityPagedResult> {
    return this.getFeed({ ...params, projectId });
  }

  private normalize(response: unknown): ActivityPagedResult {
    const value = this.unwrap<Record<string, unknown>>(response);
    const items = this.unwrapArray(this.field<unknown>(value, 'items') ?? value).map((entry) =>
      this.normalizeOne(entry),
    );
    return {
      items,
      totalCount: this.field<number>(value, 'totalCount') ?? items.length,
      page: this.field<number>(value, 'pageNumber', 'page') ?? 1,
      pageSize: this.field<number>(value, 'pageSize') ?? items.length,
      totalPages: this.field<number>(value, 'totalPages') ?? 1,
    };
  }

  /** `AuditAction` (BuildingBlocks AuditAction.cs): 1 Create, 2 Update, 3 Delete; a string passes through. */
  private actionName(v: unknown): string {
    if (typeof v === 'string') return v;
    if (typeof v === 'number') return ACTION[v] ?? String(v);
    return '';
  }

  private normalizeOne(source: unknown): ActivityResponse {
    return {
      id: this.field<string>(source, 'id') ?? '',
      actorUserId: this.field<string | null>(source, 'actorUserId') ?? null,
      actorName: this.field<string | null>(source, 'actorName') ?? null,
      action: this.actionName(this.field<unknown>(source, 'action')),
      entityName: this.field<string>(source, 'entityName') ?? '',
      entityId: this.field<string | null>(source, 'entityId') ?? null,
      entityDisplayName: this.field<string | null>(source, 'entityDisplayName') ?? null,
      projectId: this.field<string | null>(source, 'projectId') ?? null,
      message: this.field<string>(source, 'message') ?? '',
      occurredAt: this.field<string>(source, 'occurredAtUtc', 'occurredAt') ?? '',
    };
  }
}
