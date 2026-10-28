import {
  AbstractControl,
  AsyncValidatorFn,
  FormGroup,
  ValidationErrors,
  ValidatorFn,
} from '@angular/forms';
import { Observable, of, timer } from 'rxjs';
import { catchError, map, switchMap } from 'rxjs/operators';

/**
 * Finance form validators — used by every Phase F-* form spelled out in
 * `FEATURE_PROMPT_FINANCE_FORMS.md` G1.
 *
 * Conventions:
 *   - Every validator returns a short error key. The friendly string lives in
 *     `validators.ts` → `firstErrorMessage`, with the new keys added at the
 *     bottom of that file (`moneyPositive`, `moneyMax`, `moneyDecimals`,
 *     `dateFuture`, `dateAfter`, `codePattern`, `referenceUuid`, and the
 *     cross-field group keys).
 *   - Money values are STRINGS. The validators never `parseFloat` and never
 *     coerce through `Number` for arithmetic; they parse digit-by-digit so
 *     `decimal(19,4)` precision is preserved.
 *   - Cross-field validators sit on the `FormGroup`. To surface the error on
 *     a specific control rather than the form root, the validator returns
 *     `null` from the group and sets the error on the right child via
 *     `setErrors`. This matches the pattern in `PeraValidators.matchControl`.
 */

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

/**
 * Compare two decimal strings. -1 if a < b, 0 if equal, 1 if a > b. No JS
 * number conversion — handles up to `decimal(38,N)` safely.
 */
function compareDecimals(a: string, b: string): -1 | 0 | 1 {
  const pa = parseDecimal(a);
  const pb = parseDecimal(b);
  if (pa === null || pb === null) return 0;
  // Align fractional digits.
  const scale = Math.max(pa.frac.length, pb.frac.length);
  const sa = (pa.neg ? '-' : '') + pa.int + pa.frac.padEnd(scale, '0');
  const sb = (pb.neg ? '-' : '') + pb.int + pb.frac.padEnd(scale, '0');
  if (sa === sb) return 0;
  const negA = sa.startsWith('-');
  const negB = sb.startsWith('-');
  if (negA !== negB) return negA ? -1 : 1;
  const ua = negA ? sa.slice(1) : sa;
  const ub = negB ? sb.slice(1) : sb;
  const cmp = ua.length === ub.length ? (ua < ub ? -1 : 1) : ua.length < ub.length ? -1 : 1;
  return (negA ? -cmp : cmp) as -1 | 0 | 1;
}

interface ParsedDecimal {
  neg: boolean;
  /** Integer part without leading zeros (but '0' for zero). */
  int: string;
  /** Fractional part without trailing zeros (may be ''). */
  frac: string;
}

/**
 * Parse a decimal-string-like input. Returns `null` for empty input or
 * anything that doesn't match `[+-]?\d+(\.\d+)?`. Tolerates thousands
 * separators and surrounding whitespace.
 */
function parseDecimal(input: unknown): ParsedDecimal | null {
  if (input === null || input === undefined) return null;
  const str = String(input).trim().replace(/[,\s]/g, '');
  if (!str) return null;
  const m = /^([+-]?)(\d+)(?:\.(\d+))?$/.exec(str);
  if (!m) return null;
  return {
    neg: m[1] === '-',
    int: m[2].replace(/^0+(?=\d)/, ''),
    frac: (m[3] ?? '').replace(/0+$/, ''),
  };
}

function isEmpty(value: unknown): boolean {
  return value === null || value === undefined || value === '';
}

// ---------------------------------------------------------------------------
// Money validators
// ---------------------------------------------------------------------------

/**
 * Strictly-positive (`min = 1`) or non-negative (`min = 0`) money validator.
 * Per the contract: ledger amount must be `> 0`; budget allocations are
 * `>= 0`. The spec column "Validators" maps `moneyPositiveValidator(1)` to
 * `> 0` and `moneyPositiveValidator(0)` to `>= 0`.
 */
