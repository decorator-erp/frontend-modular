import { Injectable } from '@angular/core';
import { Observable, map } from 'rxjs';
import { ApiService } from '@platform/http/api.service';
import { handled } from '@platform/http/handled-errors';
import {
  normalizeBoq,
  normalizeDetail,
  normalizeDocumentLink,
  normalizeFamilies,
  normalizeGrouped,
  normalizePage,
  normalizePivot,
} from '../model/site-normalize';
import type {
  BulkSiteRecordRequest,
  CreateSiteRecordRequest,
  LinkSiteDocumentRequest,
  SiteBoq,
  SiteDetail,
  SiteDocumentLink,
  SiteFamilies,
  SiteGrouped,
  SiteListQuery,
  SitePage,
  SitePivot,
  SiteUnitData,
  SiteValueRequest,
  UpdateSiteRecordRequest,
} from '../model/site.model';

/**
 * sites S-1: the survey routes R1–R20 (dms `Sites.Infrastructure/Endpoints/SiteEndpoints.cs`). Every
 * screen shows these errors itself (inline or as its own toast), so each call marks the statuses it
 * answers with as handled — the global interceptor toasts none of them twice.
 */
@Injectable({ providedIn: 'root' })
export class SiteService extends ApiService {
  private static readonly WRITE = () => handled(400, 403, 404, 409);

  /** R1 `GET /api/sites?projectId&status&pageIndex&pageSize` (`:42-57`): pages on `pageIndex`, never `pageNumber`. */
  list(query: SiteListQuery): Observable<SitePage> {
    return this.get<unknown>(
      '/sites',
      {
        projectId: query.projectId,
        status: query.status ?? null,
        pageIndex: query.pageIndex ?? 1,
        pageSize: query.pageSize ?? 25,
      },
      { context: handled(400, 403, 404) },
    ).pipe(map(normalizePage));
  }

  /** R2 `POST /api/sites` (`:59-74`) → 201 `{ siteId }`. */
  create(projectId: string, data: SiteUnitData): Observable<string> {
    return this.post<unknown>('/sites', { projectId, data }, { context: SiteService.WRITE() }).pipe(
      map((r) => this.unwrapId(r, 'siteId')),
    );
  }

  /** R3 `GET /api/sites/{siteId}` (`:78-86`); 404 is the page's own not-found state. */
  getById(siteId: string): Observable<SiteDetail> {
    return this.get<unknown>(`/sites/${siteId}`, undefined, { context: handled(404) }).pipe(
      map(normalizeDetail),
    );
  }

  /** R4 `PUT /api/sites/{siteId}` `{ data }` (`:88-96`): a full replace of the unit data. */
  update(siteId: string, data: SiteUnitData): Observable<void> {
    return this.put<void>(`/sites/${siteId}`, { data }, { context: SiteService.WRITE() });
  }

  /** R5 `DELETE /api/sites/{siteId}` (`:98-106`): soft delete. */
  remove(siteId: string): Observable<void> {
    return this.delete<void>(`/sites/${siteId}`, undefined, { context: SiteService.WRITE() });
  }

  /** R6 `POST /api/sites/{siteId}/submit` (`:108-123`), no body. */
  submit(siteId: string): Observable<void> {
    return this.post<void>(`/sites/${siteId}/submit`, null, { context: SiteService.WRITE() });
  }

  /** R7 `POST /api/sites/{siteId}/approve` `{ approved, note }` (`:125-140`). */
  decide(siteId: string, approved: boolean, note: string | null): Observable<void> {
    return this.post<void>(
      `/sites/${siteId}/approve`,
      { approved, note: note || null },
      { context: SiteService.WRITE() },
    );
  }

  /** R8 `POST /api/sites/{siteId}/reopen` (`:143-151`), no body: Rejected → Draft. */
  reopen(siteId: string): Observable<void> {
    return this.post<void>(`/sites/${siteId}/reopen`, null, { context: SiteService.WRITE() });
  }

  /** R9 `GET /api/sites/{siteId}/records?moduleId` (`:155-163`): the module's pivot. */
  pivot(siteId: string, moduleId: string): Observable<SitePivot> {
    return this.get<unknown>(
      `/sites/${siteId}/records`,
      { moduleId },
      { context: handled(404) },
    ).pipe(map(normalizePivot));
  }

