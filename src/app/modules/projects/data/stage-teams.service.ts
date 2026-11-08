import { Injectable } from '@angular/core';
import { Observable, forkJoin, of } from 'rxjs';
import { catchError, map, switchMap } from 'rxjs/operators';
import { ApiService } from '@platform/http/api.service';
import { handled } from '@platform/http/handled-errors';

/**
 * The role picked in the team dialog. The backend enum is `StageTeamMemberRole` (dms
 * `Projects.Contracts/Enums.cs:47`): 1 Responsible, 2 Contributor, 3 Reviewer, 4 Observer, sent as an
 * int (crmp A-2). The dialog's labels map onto it: Lead → Responsible, Member and Contributor →
 * Contributor (DEVIATION-6).
 */
export type StageTeamMemberRole = 'Member' | 'Lead' | 'Reviewer' | 'Contributor' | 'Observer';

const ROLE_INT: Record<StageTeamMemberRole, number> = {
  Lead: 1,
  Member: 2,
  Contributor: 2,
  Reviewer: 3,
  Observer: 4,
};
const ROLE_NAME: Record<number, StageTeamMemberRole> = {
  1: 'Lead',
  2: 'Contributor',
  3: 'Reviewer',
  4: 'Observer',
};

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
  /** The stage name from the list row (`ProjectTeamListItemResponse.stageName`). */
  stageName?: string | null;
  headId: string;
  headName: string;
  memberCount: number;
  members: StageTeamMember[];
}

/**
 * Stage teams, nested under the project (crmp A-2; gap table P-78..87, E7): `/api/projects/{projectId}/teams`
 * (dms `TeamEndpoints.cs:23-83`). The list row (`ProjectTeamListItemResponse`) carries the head name and
 * the member count but not the members, so the list reads each team's members as well. Writes need
 * `stage_teams.manage` and the Manager level.
 */
@Injectable({ providedIn: 'root' })
export class StageTeamsService extends ApiService {
  /** `POST /projects/{pid}/teams { projectStageId, departmentId }` → `{ stageTeamId }` (TeamEndpoints.cs:32). */
  create(projectId: string, projectStageId: string, departmentId: string): Observable<string> {
    return this.post<unknown>(
      `/projects/${projectId}/teams`,
      {
        projectStageId,
        departmentId,
      },
      { context: handled(403, 409) },
    ).pipe(map((r) => this.unwrapId(r, 'stageTeamId')));
  }

  /**
   * The department-less team owned by one person: `{ projectStageId, headId }` (the backend wants one of
   * department or head, `projects.teams.HeadOrDepartmentRequired`).
   */
  createStandalone(projectId: string, projectStageId: string, headId: string): Observable<string> {
    return this.post<unknown>(
      `/projects/${projectId}/teams`,
      { projectStageId, headId },
      { context: handled(403, 409) },
    ).pipe(map((r) => this.unwrapId(r, 'stageTeamId')));
  }

  /** Template stage → department link (gap table P-80): `POST /stages/{stageId}/departments/{departmentId}` (TemplateEndpoints.cs:117). */
  createForTemplate(stageId: string, departmentId: string): Observable<unknown> {
    return this.post(`/stages/${stageId}/departments/${departmentId}`, {});
  }

  /** `GET /projects/{pid}/teams/{teamId}` plus its members (TeamEndpoints.cs:49,57). */
  getById(projectId: string, teamId: string): Observable<StageTeam> {
    return forkJoin({
      team: this.get<unknown>(`/projects/${projectId}/teams/${teamId}`),
      members: this.membersOf(projectId, teamId),
    }).pipe(map(({ team, members }) => this.normalize(this.unwrap(team), members)));
  }

  /** The teams of one stage: `GET /projects/{pid}/teams?stageId=` (TeamEndpoints.cs:23). */
  getByProjectStage(projectId: string, projectStageId: string): Observable<StageTeam[]> {
    return this.getByProject(projectId, projectStageId);
  }

