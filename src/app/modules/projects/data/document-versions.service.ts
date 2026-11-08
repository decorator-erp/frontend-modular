import { Injectable } from '@angular/core';
import { Observable } from 'rxjs';
import { map } from 'rxjs/operators';
import { ApiService } from '@platform/http/api.service';
import { handled } from '@platform/http/handled-errors';

/**
 * Sync F2: `ProjectDocumentResponse` with the lineage pair and the lock (dms
 * Documents.Contracts/Documents/DocumentContracts.cs:24-39). `rootDocumentId` equals a v1 document's
 * own id; every revision carries the same root with `version` + 1. There is no history endpoint —
 * the older versions stay active rows, so a lineage is read from a list by its root.
 */
export interface DocumentVersion {
  id: string;
  projectId: string;
  folderId: string | null;
  projectStageId: string | null;
  projectTaskId: string | null;
  fileName: string;
  contentType: string;
  sizeBytes: number;
  description: string | null;
  uploadedById: string;
  uploadedOnUtc: string;
  version: number;
  rootDocumentId: string;
  /** Set when a review is approved: blocks delete, move, a new version and another review. */
  isLocked: boolean;
}

/** A stage- or task-scoped folder (`DocumentFolderResponse`), the fields the pickers need. */
export interface ScopedFolder {
  id: string;
  name: string;
}

/** The newest version of each lineage, in the order the list first meets that lineage. */
export function latestPerLineage(docs: readonly DocumentVersion[]): DocumentVersion[] {
  const best = new Map<string, DocumentVersion>();
  const order: string[] = [];
  for (const d of docs) {
    const current = best.get(d.rootDocumentId);
    if (!current) order.push(d.rootDocumentId);
    if (!current || d.version > current.version) best.set(d.rootDocumentId, d);
  }
  return order.map((root) => best.get(root)!);
}

/** Every version of one lineage, newest first. */
export function lineageOf(docs: readonly DocumentVersion[], rootId: string): DocumentVersion[] {
  return docs.filter((d) => d.rootDocumentId === rootId).sort((a, b) => b.version - a.version);
}

/**
 * Sync F2: document revisions, review requests, stage uploads and stage/task folders (dms
 * DocumentEndpoints.cs, DocumentUploadEndpoints.cs, DocumentFolderEndpoints.cs). Kept apart from
 * `ProjectDocumentsService` so its normalizer stays as it is; this one reads the lineage fields.
 * Every multipart part is named exactly as the endpoint binds it (`file`, `folderId`,
 * `description`), and no `Content-Type` is set so the browser adds the boundary.
 */
@Injectable({ providedIn: 'root' })
export class DocumentVersionsService extends ApiService {
  /** `GET /project-documents/{id}` → one `ProjectDocumentResponse` (no history list). */
  getById(id: string): Observable<DocumentVersion> {
    return this.get<unknown>(`/project-documents/${id}`).pipe(
      map((r) => this.normalize(this.unwrap(r))),
    );
  }

  /** `GET /projects/{id}/documents` — every active row, older versions included. */
  getByProject(projectId: string): Observable<DocumentVersion[]> {
    return this.get<unknown>(`/projects/${projectId}/documents`).pipe(
      map((r) => this.unwrapArray(r).map((d) => this.normalize(d))),
    );
  }

  /** `GET /project-stages/{id}/documents` — the stage's rows, its tasks' included. */
  getByStage(stageId: string): Observable<DocumentVersion[]> {
    return this.get<unknown>(`/project-stages/${stageId}/documents`).pipe(
      map((r) => this.unwrapArray(r).map((d) => this.normalize(d))),
    );
  }

  /**
   * `POST /project-documents/{id}/revisions` (multipart `file`, `description?`; `documents.upload`)
   * → `{ documentId }` of the new version. A locked document is 409 `project_documents.Locked`;
   * the caller shows it.
   */
  uploadRevision(documentId: string, file: File, description?: string | null): Observable<string> {
    const form = new FormData();
    form.append('file', file);
    if (description?.trim()) form.append('description', description.trim());
    return this.post<unknown>(`/project-documents/${documentId}/revisions`, form, {
      context: handled(409),
    }).pipe(map((r) => this.unwrapId(r, 'documentId')));
  }

