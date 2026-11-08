import { HttpErrorResponse } from '@angular/common/http';
import { inject } from '@angular/core';
import { ToastService } from '../feedback/toast.service';
import { CatalogService } from '../i18n/catalog.service';
import type { ParsedApiError } from '../types/api-error';
import { ErrorHandlerService } from './error-handler.service';

/**
 * The 409 codes that mean "the row changed under you: reload, then retry" (CRM-API-CONTRACT
 * §1.4, 009b X-3). Domain-free on purpose: it lives in platform so modules can use it
 * (`module → platform`), never the reverse.
 */
export const CONCURRENCY_CONFLICT_CODES: ReadonlySet<string> = new Set([
  'crm.leads.ConcurrentUpdate',
  'crm.clients.ConcurrentUpdate',
  'crm.periods.ConcurrentUpdate',
  'crm.items.ConcurrentUpdate',
  'crm.meetings.ConcurrentUpdate',
  'crm.briefs.ConcurrencyConflict',
  'crm.briefs.ConcurrentSend',
  'crm.contacts.ConcurrentPrimaryChange',
  'projects.scope.ConcurrentUpdate',
  // crmp A-4: the sites-projects fixes and crm-complete conflict codes (contract §1.4, §5.5, §5.6).
  'projects.ConcurrentUpdate',
  'projects.members.ConcurrentUpdate',
  'crm.storefront.ConcurrentUpdate',
  'sites.ConcurrencyConflict',
  // crmp P2-B: two saves of one project's portal switches at once (Crm.Domain Errors.cs:542).
  'crm.portal.SettingsChanged',
  // crmp P1-B: two edits of one access grant at once (Projects.Domain Errors.cs:397).
  'projects.access_grants.ConcurrentUpdate',
]);

/** True for a 409 whose code says the row changed concurrently. */
export function isConcurrencyConflict(
  parsed: Pick<ParsedApiError, 'status' | 'code'> | null | undefined,
): boolean {
  return (
    !!parsed &&
    parsed.status === 409 &&
    !!parsed.code &&
    CONCURRENCY_CONFLICT_CODES.has(parsed.code)
  );
}

/**
 * Handles a concurrency 409: refetches through `reload`, tells the user "Changed by someone
 * else — reloaded." and returns `true`. Any other error returns `false` and is left to the
 * caller. Accepts a raw `HttpErrorResponse` or an already parsed error.
 */
export type ReloadOnConflict = (error: unknown, reload: () => void) => boolean;

/**
 * Builds the store-side `reloadOnConflict(err, reload)` helper. Call it in an injection
 * context (a store's `withMethods` factory or a field initializer).
 */
export function injectReloadOnConflict(): ReloadOnConflict {
  const errors = inject(ErrorHandlerService);
  const toast = inject(ToastService);
  const catalog = inject(CatalogService);

  return (error, reload) => {
    const parsed = error instanceof HttpErrorResponse ? errors.parse(error) : asParsed(error);
    if (!isConcurrencyConflict(parsed)) return false;
    reload();
    toast.show({ tone: 'info', message: catalog.t('common.changedReloaded') });
    return true;
  };
}

function asParsed(error: unknown): Pick<ParsedApiError, 'status' | 'code'> | null {
  if (!error || typeof error !== 'object') return null;
  const { status, code } = error as Partial<ParsedApiError>;
  return typeof status === 'number' && (typeof code === 'string' || code === null)
    ? { status, code }
    : null;
}
