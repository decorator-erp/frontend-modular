import { Injectable } from '@angular/core';
import { Observable } from 'rxjs';
import { ApiService } from '@platform/http/api.service';
import type { PublicLeadSubmissionRequest } from '../model';

/**
 * Anonymous public lead intake — `POST /api/crm/public/leads` (`AllowAnonymous`).
 *
 * One-shot: creates the lead + intake in a single transaction and responds `202`
 * with **no body** (no lead id — anti-enumeration). Any 2xx is success. `429`
 * (rate-limited) and `400` (ProblemDetails field errors) are surfaced by the caller
 * (`PublicIntakeStore`). The route is excluded from the auth interceptor (no token
 * attached, no 401 redirect) — see `auth.interceptor.ts`/`error.interceptor.ts`.
 */
@Injectable({ providedIn: 'root' })
export class PublicIntakeApi extends ApiService {
  submit(body: PublicLeadSubmissionRequest): Observable<void> {
    return this.post<void>('/crm/public/leads', body);
  }
}
