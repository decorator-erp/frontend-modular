import { Injectable } from '@angular/core';
import { Observable } from 'rxjs';
import { map } from 'rxjs/operators';
import { ApiService } from '@platform/http/api.service';
import { handled } from '@platform/http/handled-errors';
import type { CrmArtifactLink, CrmArtifactSubject } from '../model';

/** One literal route per subject, so each URL is greppable against the backend route list. */
const LIST_PATH: Record<CrmArtifactSubject, (id: string) => string> = {
  brief: (id) => `/crm/artifacts/by-brief/${id}`,
  space: (id) => `/crm/artifacts/by-space/${id}`,
  'requirement-item': (id) => `/crm/artifacts/by-requirement-item/${id}`,
  meeting: (id) => `/crm/artifacts/by-meeting/${id}`,
};

/** The one subject key `POST /crm/artifacts` takes for each subject (CrmArtifactEndpoints.cs:125). */
const SUBJECT_KEY: Record<CrmArtifactSubject, string> = {
  brief: 'briefId',
  space: 'spaceId',
  'requirement-item': 'requirementItemId',
  meeting: 'meetingId',
};

/** The backend's default and maximum page (`CrmArtifactLists.MaxRows`, contract §2.12). */
export const ARTIFACT_MAX_PAGE_SIZE = 200;

/**
 * crmp C-7: CRM artifact links — `/api/crm/artifacts` (`Crm.Infrastructure/Endpoints/CrmArtifactEndpoints.cs`,
 * contract §2.12). Reads `crm.artifacts.read`. The by-subject lists (#70–#73) take `pageNumber`/`pageSize`
 * but stay a PLAIN ARRAY (no `totalCount`): a page shorter than `pageSize` is the last one.
 */
@Injectable({ providedIn: 'root' })
export class CrmArtifactService extends ApiService {
  /**
   * #70–#73 `GET /api/crm/artifacts/by-{subject}/{id}?pageNumber&pageSize` (:65, :79, :93, :108) → one
   * page, oldest first. 404 is the subject's scope code (shown by the caller).
   */
  listBySubject(
    subject: CrmArtifactSubject,
    subjectId: string,
    pageNumber: number,
    pageSize: number,
  ): Observable<CrmArtifactLink[]> {
    return this.get<unknown>(
      LIST_PATH[subject](subjectId),
      { pageNumber, pageSize },
      { context: handled(403, 404) },
    ).pipe(map((r) => this.unwrapArray<unknown>(r).map((l) => this.normalizeLink(l))));
  }

  /**
   * Sync F4c: `POST /api/crm/artifacts { documentId, <exactly one of briefId | spaceId |
   * requirementItemId | meetingId> }` → `201 { artifactDocumentId }` (CrmArtifactEndpoints.cs:27,
   * `crm.artifacts.manage`). The author is the calling employee, resolved by the server. 409
   * `AlreadyLinked` / `SubjectLocked` and 404 `DocumentNotFound` are the caller's to show.
   */
  link(subject: CrmArtifactSubject, subjectId: string, documentId: string): Observable<string> {
    return this.post<unknown>(
      '/crm/artifacts',
      { documentId, [SUBJECT_KEY[subject]]: subjectId },
      { context: handled(403, 404, 409) },
    ).pipe(map((r) => this.unwrapId(r, 'artifactDocumentId')));
  }

  /**
   * #120 `DELETE /api/crm/artifacts/{linkId}` (:58) → 204. Route claim `crm.artifacts.read`; the handler
   * allows the linker or a `crm.artifacts.manage` holder, else 403 `crm.artifacts.NotLinker`; 404
   * `crm.artifacts.LinkNotFound`. The document itself stays.
   */
  unlink(linkId: string): Observable<void> {
    return this.delete<void>(`/crm/artifacts/${linkId}`, undefined, {
      context: handled(403, 404),
    });
  }

  private normalizeLink(source: unknown): CrmArtifactLink {
    return {
      id: this.field<string>(source, 'id') ?? '',
      documentId: this.field<string>(source, 'documentId') ?? '',
      briefId: this.field<string | null>(source, 'briefId') ?? null,
      spaceId: this.field<string | null>(source, 'spaceId') ?? null,
      requirementItemId: this.field<string | null>(source, 'requirementItemId') ?? null,
      meetingId: this.field<string | null>(source, 'meetingId') ?? null,
      addedByEmployeeId: this.field<string | null>(source, 'addedByEmployeeId') ?? null,
      addedByContactId: this.field<string | null>(source, 'addedByContactId') ?? null,
    };
  }
}
