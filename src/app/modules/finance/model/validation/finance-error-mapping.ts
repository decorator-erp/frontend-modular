import { FormGroup, ValidationErrors } from '@angular/forms';
import { WritableSignal } from '@angular/core';
import { friendly } from '@platform/http/error-handler.service';
import type { ParsedApiError } from '@platform/types';

/**
 * Map a finance-form `ParsedApiError` to a control-level error or, when no
 * mapping fits, a form-level alert signal. Used by every Phase F-* form per
 * `FEATURE_PROMPT_FINANCE_FORMS.md` G2.
 *
 * Each page passes:
 *   - `form` — the reactive `FormGroup`.
 *   - `parsed` — the parsed problem-details payload from
 *     `ErrorHandlerService.parse(err)`.
 *   - `fieldMap` — `{ 'errors.code': 'controlName' | 'group.controlName' }`,
 *     e.g. for ledger:
 *     ```
 *     {
 *       'ledgerEntries.InsufficientBudget': 'amount',
 *       'ledgerEntries.DuplicatePosting': 'reference',
 *       'budgetLines.NotFound': 'budgetLineId',
 *     }
 *     ```
 *   - `formAlert$` — a writable signal the page binds to a `<pera-alert>`.
 *
 * Behaviour:
 *   1. If `parsed.fieldErrors` carries field-keyed errors, set those on the
 *      matching controls via `setErrors({ server: msg })` so the field-field
 *      renders the message inline.
 *   2. Else, if `parsed.code` matches an entry in `fieldMap`, set the
 *      catalog-friendly message on that control.
 *   3. Else, write the catalog-friendly message into `formAlert$` so the
 *      page can render a top-of-form alert.
 *
 * Clearing the alert is the page's job — typically on the next successful
 * `valueChanges` tick or on submit start.
 */
export function applyFinanceServerError(
  form: FormGroup,
  parsed: ParsedApiError,
  fieldMap: Record<string, string>,
  formAlert$: WritableSignal<string | null>,
): void {
  // Reset any prior server-error keys before re-applying.
  clearServerErrors(form);

  // Path 1 — backend already sent per-field errors. Surface them directly.
  if (parsed.fieldErrors && Object.keys(parsed.fieldErrors).length > 0) {
    let landed = 0;
    for (const [controlPath, messages] of Object.entries(parsed.fieldErrors)) {
      const message = messages[0];
      if (!message) continue;
      const control = form.get(controlPath);
      if (control) {
        control.setErrors({ ...(control.errors ?? {}), server: message });
        landed++;
      }
    }
    if (landed === 0) {
      // No field key matched a control — fall back to a form-level alert.
      formAlert$.set(friendly(parsed));
    } else {
      formAlert$.set(null);
    }
    return;
  }

  // Path 2 — domain code maps to a specific control.
  if (parsed.code && parsed.code in fieldMap) {
    const path = fieldMap[parsed.code];
    const control = form.get(path);
    if (control) {
      control.setErrors({ ...(control.errors ?? {}), server: friendly(parsed) });
      formAlert$.set(null);
      return;
    }
  }

  // Path 3 — form-level alert.
  formAlert$.set(friendly(parsed));
}

/** Remove any `server` keys previously applied by this helper. */
function clearServerErrors(group: FormGroup): void {
  for (const key of Object.keys(group.controls)) {
    const control = group.get(key);
    if (!control) continue;
    const errors = control.errors;
    if (!errors || !('server' in errors)) continue;
    const next: ValidationErrors = { ...errors };
    delete next['server'];
    control.setErrors(Object.keys(next).length === 0 ? null : next);
  }
}
