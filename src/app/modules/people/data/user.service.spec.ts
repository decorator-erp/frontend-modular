import { TestBed } from '@angular/core/testing';
import { provideHttpClient } from '@angular/common/http';
import { HttpTestingController, provideHttpClientTesting } from '@angular/common/http/testing';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { environment } from '../../../../environments/environment';
import { UserService } from './user.service';

/** 006b-1 #17: `GET /api/users` (`users.read`), paged ≤ 200, literal search. */
describe('UserService', () => {
  let service: UserService;
  let backend: HttpTestingController;

  beforeEach(() => {
    TestBed.configureTestingModule({
      providers: [UserService, provideHttpClient(), provideHttpClientTesting()],
    });
    service = TestBed.inject(UserService);
    backend = TestBed.inject(HttpTestingController);
  });

  afterEach(() => backend.verify());

  it('list() reads GET /api/users with page, pageSize and search, and normalizes the page', () => {
    let result: unknown;
    service.list({ page: 2, pageSize: 25, search: 'mona' }).subscribe((r) => (result = r));

    const req = backend.expectOne((r) => r.url === `${environment.apiUrl}/users`);
    expect(req.request.params.get('page')).toBe('2');
    expect(req.request.params.get('pageSize')).toBe('25');
    expect(req.request.params.get('search')).toBe('mona');
    req.flush({
      items: [
        {
          id: 'u-admin',
          email: 'admin@pera.test',
          firstName: 'System',
          lastName: 'Admin',
          userType: 'Staff',
          isActive: true,
          lastLoginAt: null,
          roles: ['admin'],
        },
      ],
      pageNumber: 2,
      pageSize: 25,
      totalCount: 26,
      totalPages: 2,
    });

    expect(result).toEqual({
      items: [
        {
          id: 'u-admin',
          email: 'admin@pera.test',
          firstName: 'System',
          lastName: 'Admin',
          userType: 'Staff',
          isActive: true,
          lastLoginAt: null,
          roles: ['admin'],
        },
      ],
      totalCount: 26,
      page: 2,
      pageSize: 25,
      totalPages: 2,
    });
  });

  it('clamps pageSize to the server cap of 200 and omits an empty search', () => {
    service.list({ pageSize: 500 }).subscribe();
    const req = backend.expectOne((r) => r.url === `${environment.apiUrl}/users`);
    expect(req.request.params.get('pageSize')).toBe('200');
    expect(req.request.params.has('search')).toBe(false);
    req.flush({ items: [], pageNumber: 1, pageSize: 200, totalCount: 0, totalPages: 0 });
  });
});
