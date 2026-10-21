/**
 * Backend error contract.
 *
 * The backend serializes every failed `Result` as an RFC 7807 ProblemDetails
 * (see `API/Infrastructure/CustomResults.cs`):
 *
 * ```json
 * {
 *   "type": "...",
 *   "title": "Bad Request",
 *   "status": 400,
 *   "errors": {
 *     "employees.NotFound": ["Employee was not found."],
 *     "Email": ["Email is required", "Email format is invalid"]
 *   }
 * }
 * ```
 *
 * - **Domain errors** use the form `<resource>.<ErrorName>` (e.g. `employees.NotFound`,
 *   `projects.DuplicatedCode`). They map to a single general/toast message.
 * - **Validation errors** come from `ValidationError.FromResults(...)` — multiple
 *   `Error` entries. Each key represents a rule/field. Keys without a dot, or
 *   keys whose first segment matches a form control, are treated as field errors.
 *
 * The status codes used by the backend:
 *   400 BadRequest · 401 Unauthorized · 403 Forbidden · 404 NotFound · 409 Conflict · 500
 */
export interface ApiProblemDetails {
  type?: string;
  title?: string;
  status?: number;
  detail?: string;
  instance?: string;
  /** Top-level (ProblemDetails extensions are flattened by the .NET serializer). */
  errors?: Record<string, string[]>;
}

/**
 * Normalized shape consumed by the UI. Forms read `fieldErrors`; toasts read
 * `generalMessage`; conditional UI can branch on `code`.
 */
export interface ParsedApiError {
  /** HTTP status (0 for transport / network errors). */
  status: number;
  /** First general/domain error description, or a status-based fallback. */
  generalMessage: string;
  /** Field-level errors keyed by control name (lowercased). */
  fieldErrors: Record<string, string[]>;
  /** First domain error code (e.g. `employees.NotFound`), or `null`. */
  code: string | null;
  /** Original payload — kept for special cases (e.g. token-refresh hints). */
  raw: ApiProblemDetails | null;
}

/** Construct an empty parsed error — useful for `signal()` initial state. */
export function emptyParsedError(): ParsedApiError {
  return { status: 0, generalMessage: '', fieldErrors: {}, code: null, raw: null };
}

/** True when the parsed error carries at least one field-level error. */
export function hasFieldErrors(err: ParsedApiError | null | undefined): boolean {
  return !!err && Object.keys(err.fieldErrors).length > 0;
}
