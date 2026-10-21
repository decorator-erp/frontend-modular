/**
 * The app-facing paged envelope. Canonical: every paged service normalizes onto this
 * shape, whatever the wire sends (`pageIndex`, `skip`/`take`, cursors).
 *
 * `page` is 1-BASED. Services that receive a 0-based `pageIndex` convert on the way in
 * (see `NotificationService.normalize()` and `CrmApprovalsService.normalizePage()`).
 * `pageSize` is echoed from the request when the response omits it.
 */
export interface PagedResult<T> {
  items: T[];
  totalCount: number;
  page: number;
  pageSize: number;
  totalPages: number;
  /** Optional opaque cursor for cursor-based pagination (null when exhausted). */
  nextCursor?: string | null;
}

/** Convenience: empty result for store initial state. */
export function emptyPage<T>(): PagedResult<T> {
  return { items: [], totalCount: 0, page: 1, pageSize: 0, totalPages: 0 };
}

/** Standard query parameters for paged list endpoints. */
export interface PageRequest {
  page?: number;
  pageSize?: number;
  sortBy?: string;
  sortDir?: 'asc' | 'desc';
  search?: string;
}

/** Build URL query string from PageRequest, skipping undefined values. */
export function pageRequestToParams(req: PageRequest): Record<string, string> {
  const out: Record<string, string> = {};
  if (req.page !== undefined) out['page'] = String(req.page);
  if (req.pageSize !== undefined) out['pageSize'] = String(req.pageSize);
  if (req.sortBy) out['sortBy'] = req.sortBy;
  if (req.sortDir) out['sortDir'] = req.sortDir;
  if (req.search) out['q'] = req.search;
  return out;
}
