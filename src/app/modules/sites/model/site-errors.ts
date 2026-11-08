import { HttpErrorResponse } from '@angular/common/http';
import { friendly } from '@platform/http/error-handler.service';
import type { ParsedApiError } from '@platform/types/api-error';

/**
 * sites: the raw `errors` map of a problem body (`ResultHttpExtensions.cs:25-42`). FluentValidation keys
 * are property paths (`Request.Data.Address`, `Request.Records[3].Label`); domain keys are codes
 * (`sites.LabelTaken`, `sites.validation.width_cm.Max`). The platform parser folds paths to their first
 * segment, which loses the row index, so the grid and the unit form read the map themselves.
 */
export function problemErrors(err: unknown): Record<string, string[]> {
  if (!(err instanceof HttpErrorResponse)) return {};
  const body = err.error as { errors?: Record<string, unknown> } | null;
  const map = body && typeof body === 'object' ? body.errors : undefined;
  if (!map || typeof map !== 'object') return {};
  const out: Record<string, string[]> = {};
  for (const [k, v] of Object.entries(map)) {
    out[k] = Array.isArray(v) ? v.map(String) : [String(v)];
  }
  return out;
}

/** `Request.Data.AreaSqm` → `areaSqm`: the unit-data form's field for a validation path. */
export function unitDataFieldOf(path: string): string | null {
  const m = /^Request\.Data\.([A-Za-z]+)$/i.exec(path);
  return m ? m[1].charAt(0).toLowerCase() + m[1].slice(1) : null;
}

/** What a store write tells the dialog or page that started it. */
export interface WriteOutcome<T = void> {
  ok: boolean;
  value?: T;
  /** A message for the inline banner; null when the store already handled it (reload + toast). */
  message?: string | null;
  /** The error code, when one came back. */
  code?: string | null;
  /** Server validation messages by field (unit-data form: `address`, `areaSqm`, …). */
  fieldErrors?: Record<string, string>;
  /** True when the store reloaded and the dialog should simply close. */
  reloaded?: boolean;
}

/**
 * A failed write as an inline outcome: the catalog message for its code (`friendly`), plus the
 * unit-data field messages of a 400 validation body (`Request.Data.<Field>`).
 */
export function failureOutcome(
  err: unknown,
  parse: (e: HttpErrorResponse) => ParsedApiError,
): WriteOutcome<never> {
  if (!(err instanceof HttpErrorResponse)) return { ok: false, message: String(err), code: null };
  const parsed = parse(err);
  const fieldErrors: Record<string, string> = {};
  for (const [path, messages] of Object.entries(problemErrors(err))) {
    const field = unitDataFieldOf(path);
    if (field && messages[0]) fieldErrors[field] = messages[0];
  }
  return { ok: false, message: friendly(parsed), code: parsed.code, fieldErrors };
}
