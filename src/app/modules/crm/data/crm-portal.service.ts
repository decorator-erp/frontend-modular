import { Injectable } from '@angular/core';
import { Observable } from 'rxjs';
import { map } from 'rxjs/operators';
import { ApiService } from '@platform/http/api.service';
import { handled } from '@platform/http/handled-errors';
import { ContactRole } from '../model/crm-enums';
import type { ClientProfile, ClientProfileContact, ClientProfileProject } from '../model';

/**
 * `CrmClientPortalService` (T108) — the one genuinely new client-portal surface, as
 * opposed to the nine `/api/crm/portal/*` endpoints already folded into their own
 * domain services (`CrmMeetingService.portal*`, `CrmItemService.portal*`; see
 * `crm-brief.service.ts` for `getMyBrief`).
 *
 * `getMyProfile` targets `GET /api/crm/portal/profile` (`CrmPortalEndpoints.cs:53`,
 * gated `crm.portal`; `PortalProfileResponse`, `PortalContracts.cs:146-160`) — the
 * client's own identity, active contacts and active projects, in one call. Read-only:
 * the backend maps no profile edit route.
 *
 * crmp C-2: a 404 (`crm.portal.NotFound`, no linked client row) and a 403
 * (`crm.portal.NotAClient`) are `handled`: `ClientProfileStore` turns each into its own
 * catalog message.
 */
@Injectable({ providedIn: 'root' })
export class CrmClientPortalService extends ApiService {
  getMyProfile(): Observable<ClientProfile> {
    return this.get<unknown>('/crm/portal/profile', undefined, { context: handled(403, 404) }).pipe(
      map((r) => this.normalize(this.unwrap(r))),
    );
  }

  private normalize(source: unknown): ClientProfile {
    const client = this.field<unknown>(source, 'client');
    return {
      client: {
        id: this.field<string>(client, 'id') ?? '',
        name: this.field<string>(client, 'name') ?? '',
        firstName: this.field<string>(client, 'firstName') ?? '',
        lastName: this.field<string>(client, 'lastName') ?? '',
        email: this.field<string | null>(client, 'email') ?? null,
        phoneNumber: this.field<string | null>(client, 'phoneNumber') ?? null,
        address: this.field<string | null>(client, 'address') ?? null,
      },
      contacts: (this.field<unknown[]>(source, 'contacts') ?? []).map((c) =>
        this.normalizeContact(c),
      ),
      projects: (this.field<unknown[]>(source, 'projects') ?? []).map((p) =>
        this.normalizeProject(p),
      ),
    };
  }

  private normalizeContact(source: unknown): ClientProfileContact {
    return {
      id: this.field<string>(source, 'id') ?? '',
      firstName: this.field<string>(source, 'firstName') ?? '',
      lastName: this.field<string>(source, 'lastName') ?? '',
      email: this.field<string | null>(source, 'email') ?? null,
      phone: this.field<string | null>(source, 'phone') ?? null,
      mobile: this.field<string | null>(source, 'mobile') ?? null,
      role: this.field<number>(source, 'role') ?? ContactRole.Other,
      isPrimary: this.field<boolean>(source, 'isPrimary') ?? false,
    };
  }

  private normalizeProject(source: unknown): ClientProfileProject {
    return {
      id: this.field<string>(source, 'id') ?? '',
      code: this.field<string>(source, 'code') ?? '',
      name: this.field<string>(source, 'name') ?? '',
      status: this.field<string>(source, 'status') ?? '',
      progressPercentage: this.field<number>(source, 'progressPercentage') ?? 0,
      activeStageId: this.field<string | null>(source, 'activeStageId') ?? null,
      activeStageName: this.field<string | null>(source, 'activeStageName') ?? null,
      openPeriodId: this.field<string | null>(source, 'openPeriodId') ?? null,
    };
  }
}
