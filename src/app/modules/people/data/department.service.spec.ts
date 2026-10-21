import { TestBed } from '@angular/core/testing';
import { provideHttpClient } from '@angular/common/http';
import { HttpTestingController, provideHttpClientTesting } from '@angular/common/http/testing';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { environment } from '../../../../environments/environment';
import { DepartmentService } from './department.service';

describe('DepartmentService', () => {
  let service: DepartmentService;
  let backend: HttpTestingController;

  beforeEach(() => {
    TestBed.configureTestingModule({
      providers: [DepartmentService, provideHttpClient(), provideHttpClientTesting()],
    });
    service = TestBed.inject(DepartmentService);
    backend = TestBed.inject(HttpTestingController);
  });

  afterEach(() => backend.verify());

  /** 006b-2 #11: backend v3 hides deleted departments unless asked; no caller asks. */
  it('getAll() never sends includeInactive (active departments only)', () => {
    service.getAll().subscribe();
    const req = backend.expectOne((r) => r.url === `${environment.apiUrl}/departments`);
    expect(req.request.params.has('includeInactive')).toBe(false);
    req.flush({ items: [], pageNumber: 1, pageSize: 200, totalCount: 0, totalPages: 0 });
  });
});
