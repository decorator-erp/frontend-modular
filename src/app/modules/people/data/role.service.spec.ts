import { TestBed } from '@angular/core/testing';
import { HttpErrorResponse, provideHttpClient } from '@angular/common/http';
import { HttpTestingController, provideHttpClientTesting } from '@angular/common/http/testing';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { environment } from '../../../../environments/environment';
import { AuthStore } from '@platform/auth/auth.store';
import { RoleService } from './role.service';

describe('RoleService', () => {
  let service: RoleService;
  let backend: HttpTestingController;

  beforeEach(() => {
    TestBed.configureTestingModule({
      providers: [
        RoleService,
        provideHttpClient(),
        provideHttpClientTesting(),
        {
          provide: AuthStore,
          useValue: { user: () => ({ userId: 'me-1' }), refreshPermissions: vi.fn() },
        },
      ],
    });
    service = TestBed.inject(RoleService);
    backend = TestBed.inject(HttpTestingController);
  });

  afterEach(() => backend.verify());

  /** 006b-1 #18: the members of a role, paged. */
  it('users(roleId, page) reads GET /api/roles/{roleId}/users and normalizes the page', () => {
    let result: unknown;
    service.users('r-mgr', 2).subscribe((r) => (result = r));

    const req = backend.expectOne((r) => r.url === `${environment.apiUrl}/roles/r-mgr/users`);
    expect(req.request.params.get('page')).toBe('2');
    expect(req.request.params.get('pageSize')).toBe('50');
    req.flush({
      items: [
        {
          id: 'u-1',
          email: 'mona@pera.test',
          firstName: 'Mona',
          lastName: 'Adel',
          userType: 'Staff',
          isActive: true,
          lastLoginAt: null,
          roles: ['manager'],
        },
      ],
      pageNumber: 2,
      pageSize: 50,
      totalCount: 51,
      totalPages: 2,
    });

    expect(result).toMatchObject({ totalCount: 51, page: 2, pageSize: 50, totalPages: 2 });
    expect((result as { items: { id: string }[] }).items[0].id).toBe('u-1');
  });

  it('an unknown role surfaces the 404', () => {
    let error: HttpErrorResponse | undefined;
    service.users('nope').subscribe({ error: (e) => (error = e) });
    backend
      .expectOne((r) => r.url === `${environment.apiUrl}/roles/nope/users`)
      .flush({ title: 'roles.NotFound' }, { status: 404, statusText: 'Not Found' });
    expect(error?.status).toBe(404);
  });
});