  /** R10 `POST /api/sites/{siteId}/records` (`:165-175`) → 201 `{ recordId }`. */
  addRecord(siteId: string, req: CreateSiteRecordRequest): Observable<string> {
    return this.post<unknown>(
      `/sites/${siteId}/records`,
      {
        moduleId: req.moduleId,
        label: req.label,
        spaceId: req.spaceId ?? null,
        catalogItemId: req.catalogItemId ?? null,
        sortOrder: req.sortOrder ?? 0,
        note: req.note ?? null,
      },
      { context: SiteService.WRITE() },
    ).pipe(map((r) => this.unwrapId(r, 'recordId')));
  }

  /** R11 `POST /api/sites/{siteId}/records/bulk` `{ records }` (`:177-185`): one transaction. */
  bulkSave(siteId: string, records: BulkSiteRecordRequest[]): Observable<void> {
    return this.post<void>(
      `/sites/${siteId}/records/bulk`,
      { records },
      { context: SiteService.WRITE() },
    );
  }

  /** R12 `GET /api/sites/{siteId}/records/grouped` (`:187-195`). */
  grouped(siteId: string): Observable<SiteGrouped> {
    return this.get<unknown>(`/sites/${siteId}/records/grouped`, undefined, {
      context: handled(404),
    }).pipe(map(normalizeGrouped));
  }

  /** R13 `PUT /api/sites/{siteId}/records/{recordId}` (`:197-206`). */
  updateRecord(siteId: string, recordId: string, req: UpdateSiteRecordRequest): Observable<void> {
    return this.put<void>(`/sites/${siteId}/records/${recordId}`, req, {
      context: SiteService.WRITE(),
    });
  }

  /** R14 `DELETE /api/sites/{siteId}/records/{recordId}` (`:208-216`). */
  deleteRecord(siteId: string, recordId: string): Observable<void> {
    return this.delete<void>(`/sites/${siteId}/records/${recordId}`, undefined, {
      context: SiteService.WRITE(),
    });
  }

  /** R15 `PUT /api/sites/{siteId}/records/{recordId}/values` `{ values }` (`:218-227`): full replace. */
  setValues(siteId: string, recordId: string, values: SiteValueRequest[]): Observable<void> {
    return this.put<void>(
      `/sites/${siteId}/records/${recordId}/values`,
      { values },
      { context: SiteService.WRITE() },
    );
  }

  /** R16 `GET /api/sites/{siteId}/families?moduleId&groupBy` (`:231-239`). */
  families(siteId: string, moduleId: string, groupBy?: string | null): Observable<SiteFamilies> {
    return this.get<unknown>(
      `/sites/${siteId}/families`,
      { moduleId, groupBy: groupBy ?? null },
      { context: handled(400, 404) },
    ).pipe(map(normalizeFamilies));
  }

  /** R17 `GET /api/sites/{siteId}/boq` (`:241-249`). */
  boq(siteId: string): Observable<SiteBoq> {
    return this.get<unknown>(`/sites/${siteId}/boq`, undefined, { context: handled(404) }).pipe(
      map(normalizeBoq),
    );
  }

  /** R18 `GET /api/sites/{siteId}/documents` (`:253-262`): a plain array. */
  documents(siteId: string): Observable<SiteDocumentLink[]> {
    return this.get<unknown>(`/sites/${siteId}/documents`, undefined, {
      context: handled(404),
    }).pipe(map((r) => this.unwrapArray<unknown>(r).map(normalizeDocumentLink)));
  }

  /** R19 `POST /api/sites/{siteId}/documents` (`:264-281`) → 201 `{ documentLinkId }`. */
  linkDocument(siteId: string, req: LinkSiteDocumentRequest): Observable<string> {
    return this.post<unknown>(
      `/sites/${siteId}/documents`,
      { documentId: req.documentId, kind: req.kind, recordId: req.recordId ?? null },
      { context: SiteService.WRITE() },
    ).pipe(map((r) => this.unwrapId(r, 'documentLinkId')));
  }

  /** R20 `DELETE /api/sites/{siteId}/documents/{documentLinkId}` (`:283-292`): unlink only. */
  unlinkDocument(siteId: string, documentLinkId: string): Observable<void> {
    return this.delete<void>(`/sites/${siteId}/documents/${documentLinkId}`, undefined, {
      context: SiteService.WRITE(),
    });
  }
}
