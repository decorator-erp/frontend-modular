import { Injectable } from '@angular/core';
import { Observable } from 'rxjs';
import { map } from 'rxjs/operators';
import { ApiService } from '@platform/http/api.service';
import {
  StageTemplateRef,
  TemplateStageInput,
  TemplateStageTask,
  TemplateStageTaskInput,
  TemplateSubTask,
  TemplateSubTaskInput,
} from '../model/stage-template.model';

/**
 * Sync F1: the stage template STRUCTURE — one template read plus the stage, stage-task, sub-task and
 * stage-department routes (dms TemplateEndpoints.cs:29, 66-192; reads `stages.read`, writes
 * `stages.manage`). Kept apart from `StageTemplatesService`, which the library barrel exports eagerly,
 * so only the lazy template editor pulls this in.
 */
@Injectable({ providedIn: 'root' })
export class StageTemplateStructureService extends ApiService {
  /** `GET /api/stage-templates/{id}` → `StageTemplateResponse` (`type` as its int: 1 System, 2 Custom). */
  getById(id: string): Observable<StageTemplateRef> {
    return this.get<unknown>(`/stage-templates/${id}`).pipe(
      map((r) => {
        const t = this.unwrap(r);
        const type = this.field<unknown>(t, 'type', 'stageTemplateType', 'templateType');
        return {
          id: this.field<string>(t, 'id') ?? '',
          name: this.field<string>(t, 'name') ?? '',
          description: this.field<string | null>(t, 'description') ?? null,
          isDefault: this.field<boolean>(t, 'isDefault') ?? false,
          isActive: this.field<boolean>(t, 'isActive') ?? true,
          type:
            type === 1 || type === '1' || type === 'System'
              ? 'System'
              : type === 2 || type === '2' || type === 'Custom'
                ? 'Custom'
                : null,
        };
      }),
    );
  }

  // The stage weight is `weightPercent`; the stage-task weight is `weight` (not a percent).

  /** `POST /stage-templates/{id}/stages` → `{ stageId }`. */
  createStage(templateId: string, req: TemplateStageInput): Observable<string> {
    return this.post<unknown>(`/stage-templates/${templateId}/stages`, this.stageBody(req)).pipe(
      map((r) => this.unwrapId(r, 'stageId')),
    );
  }

  /** `PUT /stages/{id}` → 204. */
  updateStage(stageId: string, req: TemplateStageInput): Observable<unknown> {
    return this.put(`/stages/${stageId}`, this.stageBody(req));
  }

  /** `DELETE /stages/{id}` → 204. */
  removeStage(stageId: string): Observable<unknown> {
    return this.delete(`/stages/${stageId}`);
  }

  /** `GET /stages/{id}/tasks` → `StageTaskResponse[]`. */
  stageTasks(stageId: string): Observable<TemplateStageTask[]> {
    return this.get<unknown>(`/stages/${stageId}/tasks`).pipe(
      map((r) =>
        this.unwrapArray(r).map((t) => ({
          id: this.field<string>(t, 'id') ?? '',
          stageId: this.field<string>(t, 'stageId') ?? stageId,
          name: this.field<string>(t, 'name') ?? '',
          description: this.field<string | null>(t, 'description') ?? null,
          order: Number(this.field(t, 'order') ?? 0),
          weight: Number(this.field(t, 'weight') ?? 0),
          departmentId: this.field<string | null>(t, 'departmentId') ?? null,
        })),
      ),
    );
  }

  /** `POST /stages/{id}/tasks` → `{ stageTaskId }`. */
  createStageTask(stageId: string, req: TemplateStageTaskInput): Observable<string> {
    return this.post<unknown>(`/stages/${stageId}/tasks`, this.taskBody(req)).pipe(
      map((r) => this.unwrapId(r, 'stageTaskId')),
    );
  }

