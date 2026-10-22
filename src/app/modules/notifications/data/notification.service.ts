import { Injectable } from '@angular/core';
import { map, Observable } from 'rxjs';
import { NotificationResponse } from '../model/notification.model';
import { PagedResult } from '@platform/types/paged-result';
import { ApiService } from '@platform/http/api.service';

/**
 * Notification REST reads/writes for the current user. Caller-scoped, RFC7807 errors flow through
 * the shared interceptor. This service is the ONLY place aware that the list endpoint's `page` is
 * **0-based** (every other list in the app is 1-based) — Principle VI: the quirk never escapes here.
 */
@Injectable({ providedIn: 'root' })
export class NotificationService extends ApiService {
  /** Paginated list, newest-first. Callers pass the app's usual 1-based page; we send `page - 1`. */
  list(
    uiPage = 1,
    pageSize = 20,
    unreadOnly?: boolean,
  ): Observable<PagedResult<NotificationResponse>> {
    return this.get<unknown>('/notifications', {
      page: uiPage - 1, // 0-BASED wire quirk — quarantined
      pageSize,
      unreadOnly: unreadOnly ? true : undefined,
    }).pipe(map((r) => this.normalize(r, pageSize)));
  }

  /** Current unread total. Used for the initial badge paint and the reconnect resync. */
  unreadCount(): Observable<number> {
    return this.get<unknown>('/notifications/unread-count').pipe(
      map((r) => this.unwrap<number>(r)),
    );
  }

  /** Mark one notification read (204). */
  markRead(id: string): Observable<void> {
    return this.put<void>(`/notifications/${id}/read`, {});
  }

  /** Mark all of the caller's notifications read (204). */
  markAllRead(): Observable<void> {
    return this.put<void>('/notifications/read-all', {});
  }

  /** Map the wire response onto the app's `PagedResult` (1-based `page`), converting the
   *  0-based wire index. The response does not carry `pageSize`, so we echo the request's. */
  private normalize(response: unknown, pageSize: number): PagedResult<NotificationResponse> {
    const value = this.unwrap<Record<string, unknown>>(response);
    const items = this.unwrapArray<NotificationResponse>(
      this.field<unknown>(value, 'items') ?? value,
    );
    const wireIndex = this.field<number>(value, 'pageIndex', 'page') ?? 0; // 0-based
    return {
      items,
      totalCount: this.field<number>(value, 'totalCount') ?? items.length,
      page: wireIndex + 1, // → app 1-based
      pageSize: this.field<number>(value, 'pageSize') ?? pageSize,
      totalPages: this.field<number>(value, 'totalPages') ?? 0,
    };
  }
}
