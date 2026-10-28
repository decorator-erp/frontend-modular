import { Injectable, inject } from '@angular/core';
import { Observable } from 'rxjs';
import { ApiService } from '@platform/http/api.service';
import { ProjectService } from './project.service';
import { ApprovalType } from '../model/project.model';

/**
 * Approval lifecycle for project stages — `/api/project-stages` per
 * api-docs/07-project-stages-tasks.md. Complements ProjectStageService with the
 * approve / reject transitions. Permission: Projects.ManageStages.
 */
@Injectable({ providedIn: 'root' })
export class StageLifecycleService extends ApiService {
  private readonly projects = inject(ProjectService);

  /** PUT /api/project-stages/{id}/approve — ApproveProjectStageRequest { approvalType, note? }. */
  approve(stageId: string, approvalType: ApprovalType, note?: string | null): Observable<unknown> {
    return this.put(`/project-stages/${stageId}/approve`, {
      approvalType: this.projects.approvalInt(approvalType),
      note: note ?? null,
    });
  }

  /** PUT /api/project-stages/{id}/reject — RejectProjectStageRequest { note (required), approvalType? }. */
  reject(stageId: string, note: string, approvalType?: ApprovalType | null): Observable<unknown> {
    return this.put(`/project-stages/${stageId}/reject`, {
      note,
      approvalType: approvalType ? this.projects.approvalInt(approvalType) : null,
    });
  }
}
