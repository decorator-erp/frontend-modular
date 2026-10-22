import { HttpContext, HttpContextToken } from '@angular/common/http';

/**
 * Statuses the caller handles itself — `errorInterceptor` shows no global toast for them (spec
 * 002c). The error is still re-thrown; only the generic message is suppressed. Unmarked requests
 * keep the global policy.
 */
export const HANDLED_ERROR_STATUSES = new HttpContextToken<readonly number[]>(() => []);

/**
 * Mark statuses as handled by the call site: `this.get(url, params, { context: handled(403) })`.
 * Mark only a status the caller turns into its own message or a deliberate fallback.
 */
export function handled(...statuses: number[]): HttpContext {
  return new HttpContext().set(HANDLED_ERROR_STATUSES, statuses);
}
