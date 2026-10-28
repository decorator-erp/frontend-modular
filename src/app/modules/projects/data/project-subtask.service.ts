import { Injectable, inject } from '@angular/core';
import { Observable } from 'rxjs';
import { map } from 'rxjs/operators';
import {
  CreateProjectSubTaskRequest,
  ProjectSubTask,
  UpdateProjectSubTaskRequest,
} from '../model/project.model';
import { ApiService } from '@platform/http/api.service';
import { ProjectService } from './project.service';

/** Checklist sub-tasks under a task — `/api/project-subtasks`. */
@Injectable({ providedIn: 'root' })
export class ProjectSubTaskService extends ApiService {
  private readonly projects = inject(ProjectService);

  getByTask(taskId: string): Observable<ProjectSubTask[]> {
    return this.get<unknown>(`/project-subtasks/by-task/${taskId}`).pipe(
      map((r) =>
        this.unwrapArray(r)
          .map((s) => this.projects.normalizeSubTask(s, taskId))
          .sort((a, b) => a.order - b.order),
      ),
    );
  }

  create(req: CreateProjectSubTaskRequest): Observable<string> {
    return this.post<unknown>('/project-subtasks', req).pipe(map((r) => this.unwrap<string>(r)));
  }

  update(id: string, req: UpdateProjectSubTaskRequest): Observable<unknown> {
    return this.put(`/project-subtasks/${id}`, req);
  }

  remove(id: string): Observable<unknown> {
    return this.delete(`/project-subtasks/${id}`);
  }

  markDone(id: string): Observable<unknown> {
    return this.put(`/project-subtasks/${id}/done`, {});
  }

  reopen(id: string): Observable<unknown> {
    return this.put(`/project-subtasks/${id}/reopen`, {});
  }
}
