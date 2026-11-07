import { TestBed } from '@angular/core/testing';
import { HttpTestingController, provideHttpClientTesting } from '@angular/common/http/testing';
import { provideHttpClient } from '@angular/common/http';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { environment } from '../../../../environments/environment';
import { ProjectService } from './project.service';

/** crmp A-3: `myLevel` on ProjectResponse and at the top of ProjectDetailsResponse (contract §2.17.2). */
describe('ProjectService — myLevel (crmp A-3)', () => {
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

  it('reads myLevel on each list row (GET /projects)', () => {
    let levels: string[] = [];
    service.getAll().subscribe((p) => (levels = p.items.map((x) => x.myLevel)));
    http
      .expectOne((r) => r.url === `${api}/projects`)
      .flush({
        items: [{ id: 'P1', myLevel: 3 }, { id: 'P2', myLevel: 1 }, { id: 'P3' }],
        totalCount: 3,
      });
    expect(levels).toEqual(['Manager', 'Viewer', 'Viewer']);
  });

  it('reads myLevel on GET /projects/{id}', () => {
    let level = '';
    service.getById('P1').subscribe((p) => (level = p.myLevel));
    http.expectOne(`${api}/projects/P1`).flush({ id: 'P1', myLevel: 2 });
    expect(level).toBe('Editor');
  });

  it('reads the top-level myLevel of /details and copies it onto project', () => {
    let levels: string[] = [];
    service.getDetails('P1').subscribe((d) => (levels = [d.myLevel, d.project.myLevel]));
    http.expectOne(`${api}/projects/P1/details`).flush({
      project: { id: 'P1', status: 2, isActive: true },
      stages: [],
      unstagedTasks: [],
      taskCounts: [],
      gates: { total: 0, pending: 0, satisfied: 0, rejected: 0 },
      myLevel: 3,
    });
    expect(levels).toEqual(['Manager', 'Manager']);
  });
});
