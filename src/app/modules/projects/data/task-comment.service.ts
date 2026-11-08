import { Injectable } from '@angular/core';
import { Observable } from 'rxjs';
import { map } from 'rxjs/operators';
import { TaskComment } from '../model/project.model';
import { ApiService } from '@platform/http/api.service';
import { handled } from '@platform/http/handled-errors';

/** Optional page of a task's comments (contract §1.6: opt-in; the body stays a plain array). */
export interface TaskCommentPage {
  pageNumber: number;
  pageSize: number;
}

/**
 * Task comments, nested under the project (crmp A-2; gap table P-94/95/96/97, E6):
 * `/api/projects/{projectId}/tasks/{taskId}/comments` (dms `TaskEndpoints.cs:185-215`). Add needs
 * Editor; edit/delete need Editor plus the author or the `stage_tasks.manage` claim
 * (`projects.comments.NotAuthor`).
 */
@Injectable({ providedIn: 'root' })
export class TaskCommentService extends ApiService {
  getByTask(projectId: string, taskId: string, page?: TaskCommentPage): Observable<TaskComment[]> {
    return this.get<unknown>(
      `/projects/${projectId}/tasks/${taskId}/comments`,
      page ? { ...page } : undefined,
    ).pipe(map((r) => this.unwrapArray(r).map((c) => this.normalize(c, taskId))));
  }

  /** `POST …/comments { content }` → 200 `{ commentId }`. */
  create(projectId: string, taskId: string, content: string): Observable<string> {
    return this.post<unknown>(
      `/projects/${projectId}/tasks/${taskId}/comments`,
      { content },
      { context: handled(403, 409) },
    ).pipe(map((r) => this.unwrapId(r, 'commentId')));
  }

  update(
    projectId: string,
    taskId: string,
    commentId: string,
    content: string,
  ): Observable<unknown> {
    return this.put(
      `/projects/${projectId}/tasks/${taskId}/comments/${commentId}`,
      { content },
      { context: handled(403, 409) },
    );
  }

  remove(projectId: string, taskId: string, commentId: string): Observable<unknown> {
    return this.delete(`/projects/${projectId}/tasks/${taskId}/comments/${commentId}`, undefined, {
      context: handled(403, 409),
    });
  }

  private normalize(source: unknown, taskId: string): TaskComment {
    return {
      id: this.field<string>(source, 'id') ?? '',
      taskId: this.field<string>(source, 'taskId') ?? taskId,
      employeeId: this.field<string>(source, 'employeeId') ?? '',
      content: this.field<string>(source, 'content') ?? '',
      createdAtUtc: this.field<string>(source, 'createdAtUtc') ?? '',
      updatedAtUtc: this.field<string | null>(source, 'updatedAtUtc') ?? null,
      employeeName: this.field<string | null>(source, 'employeeName') ?? null,
    };
  }
}