  /** `PUT /stage-tasks/{id}` → 204. */
  updateStageTask(stageTaskId: string, req: TemplateStageTaskInput): Observable<unknown> {
    return this.put(`/stage-tasks/${stageTaskId}`, this.taskBody(req));
  }

  /** `DELETE /stage-tasks/{id}` → 204. */
  removeStageTask(stageTaskId: string): Observable<unknown> {
    return this.delete(`/stage-tasks/${stageTaskId}`);
  }

  /** `GET /stage-tasks/{id}/sub-tasks` → `StageSubTaskResponse[]`. */
  subTasks(stageTaskId: string): Observable<TemplateSubTask[]> {
    return this.get<unknown>(`/stage-tasks/${stageTaskId}/sub-tasks`).pipe(
      map((r) =>
        this.unwrapArray(r).map((x) => ({
          id: this.field<string>(x, 'id') ?? '',
          stageTaskId: this.field<string>(x, 'stageTaskId') ?? stageTaskId,
          title: this.field<string>(x, 'title') ?? '',
          description: this.field<string | null>(x, 'description') ?? null,
          order: Number(this.field(x, 'order') ?? 0),
          isRequired: this.field<boolean>(x, 'isRequired') ?? true,
        })),
      ),
    );
  }

  /** `POST /stage-tasks/{id}/sub-tasks` → `{ stageSubTaskId }`. */
  createSubTask(stageTaskId: string, req: TemplateSubTaskInput): Observable<string> {
    return this.post<unknown>(`/stage-tasks/${stageTaskId}/sub-tasks`, this.subTaskBody(req)).pipe(
      map((r) => this.unwrapId(r, 'stageSubTaskId')),
    );
  }

  /** `PUT /stage-sub-tasks/{id}` → 204. */
  updateSubTask(subTaskId: string, req: TemplateSubTaskInput): Observable<unknown> {
    return this.put(`/stage-sub-tasks/${subTaskId}`, this.subTaskBody(req));
  }

  /** `DELETE /stage-sub-tasks/{id}` → 204. */
  removeSubTask(subTaskId: string): Observable<unknown> {
    return this.delete(`/stage-sub-tasks/${subTaskId}`);
  }

  /** `GET /stages/{id}/departments` → `StageDepartmentResponse[]`; emits the department ids. */
  stageDepartments(stageId: string): Observable<string[]> {
    return this.get<unknown>(`/stages/${stageId}/departments`).pipe(
      map((r) =>
        this.unwrapArray(r)
          .map((d) => this.field<string>(d, 'departmentId') ?? '')
          .filter((id) => !!id),
      ),
    );
  }

  /**
   * Template stage → department link (gap table P-80): `POST /stages/{id}/departments/{deptId}`
   * (TemplateEndpoints.cs:117), no body. Moved here from the projects `StageTeamsService`, where it
   * had no caller (sync F1).
   */
  addStageDepartment(stageId: string, departmentId: string): Observable<unknown> {
    return this.post(`/stages/${stageId}/departments/${departmentId}`, null);
  }

  /** `DELETE /stages/{id}/departments/{deptId}` → 204. */
  removeStageDepartment(stageId: string, departmentId: string): Observable<unknown> {
    return this.delete(`/stages/${stageId}/departments/${departmentId}`);
  }

  private stageBody(req: TemplateStageInput): TemplateStageInput {
    return {
      name: req.name,
      order: req.order,
      weightPercent: req.weightPercent,
      description: req.description,
      defaultFee: req.defaultFee,
    };
  }

  private taskBody(req: TemplateStageTaskInput): TemplateStageTaskInput {
    return {
      name: req.name,
      order: req.order,
      weight: req.weight,
      description: req.description,
      departmentId: req.departmentId,
    };
  }

  private subTaskBody(req: TemplateSubTaskInput): TemplateSubTaskInput {
    return {
      title: req.title,
      order: req.order,
      isRequired: req.isRequired,
      description: req.description,
    };
  }
}
