import { TestBed } from '@angular/core/testing';
import { HttpTestingController, provideHttpClientTesting } from '@angular/common/http/testing';
import { provideHttpClient } from '@angular/common/http';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { environment } from '../../../../environments/environment';
import { StageTeamsService } from './stage-teams.service';

/** crmp A-2: stage teams moved under the project (dms `TeamEndpoints.cs:23-83`); role is an int. */
describe('StageTeamsService (crmp A-2)', () => {
  let service: StageTeamsService;
  let http: HttpTestingController;
  const api = environment.apiUrl;

  beforeEach(() => {
    TestBed.configureTestingModule({
      providers: [provideHttpClient(), provideHttpClientTesting()],
    });
    service = TestBed.inject(StageTeamsService);
    http = TestBed.inject(HttpTestingController);
  });

  afterEach(() => http.verify());

  it('lists GET /projects/{pid}/teams and reads each team’s members (TeamEndpoints.cs:23,57)', () => {
    let roles: (string | null)[] = [];
    let heads: boolean[] = [];
    service.getByProject('P1').subscribe((t) => {
      roles = t[0]?.members.map((m) => m.role) ?? [];
      heads = t[0]?.members.map((m) => m.isHead) ?? [];
    });
    const list = http.expectOne(`${api}/projects/P1/teams`);
    expect(list.request.params.keys()).toEqual([]);
    list.flush([
      {
        id: 'TM1',
        projectStageId: 'S1',
        stageName: 'Design',
        headId: 'E1',
        headName: 'Hany',
        memberCount: 2,
      },
    ]);
    http.expectOne(`${api}/projects/P1/teams/TM1/members`).flush([
      { id: 'M1', stageTeamId: 'TM1', employeeId: 'E1', role: 1 },
      { id: 'M2', stageTeamId: 'TM1', employeeId: 'E2', role: 3 },
    ]);
    expect(roles).toEqual(['Lead', 'Reviewer']);
    expect(heads).toEqual([true, false]);
  });

  it('filters one stage with ?stageId= (TeamEndpoints.cs:23)', () => {
    service.getByProjectStage('P1', 'S1').subscribe();
    const r = http.expectOne((x) => x.url === `${api}/projects/P1/teams`);
    expect(r.request.params.get('stageId')).toBe('S1');
    r.flush([]);
  });

  it('creates with { projectStageId, departmentId } and reads stageTeamId (TeamEndpoints.cs:32)', () => {
    let id = '';
    service.create('P1', 'S1', 'D1').subscribe((v) => (id = v));
    const r = http.expectOne(`${api}/projects/P1/teams`);
    expect(r.request.method).toBe('POST');
    expect(r.request.body).toEqual({ projectStageId: 'S1', departmentId: 'D1' });
    r.flush({ stageTeamId: 'TM9' });
    expect(id).toBe('TM9');
  });

  it('adds a member with an int role (TeamEndpoints.cs:65)', () => {
    service.addMember('P1', 'TM1', 'E3', 'Member').subscribe();
    const r = http.expectOne(`${api}/projects/P1/teams/TM1/members`);
    expect(r.request.body).toEqual({ employeeId: 'E3', role: 2 });
  });

  it('changes role, removes a member and changes the head on the nested routes (TeamEndpoints.cs:74,41,83)', () => {
    service.changeMemberRole('P1', 'M1', 'Lead').subscribe();
    const role = http.expectOne(`${api}/projects/P1/teams/members/M1/role`);
    expect(role.request.method).toBe('PUT');
    expect(role.request.body).toEqual({ role: 1 });
    service.removeMember('P1', 'M1').subscribe();
    expect(http.expectOne(`${api}/projects/P1/teams/members/M1`).request.method).toBe('DELETE');
    service.changeHead('P1', 'TM1', 'E2').subscribe();
    const head = http.expectOne(`${api}/projects/P1/teams/TM1/head`);
    expect(head.request.method).toBe('PUT');
    expect(head.request.body).toEqual({ headId: 'E2' });
  });

  it('links a template stage to a department on POST /stages/{id}/departments/{deptId} (TemplateEndpoints.cs:117)', () => {
    service.createForTemplate('ST1', 'D1').subscribe();
    expect(http.expectOne(`${api}/stages/ST1/departments/D1`).request.method).toBe('POST');
  });
});
