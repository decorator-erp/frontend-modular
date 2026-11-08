import { Injectable } from '@angular/core';
import { Observable } from 'rxjs';
import { map } from 'rxjs/operators';
import { ApiService } from '@platform/http/api.service';
import { handled } from '@platform/http/handled-errors';
import type { PortalFile, PortalOverview, PortalTask, PortalUpdate } from '../model/portal.model';
import {
  normalizeFile,
  normalizeOverview,
  normalizeTask,
  normalizeUpdate,
} from './portal-normalize';

/**
 * crmp P2-B: what the client sees of one of its own projects (dms `CrmPortalVisibilityEndpoints.cs:156-222`,
 * group `/api/crm/portal/projects/{projectId}`). Another client's project, an unknown one, or a section
 * that is off is a 404; each tab turns 403/404 into its own message, so both are handled.
 *
 * Overview, tasks and updates need `crm.portal.progress.view_own`; files, gallery and the file stream
 * need `crm.portal.files.view_own`.
 */
@Injectable({ providedIn: 'root' })
export class CrmPortalContentService extends ApiService {
  private static readonly READ = () => handled(403, 404);

  private root(projectId: string): string {
    return `/crm/portal/projects/${projectId}`;
  }

  /** `GET /overview` (`:158-164`). */
  getOverview(projectId: string): Observable<PortalOverview> {
    return this.get<unknown>(`${this.root(projectId)}/overview`, undefined, {
      context: CrmPortalContentService.READ(),
    }).pipe(map((r) => normalizeOverview(this.unwrap(r))));
  }

  /** `GET /files` (`:182-188`): 404 while Documents is off. */
  getFiles(projectId: string): Observable<PortalFile[]> {
    return this.list(`${this.root(projectId)}/files`, normalizeFile);
  }

  /** `GET /gallery` (`:190-196`): 404 while both Gallery and Site surveys are off. */
  getGallery(projectId: string): Observable<PortalFile[]> {
    return this.list(`${this.root(projectId)}/gallery`, normalizeFile);
  }

  /** `GET /tasks` (`:166-172`): 404 while Tasks is off. */
  getTasks(projectId: string): Observable<PortalTask[]> {
    return this.list(`${this.root(projectId)}/tasks`, normalizeTask);
  }

  /** `GET /updates` (`:174-180`): published only, newest first; 404 while Updates is off. */
  getUpdates(projectId: string): Observable<PortalUpdate[]> {
    return this.list(`${this.root(projectId)}/updates`, normalizeUpdate);
  }

  /** The stream route of one shared file (`:200-221`). Built here, never read off `PortalFile.url`. */
  fileUrl(projectId: string, shareId: string): string {
    return `${this.base}${this.root(projectId)}/files/${shareId}`;
  }

  /**
   * `GET /files/{shareId}` as a blob: the route needs the bearer token, which a plain `<img src>` or
   * `<a href>` would not carry, so thumbnails and downloads go through `HttpClient`.
   */
  fileBlob(projectId: string, shareId: string): Observable<Blob> {
    return this.http.get(this.fileUrl(projectId, shareId), {
      responseType: 'blob',
      context: CrmPortalContentService.READ(),
    });
  }

  private list<T>(path: string, normalize: (o: unknown) => T): Observable<T[]> {
    return this.get<unknown>(path, undefined, { context: CrmPortalContentService.READ() }).pipe(
      map((r) => this.unwrapArray(r).map(normalize)),
    );
  }
}
