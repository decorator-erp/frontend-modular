import { HttpClient, HttpContext, HttpParams } from '@angular/common/http';
import { inject, isDevMode } from '@angular/core';
import { Observable } from 'rxjs';
import { environment } from '../../../environments/environment';

/** Module-scoped — every `ApiService` subclass shares one counter, so keys never collide. */
let trackKeyCounter = 0;

/**
 * Case-insensitive field read off a loosely-typed wire object, trying each key in turn.
 *
 * Standalone so normalizers that are shared between services (see `normalizeClient`)
 * can use it without a class instance; `ApiService.field` is the in-class alias.
 */
export function readField<T>(source: unknown, ...keys: string[]): T | undefined {
  const value = source as Record<string, unknown> | null;
  if (!value || typeof value !== 'object') return undefined;
  for (const key of keys) {
    if (key in value) return value[key] as T;
    const match = Object.keys(value).find(
      (existing) => existing.toLowerCase() === key.toLowerCase(),
    );
    if (match) return value[match] as T;
  }
  return undefined;
}

export abstract class ApiService {
  protected readonly http = inject(HttpClient);
  protected readonly base = environment.apiUrl;

  // `options.context` carries per-request flags such as `handled(403)` (spec 002c).
  protected get<T>(
    path: string,
    params?: Record<string, unknown>,
    options?: { context?: HttpContext },
  ): Observable<T> {
    return this.http.get<T>(`${this.base}${path}`, {
      params: this.toParams(params),
      context: options?.context,
    });
  }

  protected post<T>(
    path: string,
    body: unknown,
    options?: { context?: HttpContext },
  ): Observable<T> {
    return this.http.post<T>(`${this.base}${path}`, body, { context: options?.context });
  }

  protected put<T>(
    path: string,
    body: unknown,
    options?: { context?: HttpContext },
  ): Observable<T> {
    return this.http.put<T>(`${this.base}${path}`, body, { context: options?.context });
  }

  protected delete<T>(
    path: string,
    body?: unknown,
    options?: { context?: HttpContext },
  ): Observable<T> {
    return body === undefined
      ? this.http.delete<T>(`${this.base}${path}`, { context: options?.context })
      : this.http.request<T>('DELETE', `${this.base}${path}`, { body, context: options?.context });
  }

  protected unwrap<T = unknown>(response: unknown): T {
    const value = response as Record<string, unknown> | null;
    if (value && typeof value === 'object') {
      if ('value' in value) return value['value'] as T;
      if ('Value' in value) return value['Value'] as T;
      if ('result' in value) return value['result'] as T;
      if ('Result' in value) return value['Result'] as T;
    }
    return response as T;
  }

  protected unwrapArray<T = unknown>(response: unknown): T[] {
    const unwrapped = this.unwrap<unknown>(response);
    const value = unwrapped as Record<string, unknown> | null;
    if (Array.isArray(unwrapped)) return unwrapped as T[];
    if (value && typeof value === 'object') {
      if (Array.isArray(value['items'])) return value['items'] as T[];
      if (Array.isArray(value['Items'])) return value['Items'] as T[];
      if (Array.isArray(value['data'])) return value['data'] as T[];
      if (Array.isArray(value['Data'])) return value['Data'] as T[];
    }
    return [];
  }

  protected field<T>(source: unknown, ...keys: string[]): T | undefined {
    return readField<T>(source, ...keys);
  }

  /**
   * A render-only key for a row that becomes an Angular `@for` track expression.
   *
   * A missing id must NEVER collapse to `''`: three such rows in one list is an NG0955
   * crash that takes the whole view down. Return a unique synthetic key so the list
   * still renders, and say so loudly in dev — a row with no identity is a contract bug,
   * not a display quirk.
   *
   * NEVER assign this to a domain id field. It is not an identifier: sending it to the
   * server or putting it in a URL turns a visible crash into a silent dead action.
   *
   * NOT STABLE ACROSS REFETCHES — the counter mints fresh keys on every normalize()
   * pass, so a poll or refresh re-keys affected rows and Angular rebuilds them.
   * Harmless on a load-once dashboard; documented so nobody debugs the flicker later.
   */
  protected trackKeyFor(source: unknown, context: string, ...keys: string[]): string {
    const value = this.field<string>(source, ...keys);
    if (value) return value;
    if (isDevMode()) console.warn(`[api] ${context}: no identity from ${keys.join(' | ')}`, source);
    return `__no-id:${context}:${++trackKeyCounter}`;
  }

  private toParams(params?: Record<string, unknown>): HttpParams | undefined {
    if (!params) {
      return undefined;
    }

    let httpParams = new HttpParams();
    Object.entries(params).forEach(([key, value]) => {
      if (value !== undefined && value !== null && value !== '') {
        httpParams = httpParams.set(key, String(value));
      }
    });
    return httpParams;
  }
}
