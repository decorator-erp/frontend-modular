import { Injectable, inject } from '@angular/core';
import { Observable } from 'rxjs';
import { map } from 'rxjs/operators';
import {
  AddProjectMemberRequest,
  ChangeProjectMemberAccessRequest,
  ProjectMember,
} from '../model/project.model';
import { ApiService } from '@platform/http/api.service';
import { ProjectService } from './project.service';

/**
 * Project members (crmp A-2; gap table E1 / P-13..16): `/api/projects/{projectId}/members`
 * (dms `ProjectMemberEndpoints.cs:23-50`). Writes need `project.manage_members` and the Manager level;
 * the access enum is 1 Viewer, 2 Editor ("Contributor" here), 3 Manager.
 */
@Injectable({ providedIn: 'root' })
export class ProjectMemberService extends ApiService {
  private readonly projects = inject(ProjectService);

  getByProject(projectId: string): Observable<ProjectMember[]> {
    return this.get<unknown>(`/projects/${projectId}/members`).pipe(
      map((r) => this.unwrapArray(r).map((m) => this.projects.normalizeMember(m, projectId))),
    );
  }

  /** `POST …/members { employeeId, access }` → 200 `{ memberId }` (ProjectMemberEndpoints.cs:32). */
  add(req: AddProjectMemberRequest): Observable<string> {
    return this.post<unknown>(`/projects/${req.projectId}/members`, {
      employeeId: req.employeeId,
      access: this.projects.accessInt(req.access),
    }).pipe(map((r) => this.unwrapId(r, 'memberId')));
  }

  /** `PUT …/members/{memberId}/access { access }` (ProjectMemberEndpoints.cs:41). */
  changeAccess(
    projectId: string,
    memberId: string,
    req: ChangeProjectMemberAccessRequest,
  ): Observable<unknown> {
    return this.put(`/projects/${projectId}/members/${memberId}/access`, {
      access: this.projects.accessInt(req.access),
    });
  }

  /** `DELETE …/members/{memberId}` (ProjectMemberEndpoints.cs:50). */
  remove(projectId: string, memberId: string): Observable<unknown> {
    return this.delete(`/projects/${projectId}/members/${memberId}`);
  }
}
