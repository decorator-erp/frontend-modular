import { Injectable } from '@angular/core';
import { Observable, map } from 'rxjs';
import { ApiService } from '@platform/http/api.service';
import { handled } from '@platform/http/handled-errors';
import type { ConvertSiteData } from '../model/lead-convert.model';

/**
 * `sites.create`, the claim `POST /api/sites` checks (dms `SitesPermissions.cs`). The platform `PERM`
 * catalog has no `sites` group (the sites module keeps its own, DEVIATION-20).
 */
export const SITES_CREATE_PERMISSION = 'sites.create';

/**
 * LC-1: the lead-convert wizard's one Sites call — the new project's draft survey,
 * `POST /api/sites { projectId, data }` → 201 `{ siteId }` (dms `SiteEndpoints.cs:59-74`).
 *
 * CRM calls the route itself rather than through `@modules/sites`: that barrel loads the sites
 * pages, which import `@modules/crm`, and the import would close a module cycle. A 4xx is
 * `handled` because the wizard shows it inline on its progress list.
 */
@Injectable({ providedIn: 'root' })
export class CrmSiteSurveyService extends ApiService {
  createDraft(projectId: string, data: ConvertSiteData): Observable<string> {
    return this.post<unknown>(
      '/sites',
      { projectId, data },
      { context: handled(400, 403, 404, 409) },
    ).pipe(map((r) => this.unwrapId(r, 'siteId')));
  }
}
