import { Injectable } from '@angular/core';
import { Observable } from 'rxjs';
import { map } from 'rxjs/operators';
import { ApiService } from '@platform/http/api.service';

/** Mirrors DocumentFolderResponse (Documents.Contracts/Folders/FolderContracts.cs:8-15; 008b #6). */
export interface DocumentFolder {
  id: string;
  projectId: string;
  name: string;
  parentFolderId: string | null;
  projectStageId: string | null;
  projectTaskId: string | null;
  isDefault: boolean;
}

/** Mirrors ProjectDocumentListResponse / ProjectDocumentResponse (api-docs/09). */
export interface ProjectDocument {
  id: string;
  projectId: string;
  folderId: string | null;
  fileName: string;
  contentType: string;
  sizeBytes: number;
  description: string | null;
  uploadedByUserId: string;
  createdAtUtc: string;
}

/**
 * Document folders — `/api/document-folders` per
 * api-docs/09-documents-attachments-comments.md. Mutations require
 * Projects.ManageDocuments; reads require Projects.Read.
 */
@Injectable({ providedIn: 'root' })
export class DocumentFoldersService extends ApiService {
  /** POST / — CreateDocumentFolderRequest { projectId, name, parentFolderId? }. */
  create(projectId: string, name: string, parentFolderId?: string | null): Observable<string> {
    return this.post<unknown>('/document-folders', {
      projectId,
      name,
      parentFolderId: parentFolderId ?? null,
    }).pipe(map((r) => this.unwrap<string>(r)));
  }

  /** `GET /api/projects/{projectId}/document-folders` — ALL active folders of the project, by name (008b #6). */
  getByProject(projectId: string): Observable<DocumentFolder[]> {
    return this.get<unknown>(`/projects/${projectId}/document-folders`).pipe(
      map((r) => this.unwrapArray(r).map((f) => this.normalizeFolder(f))),
    );
  }

  /** GET /{id}/children — immediate child folders. */
  getChildren(folderId: string): Observable<DocumentFolder[]> {
    return this.get<unknown>(`/document-folders/${folderId}/children`).pipe(
      map((r) => this.unwrapArray(r).map((f) => this.normalizeFolder(f))),
    );
  }

  /** PUT /{id}/rename — RenameDocumentFolderRequest { name }. */
  rename(folderId: string, name: string): Observable<unknown> {
    return this.put(`/document-folders/${folderId}/rename`, { name });
  }

  /** PUT /{id}/move — MoveDocumentFolderRequest { targetParentFolderId? } (null = root). */
  move(folderId: string, targetParentFolderId: string | null): Observable<unknown> {
    return this.put(`/document-folders/${folderId}/move`, { targetParentFolderId });
  }

  /** DELETE /{id} — folder must be empty (document_folders.NotEmpty). */
  remove(folderId: string): Observable<unknown> {
    return this.delete(`/document-folders/${folderId}`);
  }

  private normalizeFolder(source: unknown): DocumentFolder {
    return {
      id: this.field<string>(source, 'id') ?? '',
      projectId: this.field<string>(source, 'projectId') ?? '',
      name: this.field<string>(source, 'name') ?? '',
      parentFolderId: this.field<string | null>(source, 'parentFolderId') ?? null,
      projectStageId: this.field<string | null>(source, 'projectStageId') ?? null,
      projectTaskId: this.field<string | null>(source, 'projectTaskId') ?? null,
      isDefault: this.field<boolean>(source, 'isDefault') ?? false,
    };
  }
}

/**
 * Project documents — `/api/project-documents` per api-docs/09. Upload is
 * multipart/form-data; mutations require Projects.ManageDocuments.
 */
@Injectable({ providedIn: 'root' })
export class ProjectDocumentsService extends ApiService {
  /**
   * `POST /api/project-documents` — `multipart/form-data`, permission
   * `projects.manage_documents`. Returns `201` with a bare `Guid` body.
   *
   * ⚠️ **The file part must be named exactly `file`.** The endpoint binds by part name,
   * so `files`, `upload` or `document` bind to nothing and the request fails as an empty
   * upload (`project_documents.EmptyFile`).
   *
   * Do NOT set a `Content-Type` header: the browser must set it itself so it can append
   * the multipart boundary.
   *
   * Feature 004 (Dependency 6) needs this for the brief attachments card — it targets the
   * `"Requirement gathering"` folder (lowercase `g`), which the server seeds in the same
   * transaction that opens the requirement period, so it exists by the time any CRM
   * screen renders.
   */
  upload(
    projectId: string,
    file: File,
    folderId?: string | null,
    description?: string | null,
  ): Observable<string> {
    const form = new FormData();
    form.append('projectId', projectId);
    form.append('file', file);
    if (folderId) form.append('folderId', folderId);
    if (description) form.append('description', description);

    return this.post<unknown>('/project-documents', form).pipe(map((r) => this.unwrap<string>(r)));
  }

  getByProject(projectId: string): Observable<ProjectDocument[]> {
    return this.get<unknown>(`/project-documents/by-project/${projectId}`).pipe(
      map((r) => this.unwrapArray(r).map((d) => this.normalizeDocument(d))),
    );
  }

  getByFolder(folderId: string): Observable<ProjectDocument[]> {
    return this.get<unknown>(`/project-documents/by-folder/${folderId}`).pipe(
      map((r) => this.unwrapArray(r).map((d) => this.normalizeDocument(d))),
    );
  }

  /** GET /{id}/download — file binary stream. */
  download(id: string): Observable<Blob> {
    return this.http.get(`${this.base}/project-documents/${id}/download`, { responseType: 'blob' });
  }

  /** PUT /{id}/move — MoveProjectDocumentRequest { targetFolderId? } (null = root). */
  move(id: string, targetFolderId: string | null): Observable<unknown> {
    return this.put(`/project-documents/${id}/move`, { targetFolderId });
  }

  remove(id: string): Observable<unknown> {
    return this.delete(`/project-documents/${id}`);
  }

  private normalizeDocument(source: unknown): ProjectDocument {
    return {
      id: this.field<string>(source, 'id') ?? '',
      projectId: this.field<string>(source, 'projectId') ?? '',
      folderId: this.field<string | null>(source, 'folderId') ?? null,
      fileName: this.field<string>(source, 'fileName') ?? '',
      contentType: this.field<string>(source, 'contentType') ?? '',
      sizeBytes: this.field<number>(source, 'sizeBytes') ?? 0,
      description: this.field<string | null>(source, 'description') ?? null,
      uploadedByUserId: this.field<string>(source, 'uploadedByUserId') ?? '',
      createdAtUtc: this.field<string>(source, 'createdAtUtc') ?? '',
    };
  }
}