export function moneyPositiveValidator(min: 0 | 1 = 1): ValidatorFn {
  return (control: AbstractControl): ValidationErrors | null => {
    if (isEmpty(control.value)) return null;
    const parsed = parseDecimal(control.value);
    if (!parsed) return { moneyPositive: { reason: 'numeric' } };
    if (parsed.neg) return { moneyPositive: { reason: 'negative' } };
    const isZero = parsed.int === '0' && parsed.frac === '';
    if (min === 1 && isZero) return { moneyPositive: { reason: 'zero' } };
    return null;
  };
}

/**
 * Upper-bound money validator. `max` can be a constant string or a getter so
 * dynamic bounds (e.g. `min(budgetLine.availableAmount, invoice.balance)`)
 * re-evaluate on each validation pass.
 */
export function moneyMaxValidator(max: string | (() => string | null | undefined)): ValidatorFn {
  return (control: AbstractControl): ValidationErrors | null => {
    if (isEmpty(control.value)) return null;
    const limit = typeof max === 'function' ? max() : max;
    if (limit === null || limit === undefined || limit === '') return null;
    if (!parseDecimal(control.value) || !parseDecimal(limit)) return null;
    return compareDecimals(String(control.value), String(limit)) > 0
      ? { moneyMax: { max: limit } }
      : null;
  };
}

/**
 * Cap the number of fractional digits. Default 4 (matches `decimal(19,4)`).
 * Returns `{ moneyDecimals: { scale } }` so the message can reference the
 * limit.
 */
export function moneyDecimalsValidator(scale = 4): ValidatorFn {
  return (control: AbstractControl): ValidationErrors | null => {
    if (isEmpty(control.value)) return null;
    const parsed = parseDecimal(control.value);
    if (!parsed) return null;
    return parsed.frac.length > scale ? { moneyDecimals: { scale } } : null;
  };
}

// ---------------------------------------------------------------------------
// Date validators
// ---------------------------------------------------------------------------

/**
 * Reject (or warn on) dates strictly after today. `severity = 'warning'`
 * still produces a validation error so the form is invalid — the page can
 * choose to render it with a softer tone via the error catalog. Real
 * "warnings without invalidation" require a separate signal, not a
 * validator.
 */
export function dateNotInFutureValidator(severity: 'error' | 'warning' = 'warning'): ValidatorFn {
  return (control: AbstractControl): ValidationErrors | null => {
    if (isEmpty(control.value)) return null;
    const v = new Date(String(control.value));
    if (Number.isNaN(v.getTime())) return null;
    const today = new Date();
    today.setHours(0, 0, 0, 0);
    return v.getTime() > today.getTime() + 86_400_000 - 1 ? { dateFuture: { severity } } : null;
  };
}

/**
 * Require this control's date to be on/after `other.value`. Pair-set on
 * `dueOn` against `issuedOn` for invoices, for example.
 */
export function dateAfterValidator(other: AbstractControl): ValidatorFn {
  return (control: AbstractControl): ValidationErrors | null => {
    if (isEmpty(control.value) || isEmpty(other.value)) return null;
    const a = new Date(String(control.value));
    const b = new Date(String(other.value));
    if (Number.isNaN(a.getTime()) || Number.isNaN(b.getTime())) return null;
    return a.getTime() < b.getTime() ? { dateAfter: true } : null;
  };
}

// ---------------------------------------------------------------------------
// Format validators
// ---------------------------------------------------------------------------

/** Cost-category / budget-line code: uppercase alphanumerics and `. _ -`. */
export function codePatternValidator(control: AbstractControl): ValidationErrors | null {
  if (isEmpty(control.value)) return null;
  return /^[A-Z0-9._-]+$/.test(String(control.value)) ? null : { codePattern: true };
}

/**
 * Ledger `reference` field — optional, but if set should look like a v4
 * UUID so retries are recognisable. Matches the spec's idempotency note
 * (Section 3 of `api-docs/11-finance.md`).
 */
