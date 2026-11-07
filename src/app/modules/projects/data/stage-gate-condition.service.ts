import { Injectable, inject } from '@angular/core';
import { Observable, throwError } from 'rxjs';
import { catchError, map, switchMap } from 'rxjs/operators';
import {
  CreateGateConditionRequest,
  GateCondition,
  SatisfyGateConditionRequest,
} from '../model/project.model';
import { ApiService } from '@platform/http/api.service';
import { GateRemovedError, ProjectService } from './project.service';

/**
 * Stage gate conditions, nested under the project (crmp A-2; gap table P-71..75):
 * list and create on `/api/projects/{projectId}/stages/{stageId}/gates`, delete and satisfy on
 * `/api/projects/{projectId}/gates/{gateConditionId}` (dms `GateEndpoints.cs:24,32,60,68`). There is no
 * update route (gap table REMOVED P-73/100): an edit is a delete followed by a re-create.
 */
@Injectable({ providedIn: 'root' })
export class StageGateConditionService extends ApiService {
  private readonly projects = inject(ProjectService);

  getByStage(projectId: string, stageId: string): Observable<GateCondition[]> {
    return this.get<unknown>(`/projects/${projectId}/stages/${stageId}/gates`).pipe(
      map((r) => this.unwrapArray(r).map((c) => this.projects.normalizeGate(c))),
    );
  }

  /** → 200 `{ gateConditionId }`. */
  create(projectId: string, stageId: string, req: CreateGateConditionRequest): Observable<string> {
    return this.post<unknown>(
      `/projects/${projectId}/stages/${stageId}/gates`,
      this.projects.gateBody(req),
    ).pipe(map((r) => this.unwrapId(r, 'gateConditionId')));
  }

  /** The edit the backend allows: delete the gate, then create its replacement. */
  recreate(
    projectId: string,
    stageId: string,
    gateConditionId: string,
    req: CreateGateConditionRequest,
  ): Observable<string> {
    return this.remove(projectId, gateConditionId).pipe(
      switchMap(() =>
        this.create(projectId, stageId, req).pipe(
          catchError((cause: unknown) => throwError(() => new GateRemovedError(cause))),
        ),
      ),
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
