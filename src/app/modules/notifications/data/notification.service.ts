import { Injectable } from '@angular/core';
import { map, Observable } from 'rxjs';
import { NotificationResponse } from '../model/notification.model';
import { PagedResult } from '@platform/types/paged-result';
import { ApiService } from '@platform/http/api.service';

/**
 * Notification REST reads/writes for the current user. Caller-scoped, RFC7807 errors flow through
 * the shared interceptor. Sync W1-9: the list takes a 1-based `pageNumber` and answers a
 * `PagedResult` `{ items, pageNumber, pageSize, totalCount, totalPages }` (dms NotificationEndpoints.cs:30,
 * BuildingBlocks/Pagination/PagedResult.cs). The old 0-based `page`/`pageIndex` quirk is gone; an old
 * `pageIndex` response still reads (+1).
 */
@Injectable({ providedIn: 'root' })
export class NotificationService extends ApiService {
  /** Paginated list, newest-first. Callers pass the app's usual 1-based page, sent as `pageNumber`. */
  list(
    uiPage = 1,
    pageSize = 20,
    unreadOnly?: boolean,
  ): Observable<PagedResult<NotificationResponse>> {
    return this.get<unknown>('/notifications', {
      pageNumber: uiPage,
      pageSize,
      unreadOnly: unreadOnly ? true : undefined,
    }).pipe(map((r) => this.normalize(r, uiPage, pageSize)));
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

  /** Map the wire `PagedResult` onto the app's (1-based `page`); missing fields echo the request. */
  private normalize(
    response: unknown,
    uiPage: number,
    pageSize: number,
  ): PagedResult<NotificationResponse> {
    const value = this.unwrap<Record<string, unknown>>(response);
    const items = this.unwrapArray<NotificationResponse>(
      this.field<unknown>(value, 'items') ?? value,
    );
    const pageNumber = this.field<number>(value, 'pageNumber');
    const pageIndex = this.field<number>(value, 'pageIndex'); // legacy 0-based
    return {
      items,
      totalCount: this.field<number>(value, 'totalCount') ?? items.length,
      page: pageNumber ?? (pageIndex !== undefined ? pageIndex + 1 : uiPage),
      pageSize: this.field<number>(value, 'pageSize') ?? pageSize,
      totalPages: this.field<number>(value, 'totalPages') ?? 0,
    };
  }
}
