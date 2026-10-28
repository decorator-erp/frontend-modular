import { TestBed } from '@angular/core/testing';
import { HttpTestingController, provideHttpClientTesting } from '@angular/common/http/testing';
import { provideHttpClient } from '@angular/common/http';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { environment } from '../../../../environments/environment';
import { ProjectStageService } from './project-stage.service';

describe('ProjectStageService', () => {
  let service: ProjectStageService;
  let http: HttpTestingController;

  beforeEach(() => {
    TestBed.configureTestingModule({
      providers: [provideHttpClient(), provideHttpClientTesting()],
    });
    service = TestBed.inject(ProjectStageService);
    http = TestBed.inject(HttpTestingController);
  });

  afterEach(() => http.verify());

  describe('getByProject (008b #24) — GET /api/projects/{projectId}/stages', () => {
    it('calls the nested stages route and sorts the ProjectStageResponse rows by order', () => {
      let names: string[] = [];
      service.getByProject('P1').subscribe((stages) => (names = stages.map((s) => s.name)));

      const req = http.expectOne(`${environment.apiUrl}/projects/P1/stages`);
      expect(req.request.method).toBe('GET');
      expect(req.request.params.keys()).toEqual([]);
      req.flush([
        {
          id: 'S2',
          projectId: 'P1',
          name: 'Design',
          description: null,
          order: 2,
          status: 2,
          progressPercent: 10,
          completedTasks: 1,
          totalTasks: 10,
          cost: null,
        },
        {
          id: 'S1',
          projectId: 'P1',
          name: 'Gathering',
          description: null,
          order: 1,
          status: 3,
          progressPercent: 100,
          completedTasks: 4,
          totalTasks: 4,
          cost: 1200,
        },
      ]);

      expect(names).toEqual(['Gathering', 'Design']);
    });
  });
});