  /** `GET /projects/{pid}/teams[?stageId=]`, each with `GET …/teams/{id}/members`. */
  getByProject(projectId: string, stageId?: string): Observable<StageTeam[]> {
    return this.get<unknown>(
      `/projects/${projectId}/teams`,
      stageId ? { stageId } : undefined,
    ).pipe(
      map((r) => this.unwrapArray(r)),
      switchMap((rows) =>
        rows.length
          ? forkJoin(
              rows.map((t) =>
                this.membersOf(projectId, this.field<string>(t, 'id') ?? '').pipe(
                  map((members) => this.normalize(t, members)),
                ),
              ),
            )
          : of([] as StageTeam[]),
      ),
    );
  }

  /** `POST /projects/{pid}/teams/{teamId}/members { employeeId, role }` (TeamEndpoints.cs:65). */
  addMember(
    projectId: string,
    stageTeamId: string,
    employeeId: string,
    role: StageTeamMemberRole = 'Contributor',
  ): Observable<string> {
    return this.post<unknown>(
      `/projects/${projectId}/teams/${stageTeamId}/members`,
      {
        employeeId,
        role: ROLE_INT[role],
      },
      { context: handled(403, 409) },
    ).pipe(map((r) => this.unwrapId(r, 'stageTeamMemberId')));
  }

  /** `PUT /projects/{pid}/teams/members/{memberId}/role { role }` (TeamEndpoints.cs:74). */
  changeMemberRole(
    projectId: string,
    memberId: string,
    role: StageTeamMemberRole,
  ): Observable<unknown> {
    return this.put(
      `/projects/${projectId}/teams/members/${memberId}/role`,
      { role: ROLE_INT[role] },
      { context: handled(403, 409) },
    );
  }

  /** `DELETE /projects/{pid}/teams/members/{memberId}` (TeamEndpoints.cs:41). */
  removeMember(projectId: string, memberId: string): Observable<unknown> {
    return this.delete(`/projects/${projectId}/teams/members/${memberId}`, undefined, {
      context: handled(403, 409),
    });
  }

  /** `PUT /projects/{pid}/teams/{teamId}/head { headId }` (TeamEndpoints.cs:83). */
  changeHead(projectId: string, teamId: string, headId: string): Observable<unknown> {
    return this.put(
      `/projects/${projectId}/teams/${teamId}/head`,
      { headId },
      { context: handled(403, 409) },
    );
  }

  /**
   * crmp review R1-F2: the list needs `stages.read`, but the members route needs `stage_teams.manage`
   * (dms `TeamEndpoints.cs:23,57`). A caller without it still gets the teams — head, head name and
   * member count come from the list row — with an empty member list instead of a failed page.
   * Review B4 (CP-5): the 403 is `handled`, so a Viewer gets no generic toast per team.
   */
  private membersOf(projectId: string, teamId: string): Observable<unknown[]> {
    return this.get<unknown>(`/projects/${projectId}/teams/${teamId}/members`, undefined, {
      context: handled(403),
    }).pipe(
      map((r) => this.unwrapArray(r)),
      catchError(() => of([] as unknown[])),
    );
  }

  private normalize(source: unknown, rawMembers: unknown[]): StageTeam {
    const headId = this.field<string>(source, 'headId') ?? '';
    return {
      id: this.field<string>(source, 'id') ?? '',
      departmentId: this.field<string>(source, 'departmentId') ?? '',
      departmentName: this.field<string>(source, 'departmentName') ?? '',
      projectStageId: this.field<string | null>(source, 'projectStageId') ?? null,
      stageId: this.field<string | null>(source, 'stageId') ?? null,
      stageName: this.field<string | null>(source, 'stageName') ?? null,
      headId,
      headName: this.field<string>(source, 'headName') ?? '',
      memberCount: this.field<number>(source, 'memberCount') ?? rawMembers.length,
      members: rawMembers.map((m) => {
        const role = this.field<unknown>(m, 'role');
        const employeeId = this.field<string>(m, 'employeeId') ?? '';
        return {
          id: this.field<string>(m, 'id') ?? '',
          employeeId,
          employeeName: this.field<string>(m, 'employeeName') ?? '',
          isHead: this.field<boolean>(m, 'isHead') ?? employeeId === headId,
          role:
            typeof role === 'number'
              ? (ROLE_NAME[role] ?? null)
              : ((role as string | null) ?? null),
        };
      }),
    };
  }
}
