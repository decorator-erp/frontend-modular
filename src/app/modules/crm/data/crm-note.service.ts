import { Injectable } from '@angular/core';
import { Observable } from 'rxjs';
import { map } from 'rxjs/operators';
import { ApiService } from '@platform/http/api.service';
import { handled } from '@platform/http/handled-errors';

/** Mirrors `CrmClientNoteResponse` (`ClientNoteContracts.cs:8-9`): no date (009b #33). */
export interface CrmNote {
  id: string;
  clientId: string;
  projectId: string | null;
  content: string;
  writtenById: string;
}

export interface CreateNoteRequest {
  projectId?: string | null;
  content: string;
}

export interface UpdateNoteRequest {
  content: string;
}

/**
 * Client-level internal notes — `/api/crm/clients/{clientId}/notes` (list/create),
 * `/api/crm/notes/{noteId}` (update/delete). `crm.notes.read` on the list,
 * `crm.notes.create/update/delete` on the respective mutations.
 *
 * Authorship is server-authoritative (D-e): update and delete answer 403 `crm.notes.NotAuthor`
 * unless the caller wrote the note or holds `crm.notes.manage_all`. Both mark `handled(403)` so
 * the caller shows that message instead of the generic permission toast (009b #33, X-6).
 */
@Injectable({ providedIn: 'root' })
export class CrmNoteService extends ApiService {
  /** `POST /api/crm/clients/{clientId}/notes` → `201 { noteId }` (009b #33). */
  add(clientId: string, request: CreateNoteRequest): Observable<string> {
    return this.post<unknown>(`/crm/clients/${clientId}/notes`, request).pipe(
      map((r) => this.unwrapId(r, 'noteId')),
    );
  }

  /** `GET /api/crm/clients/{clientId}/notes` — every note for the client, unpaged. */
  getForClient(clientId: string): Observable<CrmNote[]> {
    return this.get<unknown>(`/crm/clients/${clientId}/notes`).pipe(
      map((r) => this.unwrapArray<unknown>(r).map((n) => this.normalize(n))),
    );
  }

  /** `PUT /api/crm/notes/{noteId}` → `204`; 403 `crm.notes.NotAuthor` is the caller's. */
  update(noteId: string, request: UpdateNoteRequest): Observable<void> {
    return this.put<void>(`/crm/notes/${noteId}`, request, { context: handled(403) });
  }

  /** `DELETE /api/crm/notes/{noteId}` → `204`; 403 `crm.notes.NotAuthor` is the caller's. */
  remove(noteId: string): Observable<void> {
    return this.delete<void>(`/crm/notes/${noteId}`, undefined, { context: handled(403) });
  }

  private normalize(source: unknown): CrmNote {
    return {
      id: this.field<string>(source, 'id') ?? '',
      clientId: this.field<string>(source, 'clientId') ?? '',
      projectId: this.field<string | null>(source, 'projectId') ?? null,
      content: this.field<string>(source, 'content') ?? '',
      writtenById: this.field<string>(source, 'writtenById') ?? '',
    };
  }
}
