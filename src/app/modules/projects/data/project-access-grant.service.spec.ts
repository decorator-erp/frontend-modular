import { TestBed } from '@angular/core/testing';
import { HttpTestingController, provideHttpClientTesting } from '@angular/common/http/testing';
import { provideHttpClient } from '@angular/common/http';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { environment } from '../../../../environments/environment';
import { HANDLED_ERROR_STATUSES } from '@platform/http/handled-errors';
import { ProjectAccessGrantService } from './project-access-grant.service';
import type { MyAccessGrant, ProjectAccessGrant } from '../model/access-grant.model';
import { areasToFlags, flagsToAreas } from '../model/access-grant.model';

/** crmp P1-B: dms `ProjectAccessGrantEndpoints.cs:25-74`. */
describe('ProjectAccessGrantService (crmp P1-B)', () => {
  let service: ProjectAccessGrantService;
  let http: HttpTestingController;
  const base = `${environment.apiUrl}/projects/P1/access-grants`;

  beforeEach(() => {
    TestBed.configureTestingModule({
      providers: [provideHttpClient(), provideHttpClientTesting()],
    });
    service = TestBed.inject(ProjectAccessGrantService);
    http = TestBed.inject(HttpTestingController);
  });

  afterEach(() => http.verify());

  it('flags round-trip: Overview|Documents = 5, Team = 32', () => {
    expect(areasToFlags(['Overview', 'Documents'])).toBe(5);
    expect(flagsToAreas(5)).toEqual(['Overview', 'Documents']);
    expect(flagsToAreas(63)).toHaveLength(6);
    expect(flagsToAreas(null)).toEqual([]);
  });

  it('lists on GET …/access-grants and maps level, areas and status ints (:27)', () => {
    let rows: ProjectAccessGrant[] = [];
    service.list('P1').subscribe((r) => (rows = r));
    const r = http.expectOne(base);
    expect(r.request.method).toBe('GET');
    r.flush([
      {
        id: 'G1',
        projectId: 'P1',
        employeeId: 'E1',
        employeeName: 'Mona',
        level: 2,
        areas: 6,
        stageIds: ['S1'],
        startsAtUtc: '2026-11-01T00:00:00Z',
        expiresAtUtc: null,
        reason: 'Q3 audit',
        grantedById: 'E9',
        grantedAtUtc: '2026-11-01T00:00:00Z',
        revokedAtUtc: null,
        revokedById: null,
        revokeReason: null,
        status: 2,
      },
      { id: 'G2', level: 3, areas: 1, status: 4, revokedById: 'E9', revokeReason: 'done' },
    ]);
    expect(rows[0]).toMatchObject({
      id: 'G1',
      employeeName: 'Mona',
      level: 'Editor',
      areas: ['StagesAndTasks', 'Documents'],
      stageIds: ['S1'],
      expiresAtUtc: null,
      status: 'Active',
    });
    expect(rows[1]).toMatchObject({
      level: 'Manager',
      areas: ['Overview'],
      status: 'Revoked',
      stageIds: [],
      revokeReason: 'done',
    });
  });

  it('creates with POST, ints and UTC dates, and reads grantId (:36); 403/409 handled', () => {
    let id = '';
    service
      .create('P1', {
        employeeId: 'E1',
        level: 'Viewer',
        areas: ['Overview', 'Sites'],
        stageIds: [],
        startsAtUtc: null,
        expiresAtUtc: '2026-11-09T10:00:00.000Z',
        reason: 'audit',
      })
      .subscribe((v) => (id = v));
    const r = http.expectOne(base);
    expect(r.request.method).toBe('POST');
    expect(r.request.body).toEqual({
      employeeId: 'E1',
      level: 1,
      areas: 9,
      stageIds: [],
      startsAtUtc: null,
      expiresAtUtc: '2026-11-09T10:00:00.000Z',
      reason: 'audit',
    });
    expect(r.request.context.get(HANDLED_ERROR_STATUSES)).toEqual([400, 403, 404, 409]);
    r.flush({ grantId: 'G7' });
    expect(id).toBe('G7');
  });

  it('updates with PUT …/{grantId} (:46)', () => {
    service
      .update('P1', 'G1', {
        level: 'Manager',
        areas: ['Team'],
        stageIds: ['S1', 'S2'],
        expiresAtUtc: null,
        reason: 'longer',
      })
      .subscribe();
    const r = http.expectOne(`${base}/G1`);
    expect(r.request.method).toBe('PUT');
    expect(r.request.body).toEqual({
      level: 3,
      areas: 32,
      stageIds: ['S1', 'S2'],
      expiresAtUtc: null,
      reason: 'longer',
    });
    expect(r.request.context.get(HANDLED_ERROR_STATUSES)).toEqual([400, 403, 404, 409]);
  });

  it('revokes with POST …/{grantId}/revoke { reason } (:56); a blank reason is null', () => {
    service.revoke('P1', 'G1', 'left the team').subscribe();
    const a = http.expectOne(`${base}/G1/revoke`);
    expect(a.request.method).toBe('POST');
    expect(a.request.body).toEqual({ reason: 'left the team' });
    expect(a.request.context.get(HANDLED_ERROR_STATUSES)).toEqual([403, 404, 409]);
    service.revoke('P1', 'G1', '  ').subscribe();
    expect(http.expectOne(`${base}/G1/revoke`).request.body).toEqual({ reason: null });
  });

  it('reads Shared with me on GET /api/me/access-grants (:67)', () => {
    let rows: MyAccessGrant[] = [];
    service.mine().subscribe((r) => (rows = r));
    const r = http.expectOne(`${environment.apiUrl}/me/access-grants`);
    expect(r.request.method).toBe('GET');
    r.flush([
      {
        grantId: 'G1',
        projectId: 'P1',
        projectCode: 'PRJ-1',
        projectName: 'Marina',
        level: 1,
        areas: 4,
        stageIds: [],
        startsAtUtc: '2026-11-01T00:00:00Z',
        expiresAtUtc: '2026-12-01T00:00:00Z',
        reason: 'r',
        status: 1,
      },
    ]);
    expect(rows).toEqual([
      {
        grantId: 'G1',
        projectId: 'P1',
        projectCode: 'PRJ-1',
        projectName: 'Marina',
        level: 'Viewer',
        areas: ['Documents'],
        stageIds: [],
        startsAtUtc: '2026-11-01T00:00:00Z',
        expiresAtUtc: '2026-12-01T00:00:00Z',
        reason: 'r',
        status: 'Upcoming',
      },
    ]);
  });
});
