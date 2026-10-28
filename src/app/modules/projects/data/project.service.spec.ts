import { TestBed } from '@angular/core/testing';
import { HttpTestingController, provideHttpClientTesting } from '@angular/common/http/testing';
import { provideHttpClient } from '@angular/common/http';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { environment } from '../../../../environments/environment';
import { ERROR_MESSAGES, ERROR_MESSAGES_AR } from '@platform/errors/error-catalog';
import type { CreateProjectRequest } from '../model/project.model';
import { ProjectService } from './project.service';

describe('ProjectService', () => {
  let service: ProjectService;
  let http: HttpTestingController;

  beforeEach(() => {
    TestBed.configureTestingModule({
      providers: [provideHttpClient(), provideHttpClientTesting()],
    });
    service = TestBed.inject(ProjectService);
    http = TestBed.inject(HttpTestingController);
  });

  afterEach(() => http.verify());

  describe('normalizeProject — stageCount (008b #3)', () => {
    it('reads ProjectResponse.StageCount', () => {
      expect(service.normalizeProject({ id: 'p', stageCount: 3 }).stageCount).toBe(3);
    });

    it('defaults to 0 when the field is absent', () => {
      expect(service.normalizeProject({ id: 'p' }).stageCount).toBe(0);
    });
  });

  describe('normalizeProject — isActive (008b #4)', () => {
    it('reads ProjectResponse.IsActive = false (an inactive project is still returned by GET /projects/{id})', () => {
      expect(service.normalizeProject({ id: 'p', isActive: false }).isActive).toBe(false);
    });

    it('defaults to true when the field is absent', () => {
      expect(service.normalizeProject({ id: 'p' }).isActive).toBe(true);
    });
  });

  describe('create (008b #2) — POST /api/projects → 200 { projectId }', () => {
    const req: CreateProjectRequest = {
      code: 'PRJ-7',
      name: 'Villa 7',
      address: 'New Cairo',
      clientId: 'c1',
      workflowType: 'FreeStyle',
      stageTemplateId: null,
      estimatedStartDate: '2026-11-01',
      estimatedEndDate: null,
    };

    it('sends CreateProjectCommand (code, int workflowType, estimated* dates; no status/budget) and emits the projectId string', () => {
      let id: unknown;
      service.create(req).subscribe((r) => (id = r));

      const call = http.expectOne(`${environment.apiUrl}/projects`);
      expect(call.request.method).toBe('POST');
      expect(call.request.body).toEqual({
        code: 'PRJ-7',
        name: 'Villa 7',
        address: 'New Cairo',
        clientId: 'c1',
        workflowType: 2,
        stageTemplateId: null,
        estimatedStartDate: '2026-11-01',
        estimatedEndDate: null,
      });
      expect(call.request.body).not.toHaveProperty('status');
      expect(call.request.body).not.toHaveProperty('estimatedBudget');
      call.flush({ projectId: 'p1' });

      expect(id).toBe('p1');
    });

    it('has EN and AR copy for the new projects.ClientNotFound code', () => {
      expect(ERROR_MESSAGES['projects.ClientNotFound']).toBeTruthy();
      expect(ERROR_MESSAGES_AR['projects.ClientNotFound']).toBeTruthy();
    });
  });
});
