import { Injectable, inject } from '@angular/core';
import { Observable } from 'rxjs';
import { ApiService } from '@platform/http/api.service';
import { ProjectService } from './project.service';
import { ApprovalType } from '../model/project.model';

/**
 * Approval lifecycle for project tasks — `/api/project-tasks` per
 * api-docs/07-project-stages-tasks.md. Complements ProjectTaskService with the
 * request-approval / approve / reject transitions. Permission: Projects.ManageTasks.
 */
@Injectable({ providedIn: 'root' })
export class TaskLifecycleService extends ApiService {
  private readonly projects = inject(ProjectService);

  /** PUT /api/project-tasks/{id}/request-approval — InProgress → PendingApproval. */
  requestApproval(taskId: string): Observable<unknown> {
    return this.put(`/project-tasks/${taskId}/request-approval`, {});
  }

  /** PUT /api/project-tasks/{id}/approve — ApproveProjectTaskRequest { approvalType, note? }. */
  approve(taskId: string, approvalType: ApprovalType, note?: string | null): Observable<unknown> {
    return this.put(`/project-tasks/${taskId}/approve`, {
      approvalType: this.projects.approvalInt(approvalType),
      note: note ?? null,
    });
  }

  /** PUT /api/project-tasks/{id}/reject — RejectProjectTaskRequest { note (required), approvalType? }. */
  reject(taskId: string, note: string, approvalType?: ApprovalType | null): Observable<unknown> {
    return this.put(`/project-tasks/${taskId}/reject`, {
      note,
      approvalType: approvalType ? this.projects.approvalInt(approvalType) : null,
    });
  }
}
