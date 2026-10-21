import { Observable, throwError } from 'rxjs';
import { catchError, shareReplay } from 'rxjs/operators';

/**
 * A tiny server-state cache for a single query.
 *
 * Wraps an Observable factory so that:
 *  - concurrent and subsequent subscribers share ONE in-flight request and its
 *    last result (`shareReplay`), instead of every component re-fetching on init;
 *  - the cached value is treated as stale after `ttlMs` and re-fetched lazily;
 *  - `invalidate()` drops the cache so the next `get()` re-fetches (call this
 *    after a mutation that changes the underlying data);
 *  - errors are NOT cached — a failed request clears the cache so the next
 *    subscriber retries rather than replaying the error forever.
 *
 * Intended for slow-changing reference data (departments, roles, permission
 * catalog, cost categories). Not a general HTTP cache and not request-scoped:
 * one instance == one logical query.
 */
export class CachedQuery<T> {
  private cache$: Observable<T> | null = null;
  private fetchedAt = 0;

  constructor(
    private readonly factory: () => Observable<T>,
    private readonly ttlMs = 5 * 60_000,
  ) {}

  get(): Observable<T> {
    const now = Date.now();
    if (!this.cache$ || now - this.fetchedAt > this.ttlMs) {
      this.fetchedAt = now;
      this.cache$ = this.factory().pipe(
        catchError((err) => {
          // Don't cache failures — let the next caller retry.
          this.invalidate();
          return throwError(() => err);
        }),
        shareReplay({ bufferSize: 1, refCount: false }),
      );
    }
    return this.cache$;
  }

  invalidate(): void {
    this.cache$ = null;
    this.fetchedAt = 0;
  }
}
