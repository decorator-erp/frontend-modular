import { Injectable } from '@angular/core';
import { Observable } from 'rxjs';
import { map } from 'rxjs/operators';
import { ActivityPagedResult, ActivityQueryParams, ActivityResponse } from '../model/audit.model';
import { ApiService } from '@platform/http/api.service';

/**
 * Activity feed reads. Backend exposes three convenience endpoints:
 *   - `GET /api/activities/entity/{entityName}/{entityId}`     ← timeline for one entity
 *   - `GET /api/activities`                                    ← global feed (filtered)
 *   - `GET /api/projects/{projectId}/activities`               ← project-scoped feed
 *
 * Permission: `Activities.Read`.
 */
@Injectable({ providedIn: 'root' })
export class ActivityService extends ApiService {
  /** Per-entity timeline (e.g., a single Task/Stage/Project). */
  getEntityTimeline(
    entityName: string,
    entityId: string,
    params: { page?: number; pageSize?: number } = {},
  ): Observable<ActivityPagedResult> {
    return this.get<unknown>(`/activities/entity/${entityName}/${entityId}`, {
      page: params.page ?? 1,
      pageSize: params.pageSize ?? 50,
    }).pipe(map((r) => this.normalize(r)));
  }

  /** Global activity feed with filters. */
  getFeed(params: ActivityQueryParams = {}): Observable<ActivityPagedResult> {
    return this.get<unknown>('/activities', { ...params }).pipe(map((r) => this.normalize(r)));
  }

  /** Project-scoped activity feed. */
  getProjectFeed(
    projectId: string,
    params: ActivityQueryParams = {},
  ): Observable<ActivityPagedResult> {
    return this.get<unknown>(`/projects/${projectId}/activities`, { ...params }).pipe(
      map((r) => this.normalize(r)),
    );
  }

  private normalize(response: unknown): ActivityPagedResult {
    const value = this.unwrap<Record<string, unknown>>(response);
    const items = this.unwrapArray(this.field<unknown>(value, 'items') ?? value).map((entry) =>
      this.normalizeOne(entry),
    );
    return {
      items,
      totalCount: this.field<number>(value, 'totalCount') ?? items.length,
      page: this.field<number>(value, 'page') ?? 1,
      pageSize: this.field<number>(value, 'pageSize') ?? items.length,
      totalPages: this.field<number>(value, 'totalPages') ?? 1,
    };
  }

  private normalizeOne(source: unknown): ActivityResponse {
    return {
      id: this.field<string>(source, 'id') ?? '',
      actorUserId: this.field<string | null>(source, 'actorUserId') ?? null,
      actorName: this.field<string | null>(source, 'actorName') ?? null,
      action: this.field<string>(source, 'action') ?? '',
      entityName: this.field<string>(source, 'entityName') ?? '',
      entityId: this.field<string | null>(source, 'entityId') ?? null,
      entityDisplayName: this.field<string | null>(source, 'entityDisplayName') ?? null,
      projectId: this.field<string | null>(source, 'projectId') ?? null,
      message: this.field<string>(source, 'message') ?? '',
      occurredAt: this.field<string>(source, 'occurredAt') ?? '',
    };
  }
}
