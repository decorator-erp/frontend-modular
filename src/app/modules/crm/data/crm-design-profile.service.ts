import { Injectable } from '@angular/core';
import { Observable } from 'rxjs';
import { map } from 'rxjs/operators';
import { ApiService } from '@platform/http/api.service';
import type { ClientDesignProfile } from '../model';

/**
 * The designer's read-only view of a project's design preferences (T120, FR-030). One GET,
 * gated `crm.design_profile.read`, returning `ClientDesignProfileResponse` — the latest brief's
 * seven preference fields only (009b #17). **The server has already excluded money**; this
 * service only normalizes the wire shape, never re-filters. 404 `crm.briefs.NotFound` = no brief.
 */
@Injectable({ providedIn: 'root' })
export class CrmDesignProfileService extends ApiService {
  /** `GET /api/crm/projects/{projectId}/design-profile`. */
  getFor(projectId: string): Observable<ClientDesignProfile> {
    return this.get<unknown>(`/crm/projects/${projectId}/design-profile`).pipe(
      map((r) => this.normalize(this.unwrap(r))),
    );
  }

  private normalize(source: unknown): ClientDesignProfile {
    return {
      projectId: this.field<string>(source, 'projectId') ?? '',
      preferredStyle: this.field<string | null>(source, 'preferredStyle') ?? null,
      preferredColors: this.field<string | null>(source, 'preferredColors') ?? null,
      furnitureStatus: this.field<number | null>(source, 'furnitureStatus') ?? null,
      hiringReasons: this.field<number>(source, 'hiringReasons') ?? 0,
      architecturalRequests: this.field<string | null>(source, 'architecturalRequests') ?? null,
      otherNeeds: this.field<string | null>(source, 'otherNeeds') ?? null,
    };
  }
}
