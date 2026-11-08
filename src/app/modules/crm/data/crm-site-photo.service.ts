import { Injectable } from '@angular/core';
import { Observable } from 'rxjs';
import { map } from 'rxjs/operators';
import { ApiService } from '@platform/http/api.service';
import { handled } from '@platform/http/handled-errors';

/** One survey of the project, for the picker's survey select. */
export interface CrmSiteOption {
  id: string;
  code: string;
}

/** One document link of a survey (`SiteDocumentResponse`); `kind` 3 = Photo (`SiteDocumentKind`). */
export interface CrmSiteDocumentLink {
  id: string;
  documentId: string;
  kind: number;
}

/** `SiteDocumentKind.Photo` (dms Sites.Contracts): the only kind a SitePhoto share accepts. */
export const SITE_PHOTO_KIND = 3;

/**
 * crmp P2-B: the two Sites reads the Client portal picker needs (dms `SiteEndpoints.cs`, both
 * `sites.read`): the project's surveys (`GET /api/sites?projectId&pageIndex&pageSize`, :42-57) and a
 * survey's document links (`GET /api/sites/{siteId}/documents`, :253-262). Read here rather than
 * through `@modules/sites`, because sites imports the crm barrel for the share action and a
 * crm -> sites barrel import would close a module cycle (DEVIATION-45). The picker shows its own
 * message, so 403/404 are handled.
 */
@Injectable({ providedIn: 'root' })
export class CrmSitePhotoService extends ApiService {
  listSites(projectId: string): Observable<CrmSiteOption[]> {
    return this.get<unknown>(
      '/sites',
      { projectId, pageIndex: 1, pageSize: 100 },
      { context: handled(403, 404) },
    ).pipe(
      map((r) =>
        this.unwrapArray(r).map((s) => ({
          id: this.field<string>(s, 'id') ?? '',
          code: this.field<string>(s, 'code') ?? '',
        })),
      ),
    );
  }

  documents(siteId: string): Observable<CrmSiteDocumentLink[]> {
    return this.get<unknown>(`/sites/${siteId}/documents`, undefined, {
      context: handled(403, 404),
    }).pipe(
      map((r) =>
        this.unwrapArray(r).map((d) => {
          const kind = this.field<unknown>(d, 'kind');
          return {
            id: this.field<string>(d, 'id') ?? '',
            documentId: this.field<string>(d, 'documentId') ?? '',
            kind: kind === 'Photo' ? SITE_PHOTO_KIND : Number(kind),
          };
        }),
      ),
    );
  }
}
