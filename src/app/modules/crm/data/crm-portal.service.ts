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
 * `getMyProfile` targets `GET /api/crm/portal/profile` (`CrmClientPortalEndpoints.cs`,
 * gated `portal.profile.view_own`) — the client's own `Client`/`CrmContact` rows and
 * every project they can see, in one call.
 *
 * 009b #N-1: that route is still absent (Dependency 13), so the call 404s. The 404 is
 * `handled(404)`: `ClientProfileStore` turns it into `client.profileUnavailable`.
 */
@Injectable({ providedIn: 'root' })
export class CrmClientPortalService extends ApiService {
  getMyProfile(): Observable<ClientProfile> {
    return this.get<unknown>('/crm/portal/profile', undefined, { context: handled(404) }).pipe(
      map((r) => this.normalize(this.unwrap(r))),
    );
  }

  private normalize(source: unknown): ClientProfile {
    const client = this.field<unknown>(source, 'client');
    return {
      client: {
        id: this.field<string>(client, 'id') ?? '',
        firstName: this.field<string>(client, 'firstName') ?? '',
        lastName: this.field<string>(client, 'lastName') ?? '',
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
      productOwnerName: this.field<string | null>(source, 'productOwnerName') ?? null,
      progressPercentage: this.field<number>(source, 'progressPercentage') ?? 0,
      openPeriodId: this.field<string | null>(source, 'openPeriodId') ?? null,
    };
  }
}
