import { Injectable } from '@angular/core';
import { Observable } from 'rxjs';
import { map } from 'rxjs/operators';
import { ApiService } from '@platform/http/api.service';
import {
  CreateStageTemplateRequest,
  StageTemplateRef,
  StageTemplateType,
  TemplateStage,
  UpdateStageTemplateRequest,
} from '../model/stage-template.model';

/** Stage template catalogue (`/stage-templates`) — feeds the project-create form + library editor. */
@Injectable({ providedIn: 'root' })
export class StageTemplatesService extends ApiService {
  list(): Observable<StageTemplateRef[]> {
    return this.get<unknown>('/stage-templates').pipe(
      map((r) =>
        this.unwrapArray(r).map((t) => ({
          id: this.field<string>(t, 'id') ?? '',
          name: this.field<string>(t, 'name') ?? '',
          description: this.field<string | null>(t, 'description') ?? null,
          isDefault: this.field<boolean>(t, 'isDefault') ?? false,
          isActive: this.field<boolean>(t, 'isActive') ?? true,
          type: this.typeName(this.field<unknown>(t, 'type', 'stageTemplateType', 'templateType')),
        })),
      ),
    );
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
}
