import { Injectable } from '@angular/core';
import { Observable } from 'rxjs';
import { map } from 'rxjs/operators';
import { ApiService } from '@platform/http/api.service';
import { handled } from '@platform/http/handled-errors';
import type {
  CreatePortalShareRequest,
  PortalPreview,
  PortalSections,
  PortalSettings,
  PortalShare,
  PortalShareKind,
  PortalUpdateDraft,
  PortalUpdateRequest,
  UpdatePortalShareRequest,
} from '../model/portal.model';
import {
  normalizePreview,
  normalizeSections,
  normalizeShare,
  normalizeUpdateDraft,
} from './portal-normalize';

/**
 * crmp P2-B: the office side of the client portal (dms `CrmPortalVisibilityEndpoints.cs:35-154`, group
 * `/api/crm/projects/{projectId}/portal`). Reads accept `crm.portal.manage` or `clients.read`; every
 * write needs `crm.portal.manage`. Every screen shows these errors itself (inline or as its own
 * toast), so each call marks the statuses it answers with as handled.
 */
@Injectable({ providedIn: 'root' })
export class CrmPortalVisibilityService extends ApiService {
  private static readonly READ = () => handled(403, 404);
  private static readonly WRITE = () => handled(400, 403, 404, 409);

  private root(projectId: string): string {
    return `/crm/projects/${projectId}/portal`;
  }

  /** `GET /settings` (`:37-43`). */
  getSettings(projectId: string): Observable<PortalSettings> {
    return this.get<unknown>(`${this.root(projectId)}/settings`, undefined, {
      context: CrmPortalVisibilityService.READ(),
    }).pipe(
      map((r) => {
        const o = this.unwrap(r);
        return {
          projectId: this.field<string>(o, 'projectId') ?? projectId,
          ...normalizeSections(o),
        };
      }),
    );
  }

  /** `PUT /settings` (`:45-53`): replaces all six switches → 204. */
  saveSettings(projectId: string, sections: PortalSections): Observable<void> {
    const body: PortalSections = {
      progress: sections.progress,
      tasks: sections.tasks,
      documents: sections.documents,
      gallery: sections.gallery,
      siteSurveys: sections.siteSurveys,
      updates: sections.updates,
    };
    return this.put<void>(`${this.root(projectId)}/settings`, body, {
      context: CrmPortalVisibilityService.WRITE(),
    });
  }

  /** `GET /shares?kind=` (`:55-62`): active shares in display order. */
  getShares(projectId: string, kind?: PortalShareKind | null): Observable<PortalShare[]> {
    return this.get<unknown>(
      `${this.root(projectId)}/shares`,
      { kind: kind ?? null },
      { context: CrmPortalVisibilityService.READ() },
    ).pipe(
      map((r) =>
        this.unwrapArray(r)
          .map(normalizeShare)
          .sort((a, b) => a.sortOrder - b.sortOrder),
      ),
    );
  }

  /** `POST /shares` (`:64-73`) → 201 `{ shareId }`. */
  createShare(projectId: string, req: CreatePortalShareRequest): Observable<string> {
    const body = {
      itemKind: req.itemKind,
      itemId: req.itemId,
      clientTitle: req.clientTitle?.trim() || null,
      clientNote: req.clientNote?.trim() || null,
      followLatest: req.followLatest ?? true,
      sortOrder: req.sortOrder ?? null,
      notifyClient: req.notifyClient ?? false,
    };
    return this.post<unknown>(`${this.root(projectId)}/shares`, body, {
      context: CrmPortalVisibilityService.WRITE(),
    }).pipe(map((r) => this.unwrapId(r, 'shareId')));
  }

  /** `PUT /shares/order` (`:76-83`) → 204. */
  reorderShares(projectId: string, shareIds: string[]): Observable<void> {
    return this.put<void>(
      `${this.root(projectId)}/shares/order`,
      { shareIds },
      { context: CrmPortalVisibilityService.WRITE() },
    );
  }

  /** `PUT /shares/{shareId}` (`:85-92`) → 204. */
  updateShare(projectId: string, shareId: string, req: UpdatePortalShareRequest): Observable<void> {
    const body: UpdatePortalShareRequest = {
      clientTitle: req.clientTitle?.trim() || null,
      clientNote: req.clientNote?.trim() || null,
    };
    if (req.followLatest !== undefined) body.followLatest = req.followLatest;
    return this.put<void>(`${this.root(projectId)}/shares/${shareId}`, body, {
      context: CrmPortalVisibilityService.WRITE(),
    });
  }

  /** `DELETE /shares/{shareId}` (`:94-100`): unshare (soft delete) → 204. */
  deleteShare(projectId: string, shareId: string): Observable<void> {
    return this.delete<void>(`${this.root(projectId)}/shares/${shareId}`, undefined, {
      context: CrmPortalVisibilityService.WRITE(),
    });
  }

  /** `GET /updates` (`:102-109`): drafts included, newest first. */
  getUpdates(projectId: string): Observable<PortalUpdateDraft[]> {
    return this.get<unknown>(`${this.root(projectId)}/updates`, undefined, {
      context: CrmPortalVisibilityService.READ(),
    }).pipe(map((r) => this.unwrapArray(r).map(normalizeUpdateDraft)));
  }

  /** `POST /updates` (`:111-119`) → 201 `{ updateId }` (a draft). */
  createUpdate(projectId: string, req: PortalUpdateRequest): Observable<string> {
    return this.post<unknown>(`${this.root(projectId)}/updates`, this.updateBody(req), {
      context: CrmPortalVisibilityService.WRITE(),
    }).pipe(map((r) => this.unwrapId(r, 'updateId')));
  }

  /** `PUT /updates/{updateId}` (`:121-128`) → 204. */
  editUpdate(projectId: string, updateId: string, req: PortalUpdateRequest): Observable<void> {
    return this.put<void>(`${this.root(projectId)}/updates/${updateId}`, this.updateBody(req), {
      context: CrmPortalVisibilityService.WRITE(),
    });
  }

  /** `DELETE /updates/{updateId}` (`:130-136`) → 204. */
  deleteUpdate(projectId: string, updateId: string): Observable<void> {
    return this.delete<void>(`${this.root(projectId)}/updates/${updateId}`, undefined, {
      context: CrmPortalVisibilityService.WRITE(),
    });
  }

  /** `POST /updates/{updateId}/publish` (`:138-145`) → 204, or 409 `crm.portal.AlreadyPublished`. */
  publishUpdate(projectId: string, updateId: string, notifyClient: boolean): Observable<void> {
    return this.post<void>(
      `${this.root(projectId)}/updates/${updateId}/publish`,
      { notifyClient },
      { context: CrmPortalVisibilityService.WRITE() },
    );
  }

  /** `GET /preview` (`:147-153`): exactly what the client would see. */
  getPreview(projectId: string): Observable<PortalPreview> {
    return this.get<unknown>(`${this.root(projectId)}/preview`, undefined, {
      context: CrmPortalVisibilityService.READ(),
    }).pipe(map((r) => normalizePreview(this.unwrap(r))));
  }

  private updateBody(req: PortalUpdateRequest): {
    title: string;
    body: string | null;
    shareIds: string[];
  } {
    return {
      title: req.title.trim(),
      body: req.body?.trim() || null,
      shareIds: req.shareIds ?? [],
    };
  }
}