export function referenceUuidValidator(control: AbstractControl): ValidationErrors | null {
  if (isEmpty(control.value)) return null;
  return /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(
    String(control.value),
  )
    ? null
    : { referenceUuid: true };
}

// ---------------------------------------------------------------------------
// Cross-field validators (sit on the FormGroup)
// ---------------------------------------------------------------------------

/** ClientPayment ⇒ direction === 'In'. Sets error on `direction`. */
export function clientPaymentDirectionValidator(group: AbstractControl): ValidationErrors | null {
  const fg = group as FormGroup;
  const type = fg.get('type')?.value;
  const direction = fg.get('direction');
  if (type !== 'ClientPayment') {
    clearError(direction, 'crossFieldClientPaymentDirection');
    return null;
  }
  if (direction?.value !== 'In') {
    setCrossFieldError(direction, 'crossFieldClientPaymentDirection');
    return { crossFieldClientPaymentDirection: true };
  }
  clearError(direction, 'crossFieldClientPaymentDirection');
  return null;
}

/**
 * Commitment / ActualCost ⇒ `budgetLineId` set. Sets error on `budgetLineId`.
 * ClientPayment ⇒ `budgetLineId` should be null (the contract says this).
 */
export function commitmentBudgetValidator(group: AbstractControl): ValidationErrors | null {
  const fg = group as FormGroup;
  const type = fg.get('type')?.value;
  const budgetLineId = fg.get('budgetLineId');
  if (type === 'Commitment' || type === 'ActualCost') {
    if (!budgetLineId?.value) {
      setCrossFieldError(budgetLineId, 'crossFieldCommitmentBudget');
      return { crossFieldCommitmentBudget: true };
    }
  }
  clearError(budgetLineId, 'crossFieldCommitmentBudget');
  return null;
}

/** ClientPayment ⇒ `clientId` and `projectStageId` set. */
export function clientPaymentLinkValidator(group: AbstractControl): ValidationErrors | null {
  const fg = group as FormGroup;
  const type = fg.get('type')?.value;
  const client = fg.get('clientId');
  const stage = fg.get('projectStageId');
  if (type !== 'ClientPayment') {
    clearError(client, 'crossFieldClientPaymentLink');
    clearError(stage, 'crossFieldClientPaymentLink');
    return null;
  }
  let invalid = false;
  if (!client?.value) {
    setCrossFieldError(client, 'crossFieldClientPaymentLink');
    invalid = true;
  } else {
    clearError(client, 'crossFieldClientPaymentLink');
  }
  if (!stage?.value) {
    setCrossFieldError(stage, 'crossFieldClientPaymentLink');
    invalid = true;
  } else {
    clearError(stage, 'crossFieldClientPaymentLink');
  }
  return invalid ? { crossFieldClientPaymentLink: true } : null;
}

/**
 * Invoice party: `type === 'ClientInvoice'` ⇒ `clientId` set;
 * `type === 'VendorInvoice'` ⇒ `vendorName` set.
 */
export function invoicePartyValidator(group: AbstractControl): ValidationErrors | null {
  const fg = group as FormGroup;
  const type = fg.get('type')?.value;
  const client = fg.get('clientId');
  const vendor = fg.get('vendorName');
  if (type === 'ClientInvoice') {
    clearError(vendor, 'crossFieldInvoiceParty');
    if (!client?.value) {
      setCrossFieldError(client, 'crossFieldInvoiceParty');
      return { crossFieldInvoiceParty: true };
    }
    clearError(client, 'crossFieldInvoiceParty');
    return null;
  }
  if (type === 'VendorInvoice') {
    clearError(client, 'crossFieldInvoiceParty');
    const v = String(vendor?.value ?? '').trim();
    if (!v) {
      setCrossFieldError(vendor, 'crossFieldInvoiceParty');
      return { crossFieldInvoiceParty: true };
    }
    clearError(vendor, 'crossFieldInvoiceParty');
    return null;
  }
  clearError(client, 'crossFieldInvoiceParty');
  clearError(vendor, 'crossFieldInvoiceParty');
  return null;
}