  /**
   * `POST /project-documents/{id}/request-review { approverEmployeeId }` (`documents.update`) →
   * `{ approvalId }`. Only the latest version of an unlocked lineage with no open review; the 409s
   * (`Locked`, `NotLatestVersion`, `ReviewInProgress`) are shown by the caller.
   */
  requestReview(documentId: string, approverEmployeeId: string): Observable<string> {
    return this.post<unknown>(
      `/project-documents/${documentId}/request-review`,
      { approverEmployeeId },
      { context: handled(409) },
    ).pipe(map((r) => this.unwrapId(r, 'approvalId')));
  }

  /** `POST /project-stages/{id}/documents` (multipart `file`, `folderId?`, `description?`) → `{ documentId }`. */
  uploadToStage(
    stageId: string,
    file: File,
    folderId?: string | null,
    description?: string | null,
  ): Observable<string> {
    const form = new FormData();
    form.append('file', file);
    if (folderId) form.append('folderId', folderId);
    if (description?.trim()) form.append('description', description.trim());
    return this.post<unknown>(`/project-stages/${stageId}/documents`, form).pipe(
      map((r) => this.unwrapId(r, 'documentId')),
    );
  }

  /** `GET /project-stages/{id}/document-folders`. */
  stageFolders(stageId: string): Observable<ScopedFolder[]> {
    return this.get<unknown>(`/project-stages/${stageId}/document-folders`).pipe(
      map((r) => this.unwrapArray(r).map((f) => this.folder(f))),
    );
  }

  /** `POST /project-stages/{id}/document-folders { name, parentFolderId? }` → `{ folderId }`. */
  createStageFolder(
    stageId: string,
    name: string,
    parentFolderId?: string | null,
  ): Observable<string> {
    return this.post<unknown>(`/project-stages/${stageId}/document-folders`, {
      name,
      parentFolderId: parentFolderId ?? null,
    }).pipe(map((r) => this.unwrapId(r, 'folderId')));
  }

  /** `POST /project-tasks/{id}/document-folders { name, parentFolderId? }` → `{ folderId }`. */
  createTaskFolder(
    taskId: string,
    name: string,
    parentFolderId?: string | null,
  ): Observable<string> {
    return this.post<unknown>(`/project-tasks/${taskId}/document-folders`, {
      name,
      parentFolderId: parentFolderId ?? null,
    }).pipe(map((r) => this.unwrapId(r, 'folderId')));
  }

  /** `GET /project-documents/{id}/download` — one version's bytes. */
  download(id: string): Observable<Blob> {
    return this.http.get(`${this.base}/project-documents/${id}/download`, { responseType: 'blob' });
  }

  private folder(source: unknown): ScopedFolder {
    return {
      id: this.field<string>(source, 'id') ?? '',
      name: this.field<string>(source, 'name') ?? '',
    };
  }

  private normalize(source: unknown): DocumentVersion {
    const id = this.field<string>(source, 'id') ?? '';
    return {
      id,
      projectId: this.field<string>(source, 'projectId') ?? '',
      folderId: this.field<string | null>(source, 'folderId') ?? null,
      projectStageId: this.field<string | null>(source, 'projectStageId') ?? null,
      projectTaskId: this.field<string | null>(source, 'projectTaskId') ?? null,
      fileName: this.field<string>(source, 'fileName') ?? '',
      contentType: this.field<string>(source, 'contentType') ?? '',
      sizeBytes: Number(this.field(source, 'fileSizeBytes', 'sizeBytes') ?? 0),
      description: this.field<string | null>(source, 'description') ?? null,
      uploadedById: this.field<string>(source, 'uploadedById', 'uploadedByUserId') ?? '',
      uploadedOnUtc: this.field<string>(source, 'uploadedOnUtc', 'createdAtUtc') ?? '',
      version: Number(this.field(source, 'version') ?? 1) || 1,
      rootDocumentId: this.field<string>(source, 'rootDocumentId') || id,
      isLocked: this.field<boolean>(source, 'isLocked') ?? false,
    };
  }
}
