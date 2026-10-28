import { Injectable } from '@angular/core';
import { Observable } from 'rxjs';
import { map } from 'rxjs/operators';
import { TaskAttachment } from '../model/project.model';
import { ApiService } from '@platform/http/api.service';

/** Task attachments — `/api/task-attachments` (multipart upload, file download). */
@Injectable({ providedIn: 'root' })
export class TaskAttachmentService extends ApiService {
  getByTask(taskId: string): Observable<TaskAttachment[]> {
    return this.get<unknown>(`/task-attachments/by-task/${taskId}`).pipe(
      map((r) => this.unwrapArray(r).map((a) => this.normalize(a))),
    );
  }
  getByStage(stageId: string): Observable<TaskAttachment[]> {
    return this.get<unknown>(`/task-attachments/by-stage/${stageId}`).pipe(
      map((r) => this.unwrapArray(r).map((a) => this.normalize(a))),
    );
  }
  getByProject(projectId: string): Observable<TaskAttachment[]> {
    return this.get<unknown>(`/task-attachments/by-project/${projectId}`).pipe(
      map((r) => this.unwrapArray(r).map((a) => this.normalize(a))),
    );
  }

  /** Upload a file (multipart/form-data). HttpClient sets the boundary automatically. */
  upload(
    taskId: string,
    file: File,
    opts?: { ruleId?: string | null; description?: string },
  ): Observable<string> {
    const form = new FormData();
    form.append('file', file);
    form.append('taskId', taskId);
    if (opts?.ruleId) form.append('ruleId', opts.ruleId);
    if (opts?.description) form.append('description', opts.description);
    return this.post<unknown>('/task-attachments', form).pipe(map((r) => this.unwrap<string>(r)));
  }

  /** Stream the raw file. */
  download(id: string): Observable<Blob> {
    return this.http.get(`${this.base}/task-attachments/${id}/download`, { responseType: 'blob' });
  }

  remove(id: string): Observable<unknown> {
    return this.delete(`/task-attachments/${id}`);
  }

  private normalize(source: unknown): TaskAttachment {
    return {
      id: this.field<string>(source, 'id') ?? '',
      taskId: this.field<string>(source, 'taskId') ?? '',
      ruleId: this.field<string | null>(source, 'ruleId') ?? null,
      fileName: this.field<string>(source, 'fileName') ?? '',
      contentType: this.field<string>(source, 'contentType') ?? '',
      fileSizeBytes: this.field<number>(source, 'fileSizeBytes') ?? 0,
      uploadedById: this.field<string>(source, 'uploadedById') ?? '',
      uploadedOnUtc: this.field<string>(source, 'uploadedOnUtc') ?? '',
    };
  }
}