/**
 * Variation `ClientDifference` requires `projectTaskId`, `budgetedAmount`,
 * `chosenAmount`. Forbids `budgetLineId`.
 */
export function clientDifferenceValidator(group: AbstractControl): ValidationErrors | null {
  const fg = group as FormGroup;
  if (fg.get('kind')?.value !== 'ClientDifference') return null;
  const required = ['projectTaskId', 'budgetedAmount', 'chosenAmount'];
  const forbidden = ['budgetLineId'];
  let invalid = false;
  for (const key of required) {
    const ctrl = fg.get(key);
    if (isEmpty(ctrl?.value)) {
      setCrossFieldError(ctrl, 'crossFieldClientDifference');
      invalid = true;
    } else {
      clearError(ctrl, 'crossFieldClientDifference');
    }
  }
  for (const key of forbidden) {
    const ctrl = fg.get(key);
    if (!isEmpty(ctrl?.value)) {
      setCrossFieldError(ctrl, 'crossFieldClientDifference');
      invalid = true;
    } else {
      clearError(ctrl, 'crossFieldClientDifference');
    }
  }
  return invalid ? { crossFieldClientDifference: true } : null;
}

/**
 * Variation `InternalChange` requires `budgetLineId`. Forbids the
 * client-difference fields.
 */
export function internalChangeValidator(group: AbstractControl): ValidationErrors | null {
  const fg = group as FormGroup;
  if (fg.get('kind')?.value !== 'InternalChange') return null;
  const required = ['budgetLineId'];
  const forbidden = ['projectTaskId', 'budgetedAmount', 'chosenAmount'];
  let invalid = false;
  for (const key of required) {
    const ctrl = fg.get(key);
    if (isEmpty(ctrl?.value)) {
      setCrossFieldError(ctrl, 'crossFieldInternalChange');
      invalid = true;
    } else {
      clearError(ctrl, 'crossFieldInternalChange');
    }
  }
  for (const key of forbidden) {
    const ctrl = fg.get(key);
    if (!isEmpty(ctrl?.value)) {
      setCrossFieldError(ctrl, 'crossFieldInternalChange');
      invalid = true;
    } else {
      clearError(ctrl, 'crossFieldInternalChange');
    }
  }
  return invalid ? { crossFieldInternalChange: true } : null;
}

/**
 * ClientDifference `amount` must equal `chosenAmount - budgetedAmount`.
 * String-decimal math via `compareDecimals` — never coerces to a number.
 * Sets the error on `amount` so the message renders next to it.
 */
export function variationAmountConsistencyValidator(
  group: AbstractControl,
): ValidationErrors | null {
  const fg = group as FormGroup;
  if (fg.get('kind')?.value !== 'ClientDifference') return null;
  const amountCtrl = fg.get('amount');
  const budgeted = fg.get('budgetedAmount')?.value;
  const chosen = fg.get('chosenAmount')?.value;
  if (isEmpty(amountCtrl?.value) || isEmpty(budgeted) || isEmpty(chosen)) {
    clearError(amountCtrl, 'crossFieldVariationAmount');
    return null;
  }
  const diff = subtractDecimals(String(chosen), String(budgeted));
  if (diff === null) return null;
  if (compareDecimals(String(amountCtrl?.value), diff) !== 0) {
    setCrossFieldError(amountCtrl, 'crossFieldVariationAmount');
    return { crossFieldVariationAmount: { expected: diff } };
  }
  clearError(amountCtrl, 'crossFieldVariationAmount');
  return null;
}

