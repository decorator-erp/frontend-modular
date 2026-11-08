import { Injectable } from '@angular/core';
import { Observable } from 'rxjs';
import { map } from 'rxjs/operators';
import { ApiService } from '@platform/http/api.service';
import { handled } from '@platform/http/handled-errors';
import {
  FILE_TEMPLATE_CATEGORIES,
  FileTemplate,
  FileTemplateCategory,
  FileTemplateInput,
} from '../model/file-template.model';

/**
 * Sync F3: the file template library — `/api/file-templates` (dms FileTemplateEndpoints.cs;
 * `file_templates.read` / `file_templates.manage`), plus applying a template to a task
 * (`POST /project-tasks/{taskId}/apply-template/{templateId}`, DocumentUploadEndpoints.cs:83,
 * `documents.upload`). The list returns active and inactive templates; only an active one applies.
 */
@Injectable({ providedIn: 'root' })
export class FileTemplatesService extends ApiService {
  /** `GET /file-templates[?category=]`, by name. */
  list(category?: FileTemplateCategory | null): Observable<FileTemplate[]> {
    return this.get<unknown>('/file-templates', category ? { category } : undefined).pipe(
      map((r) => this.unwrapArray(r).map((t) => this.normalize(t))),
    );
  }

  /** `GET /file-templates/{id}`. */
  getById(id: string): Observable<FileTemplate> {
    return this.get<unknown>(`/file-templates/${id}`).pipe(
      map((r) => this.normalize(this.unwrap(r))),
    );
  }

  /**
   * `POST /file-templates` — multipart `file`, `name`, `category`, `description?` →
   * `{ fileTemplateId }`. A taken name is 409 `file_templates.NameAlreadyExists`; the dialog shows it.
   */
  create(file: File, input: FileTemplateInput): Observable<string> {
    const form = new FormData();
    form.append('file', file);
    form.append('name', input.name);
    form.append('category', input.category);
    if (input.description) form.append('description', input.description);
    return this.post<unknown>('/file-templates', form, { context: handled(409) }).pipe(
      map((r) => this.unwrapId(r, 'fileTemplateId')),
    );
  }

  /** `PUT /file-templates/{id} { name, category, description }` → 204. */
  update(id: string, input: FileTemplateInput): Observable<unknown> {
    return this.put(
      `/file-templates/${id}`,
      { name: input.name, category: input.category, description: input.description },
      { context: handled(409) },
    );
  }

  /** `DELETE /file-templates/{id}` → 204. */
  remove(id: string): Observable<unknown> {
    return this.delete(`/file-templates/${id}`);
  }

  /** `POST /file-templates/{id}/activate` → 204. */
  activate(id: string): Observable<unknown> {
    return this.post(`/file-templates/${id}/activate`, null);
  }

  /** `POST /file-templates/{id}/deactivate` → 204. */
  deactivate(id: string): Observable<unknown> {
    return this.post(`/file-templates/${id}/deactivate`, null);
  }

  /**
   * `POST /project-tasks/{taskId}/apply-template/{templateId}` → `{ documentId }`: copies the
   * template file into the task's default folder. An inactive or missing template is 404
   * `file_templates.NotFound`; the caller shows it.
   */
  applyToTask(taskId: string, templateId: string): Observable<string> {
    return this.post<unknown>(`/project-tasks/${taskId}/apply-template/${templateId}`, null, {
      context: handled(404),
    }).pipe(map((r) => this.unwrapId(r, 'documentId')));
  }

  private normalize(source: unknown): FileTemplate {
    const raw = this.field<string>(source, 'category') ?? '';
    const category =
      FILE_TEMPLATE_CATEGORIES.find((c) => c.toLowerCase() === String(raw).toLowerCase()) ??
      'Other';
    return {
      id: this.field<string>(source, 'id') ?? '',
      name: this.field<string>(source, 'name') ?? '',
      description: this.field<string | null>(source, 'description') ?? null,
      category,
      fileName: this.field<string>(source, 'fileName') ?? '',
      contentType: this.field<string>(source, 'contentType') ?? '',
      sizeBytes: Number(this.field(source, 'fileSizeBytes') ?? 0),
      isActive: this.field<boolean>(source, 'isActive') ?? true,
    };
  }
}
