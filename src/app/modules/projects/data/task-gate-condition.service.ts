import { Injectable, inject } from '@angular/core';
import { Observable } from 'rxjs';
import { map } from 'rxjs/operators';
import {
  CreateTaskGateConditionRequest,
  GateCondition,
  SatisfyGateConditionRequest,
  UpdateGateConditionRequest,
} from '../model/project.model';
import { ApiService } from '@platform/http/api.service';
import { ProjectService } from './project.service';

/** Dynamic gate-condition engine for tasks — `/api/task-gate-conditions`. */
@Injectable({ providedIn: 'root' })
export class TaskGateConditionService extends ApiService {
  private readonly projects = inject(ProjectService);

  getByTask(taskId: string): Observable<GateCondition[]> {
    return this.get<unknown>(`/task-gate-conditions/by-task/${taskId}`).pipe(
      map((r) => this.unwrapArray(r).map((c) => this.projects.normalizeGate(c))),
    );
  }

  create(req: CreateTaskGateConditionRequest): Observable<string> {
    const body = {
      ...req,
      conditionType: this.projects.conditionInt(req.conditionType),
      trigger: this.projects.triggerInt(req.trigger),
      approvalType: req.approvalType ? this.projects.approvalInt(req.approvalType) : null,
    };
    return this.post<unknown>('/task-gate-conditions', body).pipe(
      map((r) => this.unwrap<string>(r)),
    );
  }

  update(id: string, req: UpdateGateConditionRequest): Observable<unknown> {
    return this.put(`/task-gate-conditions/${id}`, {
      ...req,
      trigger: this.projects.triggerInt(req.trigger),
    });
  }

  remove(id: string): Observable<unknown> {
    return this.delete(`/task-gate-conditions/${id}`);
  }

  satisfy(id: string, req: SatisfyGateConditionRequest = {}): Observable<unknown> {
    return this.put(`/task-gate-conditions/${id}/satisfy`, req);
  }
}