/** Subtract two decimal strings. Returns null if either parses badly. */
function subtractDecimals(a: string, b: string): string | null {
  const pa = parseDecimal(a);
  const pb = parseDecimal(b);
  if (!pa || !pb) return null;
  const scale = Math.max(pa.frac.length, pb.frac.length);
  const asScaled = BigInt((pa.neg ? '-' : '') + (pa.int || '0') + pa.frac.padEnd(scale, '0'));
  const bsScaled = BigInt((pb.neg ? '-' : '') + (pb.int || '0') + pb.frac.padEnd(scale, '0'));
  const diff = asScaled - bsScaled;
  if (scale === 0) return diff.toString();
  const negative = diff < 0n;
  const absStr = (negative ? -diff : diff).toString().padStart(scale + 1, '0');
  const intPart = absStr.slice(0, absStr.length - scale);
  const fracPart = absStr.slice(absStr.length - scale).replace(/0+$/, '');
  const body = fracPart ? `${intPart}.${fracPart}` : intPart;
  return negative ? `-${body}` : body;
}

/** BoqSnapshot StageClose ⇒ `projectStageId` set. */
export function boqStageRequiredOnStageCloseValidator(
  group: AbstractControl,
): ValidationErrors | null {
  const fg = group as FormGroup;
  const type = fg.get('type')?.value;
  const stage = fg.get('projectStageId');
  if (type !== 'StageClose') {
    clearError(stage, 'crossFieldBoqStageRequired');
    return null;
  }
  if (!stage?.value) {
    setCrossFieldError(stage, 'crossFieldBoqStageRequired');
    return { crossFieldBoqStageRequired: true };
  }
  clearError(stage, 'crossFieldBoqStageRequired');
  return null;
}

// ---------------------------------------------------------------------------
// Async uniqueness validators
// ---------------------------------------------------------------------------

/**
 * Wrap a "does this code/number already exist?" service call into an
 * `AsyncValidatorFn` debounced at 300 ms (per G0.2).
 *
 *   asyncUniqueValidator(value => costCategoryService.checkCode(value))
 *
 * The service is expected to return `Observable<boolean>` — true means
 * "taken", which becomes `{ unique: { value } }`.
 */
export function asyncUniqueValidator(
  check: (value: string) => Observable<boolean>,
  errorKey: 'uniqueCode' | 'uniqueInvoiceNumber' = 'uniqueCode',
  debounceMs = 300,
): AsyncValidatorFn {
  return (control: AbstractControl): Observable<ValidationErrors | null> => {
    const value = String(control.value ?? '').trim();
    if (!value) return of(null);
    return timer(debounceMs).pipe(
      switchMap(() => check(value)),
      map((taken) => (taken ? { [errorKey]: { value } } : null)),
      catchError(() => of(null)),
    );
  };
}

/** Convenience wrapper for cost-category code uniqueness. */
export function asyncUniqueCodeValidator(
  check: (code: string) => Observable<boolean>,
  debounceMs = 300,
): AsyncValidatorFn {
  return asyncUniqueValidator(check, 'uniqueCode', debounceMs);
}

/** Convenience wrapper for invoice-number uniqueness on a given project. */
export function asyncUniqueInvoiceNumberValidator(
  check: (number: string) => Observable<boolean>,
  debounceMs = 300,
): AsyncValidatorFn {
  return asyncUniqueValidator(check, 'uniqueInvoiceNumber', debounceMs);
}

// ---------------------------------------------------------------------------
// Error-set plumbing (cross-field validators write to child controls)
// ---------------------------------------------------------------------------

function setCrossFieldError(control: AbstractControl | null | undefined, key: string): void {
  if (!control) return;
  const existing = control.errors ?? {};
  if (existing[key]) return;
  control.setErrors({ ...existing, [key]: true });
}

function clearError(control: AbstractControl | null | undefined, key: string): void {
  if (!control) return;
  const errors = control.errors;
  if (!errors || !(key in errors)) return;
  const next: ValidationErrors = { ...errors };
  delete next[key];
  control.setErrors(Object.keys(next).length === 0 ? null : next);
}
