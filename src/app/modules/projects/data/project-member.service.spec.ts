import { TestBed } from '@angular/core/testing';
import { HttpTestingController, provideHttpClientTesting } from '@angular/common/http/testing';
import { provideHttpClient } from '@angular/common/http';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { environment } from '../../../../environments/environment';
import { ProjectMemberService } from './project-member.service';

/** crmp A-2: member writes live under the project (dms `ProjectMemberEndpoints.cs:23-50`). */
describe('ProjectMemberService (crmp A-2)', () => {
  let service: ProjectMemberService;
  let http: HttpTestingController;
  const base = `${environment.apiUrl}/projects/P1/members`;

  beforeEach(() => {
    TestBed.configureTestingModule({
      providers: [provideHttpClient(), provideHttpClientTesting()],
    });
    service = TestBed.inject(ProjectMemberService);
    http = TestBed.inject(HttpTestingController);
  });

  afterEach(() => http.verify());

  it('lists on GET …/members (ProjectMemberEndpoints.cs:23)', () => {
    service.getByProject('P1').subscribe();
    expect(http.expectOne(base).request.method).toBe('GET');
  });

  it('adds with { employeeId, access: int } and reads memberId (ProjectMemberEndpoints.cs:32)', () => {
    let id = '';
    service
      .add({ projectId: 'P1', employeeId: 'E1', access: 'Contributor' })
      .subscribe((v) => (id = v));
    const r = http.expectOne(base);
    expect(r.request.method).toBe('POST');
    expect(r.request.body).toEqual({ employeeId: 'E1', access: 2 });
    r.flush({ memberId: 'M1' });
    expect(id).toBe('M1');
  });

  it('changes access with PUT …/members/{id}/access (ProjectMemberEndpoints.cs:41)', () => {
    service.changeAccess('P1', 'M1', { access: 'Manager' }).subscribe();
    const r = http.expectOne(`${base}/M1/access`);
    expect(r.request.method).toBe('PUT');
    expect(r.request.body).toEqual({ access: 3 });
  });

  it('removes with DELETE …/members/{id} (ProjectMemberEndpoints.cs:50)', () => {
    service.remove('P1', 'M1').subscribe();
    expect(http.expectOne(`${base}/M1`).request.method).toBe('DELETE');
  });
});
