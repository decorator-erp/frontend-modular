import {
  AbstractControl,
  FormGroup,
  ValidationErrors,
  ValidatorFn,
  Validators,
} from '@angular/forms';

/**
 * Shared form validators used across feature forms.
 *
 * Conventions:
 *   - Each validator returns a single, short error key keyed by intent
 *     (e.g. `email`, `minLength`, `password`, `phone`).
 *   - The error payload includes the data needed to format a message
 *     (e.g. `{ minLength: { requiredLength, actualLength } }`).
 *   - Validators are pure — no DOM, no service calls.
 *   - Synchronous only; for server-side uniqueness use an `AsyncValidator`
 *     wrapped per feature (e.g. `EmployeeUniqueEmailValidator`).
 */
export const PeraValidators = {
  /** Required — alias for `Validators.required` to keep imports tidy. */
  required: Validators.required,

  /**
   * Email — stricter than the default Angular validator: requires a TLD and
   * disallows spaces in local-part. Accepts the standard ASCII subset.
   */
  email(control: AbstractControl): ValidationErrors | null {
    const v = (control.value ?? '').toString().trim();
    if (!v) return null;
    const re = /^[A-Za-z0-9._%+-]+@[A-Za-z0-9.-]+\.[A-Za-z]{2,}$/;
    return re.test(v) ? null : { email: true };
  },

  /**
   * Username — 3-32 chars, lowercase letters/digits/`.`/`_`/`-` only, must
   * start with a letter. Tweak per backend rules.
   */
  username(control: AbstractControl): ValidationErrors | null {
    const v = (control.value ?? '').toString();
    if (!v) return null;
    return /^[a-z][a-z0-9._-]{2,31}$/.test(v) ? null : { username: true };
  },

  /**
   * Password strength — at least 8 chars, with at least one of each:
   * lowercase letter, uppercase letter, digit. Special char optional.
   * Returns granular flags so the UI can show a checklist.
   */
  password(control: AbstractControl): ValidationErrors | null {
    const v = (control.value ?? '').toString();
    if (!v) return null;
    const errors: Record<string, true> = {};
    if (v.length < 8) errors['minLength'] = true;
    if (!/[a-z]/.test(v)) errors['lowercase'] = true;
    if (!/[A-Z]/.test(v)) errors['uppercase'] = true;
    if (!/\d/.test(v)) errors['digit'] = true;
    return Object.keys(errors).length ? { password: errors } : null;
  },

  /**
   * KSA / international phone — accepts `05XXXXXXXX`, `+9665XXXXXXXX`,
   * `+966 5X XXX XXXX`, or any international `+<countryCode>` with 8-15 digits.
   */
  phone(control: AbstractControl): ValidationErrors | null {
    const v = (control.value ?? '').toString().replace(/[\s-]/g, '');
    if (!v) return null;
    const ksaLocal = /^05\d{8}$/;
    const intl = /^\+\d{8,15}$/;
    return ksaLocal.test(v) || intl.test(v) ? null : { phone: true };
  },

  /** Whole, positive number (allows 0). */
  positiveNumber(control: AbstractControl): ValidationErrors | null {
    const v = control.value;
    if (v === null || v === undefined || v === '') return null;
    const num = Number(v);
    if (Number.isNaN(num)) return { numeric: true };
    if (num < 0) return { positive: true };
    return null;
  },

  /** Money — non-negative number with up to 2 decimal places. */
  money(control: AbstractControl): ValidationErrors | null {
    const v = control.value;
    if (v === null || v === undefined || v === '') return null;
    const num = Number(v);
    if (Number.isNaN(num)) return { numeric: true };
    if (num < 0) return { positive: true };
    if (!/^-?\d+(\.\d{1,2})?$/.test(String(v))) return { decimals: true };
    return null;
  },

  /** Trimmed, with min/max lengths. */
  trimmedLength(min: number, max: number): ValidatorFn {
    return (control: AbstractControl): ValidationErrors | null => {
      const v = (control.value ?? '').toString().trim();
      if (!v) return null;
      if (v.length < min) return { minLength: { requiredLength: min, actualLength: v.length } };
      if (v.length > max) return { maxLength: { requiredLength: max, actualLength: v.length } };
      return null;
    };
  },

  /** Date-only ISO string (`YYYY-MM-DD`). Empty is valid. */
  isoDate(control: AbstractControl): ValidationErrors | null {
    const v = (control.value ?? '').toString();
    if (!v) return null;
    return /^\d{4}-\d{2}-\d{2}$/.test(v) ? null : { isoDate: true };
  },

  /** End date must be on/after start date. Use on a `FormGroup`. */
  dateRange(startKey: string, endKey: string): ValidatorFn {
    return (group: AbstractControl): ValidationErrors | null => {
      const fg = group as FormGroup;
      const start = fg.get(startKey)?.value;
      const end = fg.get(endKey)?.value;
      if (!start || !end) return null;
      return new Date(end) >= new Date(start) ? null : { dateRange: { startKey, endKey } };
    };
  },

  /**
   * Cross-field equality — typical use: confirm password.
   *
   *   form = this.fb.group({
   *     password: ['', PeraValidators.password],
   *     confirmPassword: [''],
   *   }, { validators: PeraValidators.matchControl('password', 'confirmPassword') });
   */
  matchControl(sourceKey: string, targetKey: string): ValidatorFn {
    return (group: AbstractControl): ValidationErrors | null => {
      const fg = group as FormGroup;
      const a = fg.get(sourceKey)?.value;
      const b = fg.get(targetKey)?.value;
      if (a === b) return null;
      // surface error on the target control so the message renders inline
      fg.get(targetKey)?.setErrors({ match: { otherField: sourceKey } });
      return null;
    };
  },
};

