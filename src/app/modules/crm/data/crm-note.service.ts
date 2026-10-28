import { Injectable } from '@angular/core';
import { Observable } from 'rxjs';
import { map } from 'rxjs/operators';
import { ApiService } from '@platform/http/api.service';

/** Mirrors `NoteResponse`. */
export interface CrmNote {
  id: string;
  clientId: string;
  projectId: string | null;
  content: string;
  writtenById: string;
  createdAtUtc: string;
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
 */
@Injectable({ providedIn: 'root' })
export class CrmNoteService extends ApiService {
  /** `POST /api/crm/clients/{clientId}/notes` → `201` with a bare `Guid`. */
  add(clientId: string, request: CreateNoteRequest): Observable<string> {
    return this.post<unknown>(`/crm/clients/${clientId}/notes`, request).pipe(
      map((r) => this.unwrap<string>(r)),
    );
  }

  /** `GET /api/crm/clients/{clientId}/notes` — every note for the client, unpaged. */
  getForClient(clientId: string): Observable<CrmNote[]> {
    return this.get<unknown>(`/crm/clients/${clientId}/notes`).pipe(
      map((r) => this.unwrapArray<unknown>(r).map((n) => this.normalize(n))),
    );
  }

  /** `PUT /api/crm/notes/{noteId}` → `204`. */
  update(noteId: string, request: UpdateNoteRequest): Observable<void> {
    return this.put<void>(`/crm/notes/${noteId}`, request);
  }

  /** `DELETE /api/crm/notes/{noteId}` → `204`. */
  remove(noteId: string): Observable<void> {
    return this.delete<void>(`/crm/notes/${noteId}`);
  }

  private normalize(source: unknown): CrmNote {
    return {
      id: this.field<string>(source, 'id') ?? '',
      clientId: this.field<string>(source, 'clientId') ?? '',
      projectId: this.field<string | null>(source, 'projectId') ?? null,
      content: this.field<string>(source, 'content') ?? '',
      writtenById: this.field<string>(source, 'writtenById') ?? '',
      createdAtUtc: this.field<string>(source, 'createdAtUtc') ?? '',
    };
  }
}
