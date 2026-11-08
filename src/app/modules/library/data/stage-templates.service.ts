import { handled } from '@platform/http/handled-errors';
import { Injectable } from '@angular/core';
import { Observable } from 'rxjs';
import { map } from 'rxjs/operators';
import { ApiService } from '@platform/http/api.service';
import {
  CreateStageTemplateRequest,
  StageTemplateRef,
  StageTemplateType,
  TemplateStage,
  TemplateStageInput,
  TemplateStageTask,
  TemplateStageTaskInput,
  TemplateSubTask,
  TemplateSubTaskInput,
  UpdateStageTemplateRequest,
} from '../model/stage-template.model';

/** Stage template catalogue (`/stage-templates`) — feeds the project-create form + library editor. */
@Injectable({ providedIn: 'root' })
export class StageTemplatesService extends ApiService {
  list(): Observable<StageTemplateRef[]> {
    return this.get<unknown>('/stage-templates').pipe(
      map((r) => this.unwrapArray(r).map((t) => this.toRef(t))),
    );
  }

  /** Sync F1: `GET /api/stage-templates/{id}` → `StageTemplateResponse` (TemplateEndpoints.cs:29). */
  getById(id: string): Observable<StageTemplateRef> {
    return this.get<unknown>(`/stage-templates/${id}`).pipe(map((r) => this.toRef(this.unwrap(r))));
  }

  private toRef(t: unknown): StageTemplateRef {
    return {
      id: this.field<string>(t, 'id') ?? '',
      name: this.field<string>(t, 'name') ?? '',
      description: this.field<string | null>(t, 'description') ?? null,
      isDefault: this.field<boolean>(t, 'isDefault') ?? false,
      isActive: this.field<boolean>(t, 'isActive') ?? true,
      type: this.typeName(this.field<unknown>(t, 'type', 'stageTemplateType', 'templateType')),
    };
  }

  /**
   * `POST /api/stage-templates` — `CreateStageTemplateCommand { name, type, isDefault, description }`
   * with `type` as the `StageTemplateType` int → `200 { stageTemplateId }`
   * (TemplateContracts.cs:10, TemplateEndpoints.cs:36-41). Emits the new template id.
   */
  create(req: CreateStageTemplateRequest): Observable<string> {
    const body = {
      name: req.name,
      type: req.type === 'System' ? 1 : 2,
      isDefault: req.isDefault ?? false,
      description: req.description ?? null,
    };
    return this.post<unknown>('/stage-templates', body).pipe(
      map((r) => this.unwrapId(r, 'stageTemplateId')),
    );
  }

  /**
   * `StageTemplateResponse.Type` serializes as its int (no string-enum converter): 1 → System,
   * 2 → Custom. A name still reads as itself; anything else is `null`.
   */
  private typeName(v: unknown): StageTemplateType | null {
    if (v === 1 || v === '1' || v === 'System') return 'System';
    if (v === 2 || v === '2' || v === 'Custom') return 'Custom';
    return null;
  }

  /**
   * crmp P-11: `DELETE /api/stage-templates/{id}` (dms TemplateEndpoints.cs:52, `stages.manage`). A
   * template a project was built from is 409 `stage_templates.InUse`; the caller shows it, so the
   * global toast skips the 409.
   */
  remove(id: string): Observable<unknown> {
    return this.delete(`/stage-templates/${id}`, undefined, { context: handled(409) });
  }

  update(id: string, req: UpdateStageTemplateRequest): Observable<unknown> {
    return this.put(`/stage-templates/${id}`, req);
  }

  /** `GET /api/stage-templates/{id}/stages` — the template's stages, with fee + task count (008b #10). */
  stages(templateId: string): Observable<TemplateStage[]> {
    return this.get<unknown>(`/stage-templates/${templateId}/stages`).pipe(
      map((r) =>
        this.unwrapArray(r).map((s) => {
          const fee = this.field<number | string | null>(s, 'defaultFee');
          return {
            id: this.field<string>(s, 'id') ?? '',
            stageTemplateId: this.field<string>(s, 'stageTemplateId') ?? templateId,
            name: this.field<string>(s, 'name') ?? '',
            description: this.field<string | null>(s, 'description') ?? null,
            order: Number(this.field(s, 'order') ?? 0),
            weightPercent: Number(this.field(s, 'weightPercent') ?? 0),
            defaultFee: fee === null || fee === undefined ? null : Number(fee),
            taskCount: Number(this.field(s, 'taskCount') ?? 0),
          };
        }),
      ),
    );
  }

  // ── Sync F1: template structure (dms TemplateEndpoints.cs:66-192, all `stages.manage`) ──
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
   * had no caller.
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
