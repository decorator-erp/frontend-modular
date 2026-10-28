import { Injectable } from '@angular/core';
import { Observable } from 'rxjs';
import { map } from 'rxjs/operators';
import {
  CreateTaskCommentRequest,
  TaskComment,
  UpdateTaskCommentRequest,
} from '../model/project.model';
import { ApiService } from '@platform/http/api.service';

/** Task comments — `/api/task-comments`. Edit/delete = author or task assignee (else 403). */
@Injectable({ providedIn: 'root' })
export class TaskCommentService extends ApiService {
  getByTask(taskId: string): Observable<TaskComment[]> {
    return this.get<unknown>(`/task-comments/by-task/${taskId}`).pipe(
      map((r) => this.unwrapArray(r).map((c) => this.normalize(c, taskId))),
    );
  }

  create(req: CreateTaskCommentRequest): Observable<string> {
    return this.post<unknown>('/task-comments', req).pipe(map((r) => this.unwrap<string>(r)));
  }

  update(id: string, req: UpdateTaskCommentRequest): Observable<unknown> {
    return this.put(`/task-comments/${id}`, req);
  }

  remove(id: string): Observable<unknown> {
    return this.delete(`/task-comments/${id}`);
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
