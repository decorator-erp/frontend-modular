import { Injectable } from '@angular/core';
import { Observable } from 'rxjs';
import { map } from 'rxjs/operators';
import { TaskAttachment } from '../model/project.model';
import { ApiService } from '@platform/http/api.service';

/**
 * Task, stage and project files (crmp A-2). `/api/task-attachments` is REMOVED (gap table P-88..93); the
 * Documents module serves the same files (dms `Documents.Infrastructure/Endpoints/DocumentEndpoints.cs`,
 * `DocumentUploadEndpoints.cs`, `DocumentDownloadEndpoints.cs`). A `ProjectDocumentResponse` is mapped onto
 * the panel's `TaskAttachment` shape; `ruleId` has no Documents counterpart and is always null.
 */
@Injectable({ providedIn: 'root' })
export class TaskAttachmentService extends ApiService {
  /** `GET /api/project-tasks/{taskId}/documents` (DocumentEndpoints.cs:87). */
  getByTask(taskId: string): Observable<TaskAttachment[]> {
    return this.get<unknown>(`/project-tasks/${taskId}/documents`).pipe(
      map((r) => this.unwrapArray(r).map((a) => this.normalize(a))),
    );
  }

  /** `GET /api/project-stages/{stageId}/documents` (DocumentEndpoints.cs:77). */
  getByStage(stageId: string): Observable<TaskAttachment[]> {
    return this.get<unknown>(`/project-stages/${stageId}/documents`).pipe(
      map((r) => this.unwrapArray(r).map((a) => this.normalize(a))),
    );
  }

  /** `GET /api/projects/{projectId}/documents` (DocumentEndpoints.cs:57). */
  getByProject(projectId: string): Observable<TaskAttachment[]> {
    return this.get<unknown>(`/projects/${projectId}/documents`).pipe(
      map((r) => this.unwrapArray(r).map((a) => this.normalize(a))),
    );
  }

  /**
   * `POST /api/project-tasks/{taskId}/documents` (multipart: `file`, optional `folderId`, `description`;
   * DocumentUploadEndpoints.cs:68) → `{ documentId }`. `ruleId` is not a Documents field and is dropped.
   */
  upload(
    taskId: string,
    file: File,
    opts?: { ruleId?: string | null; description?: string; folderId?: string | null },
  ): Observable<string> {
    const form = new FormData();
    form.append('file', file);
    if (opts?.folderId) form.append('folderId', opts.folderId);
    if (opts?.description) form.append('description', opts.description);
    return this.post<unknown>(`/project-tasks/${taskId}/documents`, form).pipe(
      map((r) => this.unwrapId(r, 'documentId')),
    );
  }

  /** `GET /api/project-documents/{id}/download` (DocumentDownloadEndpoints.cs:21). */
  download(id: string): Observable<Blob> {
    return this.http.get(`${this.base}/project-documents/${id}/download`, { responseType: 'blob' });
  }

  /** `DELETE /api/project-documents/{id}` (DocumentEndpoints.cs:39). */
  remove(id: string): Observable<unknown> {
    return this.delete(`/project-documents/${id}`);
  }

  private normalize(source: unknown): TaskAttachment {
    return {
      id: this.field<string>(source, 'id') ?? '',
      taskId: this.field<string>(source, 'projectTaskId', 'taskId') ?? '',
      ruleId: null,
      fileName: this.field<string>(source, 'fileName') ?? '',
      contentType: this.field<string>(source, 'contentType') ?? '',
      fileSizeBytes: this.field<number>(source, 'fileSizeBytes') ?? 0,
      uploadedById: this.field<string>(source, 'uploadedById') ?? '',
      uploadedOnUtc: this.field<string>(source, 'uploadedOnUtc') ?? '',
    };
  }
}
