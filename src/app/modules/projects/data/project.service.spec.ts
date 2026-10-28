import { TestBed } from '@angular/core/testing';
import { HttpTestingController, provideHttpClientTesting } from '@angular/common/http/testing';
import { provideHttpClient } from '@angular/common/http';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
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
});
