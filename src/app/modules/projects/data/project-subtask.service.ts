import { Injectable, inject } from '@angular/core';
import { Observable } from 'rxjs';
import { map } from 'rxjs/operators';
import {
  CreateProjectSubTaskRequest,
  ProjectSubTask,
  UpdateProjectSubTaskRequest,
} from '../model/project.model';
import { ApiService } from '@platform/http/api.service';
import { handled } from '@platform/http/handled-errors';
import { ProjectService } from './project.service';

/**
 * Checklist sub-tasks under a task, nested under the project (crmp A-2; gap table P-30..35, E5):
 * `/api/projects/{projectId}/tasks/{taskId}/sub-tasks` (dms `TaskEndpoints.cs:131-177`). Every write
 * needs the Editor level. Complete is the one route without the task id:
 * `POST /api/projects/{projectId}/tasks/sub-tasks/{subTaskId}/complete`.
 */
@Injectable({ providedIn: 'root' })
export class ProjectSubTaskService extends ApiService {
  private readonly projects = inject(ProjectService);

  getByTask(projectId: string, taskId: string): Observable<ProjectSubTask[]> {
    return this.get<unknown>(`/projects/${projectId}/tasks/${taskId}/sub-tasks`).pipe(
      map((r) =>
        this.unwrapArray(r)
          .map((s) => this.projects.normalizeSubTask(s, taskId))
          .sort((a, b) => a.order - b.order),
      ),
    );
  }

  /** `POST …/sub-tasks { title, description?, order?, isRequired? }` → 200 `{ subTaskId }`. */
  create(projectId: string, taskId: string, req: CreateProjectSubTaskRequest): Observable<string> {
    return this.post<unknown>(`/projects/${projectId}/tasks/${taskId}/sub-tasks`, req, {
      context: handled(403, 409),
    }).pipe(map((r) => this.unwrapId(r, 'subTaskId')));
  }

  update(
    projectId: string,
    taskId: string,
    subTaskId: string,
    req: UpdateProjectSubTaskRequest,
  ): Observable<unknown> {
    return this.put(`/projects/${projectId}/tasks/${taskId}/sub-tasks/${subTaskId}`, req, {
      context: handled(403, 409),
    });
  }

  remove(projectId: string, taskId: string, subTaskId: string): Observable<unknown> {
    return this.delete(`/projects/${projectId}/tasks/${taskId}/sub-tasks/${subTaskId}`, undefined, {
      context: handled(403, 409),
    });
  }

  /** Was `PUT /project-subtasks/{id}/done` (P-34). */
  markDone(projectId: string, subTaskId: string): Observable<unknown> {
    return this.post(
      `/projects/${projectId}/tasks/sub-tasks/${subTaskId}/complete`,
      {},
      { context: handled(403, 409) },
    );
  }

  /** Was a PUT (P-35); now a POST. */
  reopen(projectId: string, taskId: string, subTaskId: string): Observable<unknown> {
    return this.post(
      `/projects/${projectId}/tasks/${taskId}/sub-tasks/${subTaskId}/reopen`,
      {},
      { context: handled(403, 409) },
    );
  }
}
