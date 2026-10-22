import { Injectable } from '@angular/core';
import { Observable } from 'rxjs';
import { map } from 'rxjs/operators';
import { ApiService } from '@platform/http/api.service';
import {
  CreateStageTemplateRequest,
  StageTemplateRef,
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
          type: this.field<string | null>(t, 'type', 'stageTemplateType', 'templateType') ?? null,
        })),
      ),
    );
  }

  create(req: CreateStageTemplateRequest): Observable<string> {
    return this.post<unknown>('/stage-templates', req).pipe(map((r) => this.unwrap<string>(r)));
  }

  update(id: string, req: UpdateStageTemplateRequest): Observable<unknown> {
    return this.put(`/stage-templates/${id}`, req);
  }
}
