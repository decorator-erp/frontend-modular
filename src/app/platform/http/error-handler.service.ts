import { Injectable } from '@angular/core';
import { HttpErrorResponse } from '@angular/common/http';
import { AbstractControl, FormGroup } from '@angular/forms';
import { ApiProblemDetails, ParsedApiError } from '../types/api-error';
import { friendlyMessage } from '../errors/error-catalog';

/**
 * Parses backend ProblemDetails into a UI-friendly shape and applies field
 * errors to Reactive Forms. See `core/http/ERROR-FORMAT.md`.
 */
@Injectable({ providedIn: 'root' })
export class ErrorHandlerService {
  parse(error: HttpErrorResponse): ParsedApiError {
    const status = error.status || 0;
    const payload = this.extractPayload(error);
    const errorMap = this.extractErrorMap(payload);

    if (!errorMap || Object.keys(errorMap).length === 0) {
      return {
        status,
        generalMessage:
          payload?.detail ??
          this.preferFriendlyOverGenericTitle(status, payload?.title) ??
          'An unexpected error occurred.',
        fieldErrors: {},
        code: null,
        raw: payload,
      };
    }

    let generalMessage = '';
    let code: string | null = null;
    const fieldErrors: Record<string, string[]> = {};

    for (const [key, messages] of Object.entries(errorMap)) {
      const list = Array.isArray(messages) ? messages.filter(Boolean) : [];
      if (list.length === 0) continue;

      if (this.isDomainErrorCode(key)) {
        if (!generalMessage) {
          generalMessage = list[0];
          code = key;
        }
      } else {
        const controlName = this.fieldKey(key);
        fieldErrors[controlName] = [...(fieldErrors[controlName] ?? []), ...list];
      }
    }

    if (!generalMessage) {
      generalMessage =
        Object.keys(fieldErrors).length > 0
          ? 'Please correct the errors below.'
          : (payload?.detail ??
            this.preferFriendlyOverGenericTitle(status, payload?.title) ??
            'An error occurred.');
    }

    return { status, generalMessage, fieldErrors, code, raw: payload };
  }

  applyToForm(form: FormGroup, fieldErrors: Record<string, string[]>): void {
    if (!form || !fieldErrors) return;
    for (const [field, messages] of Object.entries(fieldErrors)) {
      const control = this.findControl(form, field);
      if (!control) continue;
      const message = messages[0];
      if (!message) continue;
      control.setErrors({ ...(control.errors ?? {}), serverError: message });
      control.markAsTouched({ onlySelf: true });
    }
  }

  isFieldError(error: ParsedApiError | null | undefined): boolean {
    return !!error && Object.keys(error.fieldErrors).length > 0;
  }

  /** Legacy adapter. */
  parseHttpError(error: HttpErrorResponse): FormError {
    return toLegacyFormError(this.parse(error));
  }

  private extractPayload(error: HttpErrorResponse): ApiProblemDetails | null {
    const p = error?.error;
    return p && typeof p === 'object' ? (p as ApiProblemDetails) : null;
  }

  private extractErrorMap(p: ApiProblemDetails | null): Record<string, string[]> | undefined {
    if (!p) return undefined;
    const top = (p as { errors?: Record<string, string[]> }).errors;
    const legacy = (p as { extensions?: { errors?: Record<string, string[]> } }).extensions?.errors;
    return top ?? legacy;
  }

  private isDomainErrorCode(key: string): boolean {
    return /^[a-z]/.test(key);
  }

  private fieldKey(key: string): string {
    const head = key.split('.')[0];
    return head.charAt(0).toLowerCase() + head.slice(1);
  }

  private findControl(form: FormGroup, field: string): AbstractControl | null {
    const direct = form.get(field);
    if (direct) return direct;
    const lc = field.toLowerCase();
    const match = Object.keys(form.controls).find((name) => name.toLowerCase() === lc);
    return match ? form.get(match) : null;
  }

  private statusMessage(status: number): string | null {
    if (!status) return 'Cannot reach the server. Check your connection.';
    if (status === 400) return 'The request is invalid. Please review and try again.';
    if (status === 401) return 'Your session has expired. Please sign in again.';
    if (status === 403) return "You don't have permission to perform this action.";
    if (status === 404) return 'The requested item was not found.';
    if (status === 409) return 'This action conflicts with the current state.';
    if (status === 422) return 'Please correct the highlighted fields.';
    if (status >= 500)
      return 'The server hit an internal error. Check the backend logs for details.';
    return null;
  }

  /**
   * Backend ProblemDetails carry generic `title` strings ("Server Error",
   * "Bad Request") that aren't useful to end users. When the payload has no
   * `detail`, fall back to our friendlier per-status copy.
   */
  private preferFriendlyOverGenericTitle(
    status: number,
    title: string | undefined | null,
  ): string | null {
    const GENERIC_TITLES = new Set([
      'Server Error',
      'Internal Server Error',
      'Bad Request',
      'Unauthorized',
      'Forbidden',
      'Not Found',
      'Conflict',
      'Unprocessable Entity',
      'Unprocessable Content',
      'One or more validation errors occurred.',
    ]);
    if (title && !GENERIC_TITLES.has(title)) return title;
    return this.statusMessage(status);
  }
}

/** Legacy types used by older consumers (e.g. ErrorDisplayComponent). */
export interface FieldError {
  field: string;
  message: string;
}
export interface FormError {
  generalMessage: string;
  fieldErrors: FieldError[];
}

/**
 * Map a parsed API error to the catalog's friendly message (falls back to the
 * backend's general message). Usage: `toast.show({ tone: 'danger', message: friendly(parsed) })`.
 */
export function friendly(error: ParsedApiError): string {
  return friendlyMessage(error.code, error.generalMessage);
}

export function toLegacyFormError(parsed: ParsedApiError): FormError {
  const fieldErrors: FieldError[] = [];
  for (const [field, messages] of Object.entries(parsed.fieldErrors)) {
    if (messages[0]) fieldErrors.push({ field, message: messages[0] });
  }
  return { generalMessage: parsed.generalMessage, fieldErrors };
}
