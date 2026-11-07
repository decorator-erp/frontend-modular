import { Injectable, inject } from '@angular/core';
import { Observable } from 'rxjs';
import { map, switchMap } from 'rxjs/operators';
import {
  CreateGateConditionRequest,
  GateCondition,
  SatisfyGateConditionRequest,
} from '../model/project.model';
import { ApiService } from '@platform/http/api.service';
import { ProjectService } from './project.service';

/**
 * Task gate conditions, nested under the project (crmp A-2; gap table P-98..102):
 * list and create on `/api/projects/{projectId}/tasks/{taskId}/gates`, delete and satisfy on
 * `/api/projects/{projectId}/gates/{gateConditionId}` (dms `GateEndpoints.cs:42,50,60,68`). There is no
 * update route (gap table REMOVED P-73/100): an edit is a delete followed by a re-create.
 */
@Injectable({ providedIn: 'root' })
export class TaskGateConditionService extends ApiService {
  private readonly projects = inject(ProjectService);

  getByTask(projectId: string, taskId: string): Observable<GateCondition[]> {
    return this.get<unknown>(`/projects/${projectId}/tasks/${taskId}/gates`).pipe(
      map((r) => this.unwrapArray(r).map((c) => this.projects.normalizeGate(c))),
    );
  }

  /** → 200 `{ gateConditionId }`. */
  create(projectId: string, taskId: string, req: CreateGateConditionRequest): Observable<string> {
    return this.post<unknown>(
      `/projects/${projectId}/tasks/${taskId}/gates`,
      this.projects.gateBody(req),
    ).pipe(map((r) => this.unwrapId(r, 'gateConditionId')));
  }

  /** The edit the backend allows: delete the gate, then create its replacement. */
  recreate(
    projectId: string,
    taskId: string,
    gateConditionId: string,
    req: CreateGateConditionRequest,
  ): Observable<string> {
    return this.remove(projectId, gateConditionId).pipe(
      switchMap(() => this.create(projectId, taskId, req)),
    );
  }

  remove(projectId: string, gateConditionId: string): Observable<unknown> {
    return this.delete(`/projects/${projectId}/gates/${gateConditionId}`);
  }

  satisfy(
    projectId: string,
    gateConditionId: string,
    req: SatisfyGateConditionRequest = {},
  ): Observable<unknown> {
    return this.post(`/projects/${projectId}/gates/${gateConditionId}/satisfy`, req);
  }
}
