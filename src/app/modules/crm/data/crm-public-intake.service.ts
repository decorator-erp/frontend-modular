import { Injectable } from '@angular/core';
import { Observable } from 'rxjs';
import { ApiService } from '@platform/http/api.service';
import type { PublicLeadSubmissionRequest } from '../model';

/**
 * Anonymous public lead intake — `POST /api/crm/public/leads` (`AllowAnonymous`,
 * `CrmPublicEndpoints.cs:42-80`).
 *
 * One-shot: creates the lead, unassigned, with its intake when the client answered any project
 * question (LI-1), and responds `202` with **no body** (no lead id — anti-enumeration). Any 2xx
 * is success. `400` (ProblemDetails field errors), `413` (body over 32 KB) and `429`
 * (rate-limited) are surfaced by the caller (`PublicIntakeStore`). The route is excluded from the auth interceptor (no token
 * attached, no 401 redirect) — see `auth.interceptor.ts`/`error.interceptor.ts`.
 */
@Injectable({ providedIn: 'root' })
export class PublicIntakeApi extends ApiService {
  submit(body: PublicLeadSubmissionRequest): Observable<void> {
    return this.post<void>('/crm/public/leads', body);
  }
}
