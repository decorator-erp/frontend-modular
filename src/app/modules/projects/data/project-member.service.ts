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
 * Project members. Only the read endpoint is real:
 * GET /api/projects/{id}/members (ProjectMemberEndpoints.cs).
 *
 * BACKEND GAP: there is NO /api/project-members write API — the backend exposes
 * no POST/PUT/DELETE for project members (member management currently flows
 * through stage-teams). The mutations below would 404; they have no callers and
 * are kept only as a typed placeholder. Wire a UI button to them ONLY after a
 * backend gap ticket adds the routes (CLAUDE_CODE_PROMPT.md / backend-migration).
 */
@Injectable({ providedIn: 'root' })
export class ProjectMemberService extends ApiService {
  private readonly projects = inject(ProjectService);

  getByProject(projectId: string): Observable<ProjectMember[]> {
    return this.get<unknown>(`/projects/${projectId}/members`).pipe(
      map((r) => this.unwrapArray(r).map((m) => this.projects.normalizeMember(m, projectId))),
    );
  }

  // TODO(backend-gap): no POST /api/project-members route exists yet.
  add(req: AddProjectMemberRequest): Observable<string> {
    const body = { ...req, access: this.projects.accessInt(req.access) };
    return this.post<unknown>('/project-members', body).pipe(map((r) => this.unwrap<string>(r)));
  }

  // TODO(backend-gap): no PUT /api/project-members/{id}/access route exists yet.
  changeAccess(id: string, req: ChangeProjectMemberAccessRequest): Observable<unknown> {
    return this.put(`/project-members/${id}/access`, {
      access: this.projects.accessInt(req.access),
    });
  }

  // TODO(backend-gap): no DELETE /api/project-members/{id} route exists yet.
  remove(id: string): Observable<unknown> {
    return this.delete(`/project-members/${id}`);
  }
}
