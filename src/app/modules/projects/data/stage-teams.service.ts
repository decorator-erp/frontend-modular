import { Injectable } from '@angular/core';
import { Observable } from 'rxjs';
import { map } from 'rxjs/operators';
import { ApiService } from '@platform/http/api.service';

/** StageTeamMemberRole enum per api-docs/08 — role within a stage team. */
export type StageTeamMemberRole = 'Member' | 'Lead' | 'Reviewer';

/** Mirrors StageTeamMemberResponse (api-docs/08). */
export interface StageTeamMember {
  id: string;
  employeeId: string;
  employeeName: string;
  isHead: boolean;
  role: string | null;
}

/** Mirrors StageTeamResponse (api-docs/08). */
export interface StageTeam {
  id: string;
  departmentId: string;
  departmentName: string;
  projectStageId: string | null;
  stageId: string | null;
  headId: string;
  headName: string;
  memberCount: number;
  members: StageTeamMember[];
}

/**
 * Stage teams — `/api/stage-teams` per api-docs/08-stage-templates-teams-gates.md.
 * Mutations require Projects.ManageStageTeams; reads require Projects.Read.
 *
 * Canonical home is `core/http` (moved from `shared/api`) — it is a CRUD service
 * over a real backend resource, like the other core/http services.
 */
@Injectable({ providedIn: 'root' })
export class StageTeamsService extends ApiService {
  /** POST / — CreateProjectStageTeamRequest { projectStageId, departmentId }. */
  create(projectStageId: string, departmentId: string): Observable<string> {
    return this.post<unknown>('/stage-teams', { projectStageId, departmentId }).pipe(
      map((r) => this.unwrap<string>(r)),
    );
  }

  /**
   * POST / — standalone team variant. The backend XOR-validates the body: pass a
   * `headId` (no department) to create a department-less team owned by one person.
   * Used to assign a stage owner when the stage has no team yet.
   */
  createStandalone(projectStageId: string, headId: string): Observable<string> {
    return this.post<unknown>('/stage-teams', { projectStageId, headId }).pipe(
      map((r) => this.unwrap<string>(r)),
    );
  }

  /** POST /template — CreateTemplateStageTeamRequest { stageId, departmentId }. */
  createForTemplate(stageId: string, departmentId: string): Observable<string> {
    return this.post<unknown>('/stage-teams/template', { stageId, departmentId }).pipe(
      map((r) => this.unwrap<string>(r)),
    );
  }

  getById(id: string): Observable<StageTeam> {
    return this.get<unknown>(`/stage-teams/${id}`).pipe(map((r) => this.normalize(this.unwrap(r))));
  }

  getByProjectStage(projectStageId: string): Observable<StageTeam[]> {
    return this.get<unknown>(`/stage-teams/by-project-stage/${projectStageId}`).pipe(
      map((r) => this.unwrapArray(r).map((t) => this.normalize(t))),
    );
  }

  getByProject(projectId: string): Observable<StageTeam[]> {
    return this.get<unknown>(`/stage-teams/by-project/${projectId}`).pipe(
      map((r) => this.unwrapArray(r).map((t) => this.normalize(t))),
    );
  }

  /**
   * POST /members — AddStageTeamMemberRequest { stageTeamId, employeeId, role? }.
   * `role` is optional: the directory "Add member" affordance omits it (backend
   * defaults), while the DMS Forms "Add team member" dialog sends the chosen role.
   */
  addMember(
    stageTeamId: string,
    employeeId: string,
    role?: StageTeamMemberRole,
  ): Observable<unknown> {
    return this.post(
      '/stage-teams/members',
      role ? { stageTeamId, employeeId, role } : { stageTeamId, employeeId },
    );
  }

  /** PUT /members/{memberId}/role — ChangeMemberRoleRequest { role }. */
  changeMemberRole(memberId: string, role: StageTeamMemberRole): Observable<unknown> {
    return this.put(`/stage-teams/members/${memberId}/role`, { role });
  }

  /** DELETE /members/{memberId}. */
  removeMember(memberId: string): Observable<unknown> {
    return this.delete(`/stage-teams/members/${memberId}`);
  }

  /** PUT /{id}/head — ChangeStageTeamHeadRequest { headId }. Auto-promotes; no prior membership required. */
  changeHead(teamId: string, headId: string): Observable<unknown> {
    return this.put(`/stage-teams/${teamId}/head`, { headId });
  }

  private normalize(source: unknown): StageTeam {
    const rawMembers = this.field<unknown[]>(source, 'members') ?? [];
    return {
      id: this.field<string>(source, 'id') ?? '',
      departmentId: this.field<string>(source, 'departmentId') ?? '',
      departmentName: this.field<string>(source, 'departmentName') ?? '',
      projectStageId: this.field<string | null>(source, 'projectStageId') ?? null,
      stageId: this.field<string | null>(source, 'stageId') ?? null,
      headId: this.field<string>(source, 'headId') ?? '',
      headName: this.field<string>(source, 'headName') ?? '',
      memberCount: this.field<number>(source, 'memberCount') ?? rawMembers.length,
      members: rawMembers.map((m) => ({
        id: this.field<string>(m, 'id') ?? '',
        employeeId: this.field<string>(m, 'employeeId') ?? '',
        employeeName: this.field<string>(m, 'employeeName') ?? '',
        isHead: this.field<boolean>(m, 'isHead') ?? false,
        role: this.field<string | null>(m, 'role') ?? null,
      })),
    };
  }
}
