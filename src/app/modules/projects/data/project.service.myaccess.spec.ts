import { TestBed } from '@angular/core/testing';
import { HttpTestingController, provideHttpClientTesting } from '@angular/common/http/testing';
import { provideHttpClient } from '@angular/common/http';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { environment } from '../../../../environments/environment';
import { ProjectService } from './project.service';

/** crmp P1-B: `myAccess` appended to ProjectResponse and ProjectDetailsResponse (GrantContracts.cs:32-38). */
describe('ProjectService — myAccess (crmp P1-B)', () => {
  let service: ProjectService;
  let http: HttpTestingController;
  const api = environment.apiUrl;

  beforeEach(() => {
    TestBed.configureTestingModule({
      providers: [provideHttpClient(), provideHttpClientTesting()],
    });
    service = TestBed.inject(ProjectService);
    http = TestBed.inject(HttpTestingController);
  });

  afterEach(() => http.verify());

  it('normalises myAccess on GET /projects/{id}; absent → null', () => {
    const got: unknown[] = [];
    service.getById('P1').subscribe((p) => got.push(p.myAccess));
    http.expectOne(`${api}/projects/P1`).flush({
      id: 'P1',
      myLevel: 2,
      myAccess: {
        source: 'Grant',
        level: 2,
        areas: 6,
        stageIds: ['S1'],
        expiresAtUtc: '2026-12-01T00:00:00Z',
      },
    });
    service.getById('P2').subscribe((p) => got.push(p.myAccess));
    http.expectOne(`${api}/projects/P2`).flush({ id: 'P2', myLevel: 3 });
    expect(got).toEqual([
      {
        source: 'Grant',
        level: 'Editor',
        areas: ['StagesAndTasks', 'Documents'],
        stageIds: ['S1'],
        expiresAtUtc: '2026-12-01T00:00:00Z',
      },
      null,
    ]);
  });

  it('reads the top-level myAccess of /details and copies it onto project', () => {
    let out: unknown[] = [];
    service
      .getDetails('P1')
      .subscribe((d) => (out = [d.myAccess?.source, d.project.myAccess?.areas]));
    http.expectOne(`${api}/projects/P1/details`).flush({
      project: { id: 'P1', status: 2, isActive: true },
      stages: [],
      unstagedTasks: [],
      taskCounts: [],
      gates: {},
      myLevel: 1,
      myAccess: { source: 'Grant', level: 1, areas: 1, stageIds: [], expiresAtUtc: null },
    });
    expect(out).toEqual(['Grant', ['Overview']]);
  });

  it('reads myAccess on each list row', () => {
    let sources: unknown[] = [];
    service.getAll().subscribe((p) => (sources = p.items.map((x) => x.myAccess?.source ?? null)));
    http
      .expectOne((r) => r.url === `${api}/projects`)
      .flush({
        items: [
          {
            id: 'P1',
            myLevel: 3,
            myAccess: { source: 'Member', level: 3, areas: 63, stageIds: [] },
          },
          { id: 'P2', myLevel: 1, myAccess: { source: 'Grant', level: 1, areas: 8, stageIds: [] } },
          { id: 'P3', myAccess: { source: 'Bogus' } },
        ],
        totalCount: 3,
      });
    expect(sources).toEqual(['Member', 'Grant', null]);
  });
});