/**
 * Map a control's `errors` object → the first user-facing message.
 * Pages may pass a localized override map; otherwise English defaults apply.
 */
export function firstErrorMessage(
  errors: ValidationErrors | null | undefined,
  overrides: Record<string, string> = {},
): string {
  if (!errors) return '';
  const first = Object.keys(errors)[0];
  if (overrides[first]) return overrides[first];

  switch (first) {
    case 'required':
      return 'This field is required.';
    case 'email':
      return 'Enter a valid email address.';
    case 'username':
      return 'Username must start with a letter (3–32 chars, lowercase letters/digits/. _ -).';
    case 'phone':
      return 'Enter a valid phone number.';
    case 'minlength': {
      const e = errors['minlength'];
      return `Must be at least ${e.requiredLength} characters.`;
    }
    case 'maxlength': {
      const e = errors['maxlength'];
      return `Must be at most ${e.requiredLength} characters.`;
    }
    case 'minLength': {
      const e = errors['minLength'];
      return `Must be at least ${e.requiredLength} characters.`;
    }
    case 'maxLength': {
      const e = errors['maxLength'];
      return `Must be at most ${e.requiredLength} characters.`;
    }
    case 'numeric':
      return 'Enter a valid number.';
    case 'positive':
      return 'Must be zero or greater.';
    case 'min': {
      const e = errors['min'];
      return `Must be ${e?.min} or greater.`;
    }
    case 'max': {
      const e = errors['max'];
      return `Must be ${e?.max} or less.`;
    }
    case 'designerExperienceWithoutUse':
      return 'Set this only when the client has used a designer before.';
    case 'experienceReasonWithoutExperience':
      return 'Add the experience (positive/negative) before giving a reason.';
    case 'decimals':
      return 'Use at most two decimal places.';
    case 'isoDate':
      return 'Enter a valid date (YYYY-MM-DD).';
    case 'dateRange':
      return 'End date must be on or after the start date.';
    case 'match':
      return 'Values do not match.';
    case 'password': {
      const p = errors['password'] as Record<string, true>;
      const need: string[] = [];
      if (p?.['minLength']) need.push('8+ characters');
      if (p?.['lowercase']) need.push('a lowercase letter');
      if (p?.['uppercase']) need.push('an uppercase letter');
      if (p?.['digit']) need.push('a number');
      return need.length ? `Password needs ${need.join(', ')}.` : 'Password is too weak.';
    }
    case 'serverError':
      return String(errors['serverError']);
    case 'server':
      return String(errors['server']);

    // Finance validators (validators.finance.ts) ----------------------------
    case 'moneyPositive': {
      const reason = errors['moneyPositive']?.reason;
      if (reason === 'numeric') return 'Enter a valid amount.';
      if (reason === 'negative') return 'Amount must be a positive number.';
      if (reason === 'zero') return 'Amount must be greater than zero.';
      return 'Amount is not valid.';
    }
    case 'moneyMax': {
      const max = errors['moneyMax']?.max;
      return max ? `Amount cannot exceed ${max}.` : 'Amount is over the allowed limit.';
    }
    case 'moneyDecimals': {
      const scale = errors['moneyDecimals']?.scale ?? 4;
      return `Use at most ${scale} decimal places.`;
    }
    case 'dateFuture':
      return errors['dateFuture']?.severity === 'error'
        ? 'Date cannot be in the future.'
        : 'Heads up — this date is in the future.';
    case 'dateAfter':
      return 'Date must be on or after the start date.';
    case 'codePattern':
      return 'Use uppercase letters, digits, and . _ - only.';
    case 'referenceUuid':
      return 'Reference should be a UUID v4.';
    case 'uniqueCode':
      return 'This code is already used.';
    case 'uniqueInvoiceNumber':
      return 'This invoice number is already used on this project.';

    // Cross-field rules — surfaced on the offending child control. The
    // entity-specific form is responsible for rendering a more contextual
    // sentence at the group level; these fallbacks keep the inline label
    // accurate when nothing else captures the failure.
    case 'crossFieldClientPaymentDirection':
      return 'Client payments must be inbound.';
    case 'crossFieldCommitmentBudget':
      return 'Pick a budget line for this entry.';
    case 'crossFieldClientPaymentLink':
      return 'Client payments need a client and a stage.';
    case 'crossFieldInvoiceParty':
      return 'Client invoices need a client; vendor invoices need a vendor name.';
    case 'crossFieldClientDifference':
      return 'Client differences need a task and both amounts; budget line must be empty.';
    case 'crossFieldInternalChange':
      return 'Internal changes need a budget line; task and client amounts must be empty.';
    case 'crossFieldVariationAmount': {
      const expected = errors['crossFieldVariationAmount']?.expected;
      return expected
        ? `Amount must equal chosen − budgeted (= ${expected}).`
        : 'Amount must equal chosen − budgeted.';
    }
    case 'crossFieldBoqStageRequired':
      return 'Pick a stage when generating a stage-close snapshot.';
    default:
      return 'Invalid value.';
  }
}
