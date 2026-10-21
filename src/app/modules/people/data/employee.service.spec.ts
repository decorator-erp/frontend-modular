import { TestBed } from '@angular/core/testing';
import { provideHttpClient } from '@angular/common/http';
import { HttpTestingController, provideHttpClientTesting } from '@angular/common/http/testing';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { environment } from '../../../../environments/environment';
import { AuthStore } from '@platform/auth/auth.store';
import { EmployeeService } from './employee.service';

describe('EmployeeService', () => {
  let service: EmployeeService;
  let backend: HttpTestingController;

  beforeEach(() => {
    TestBed.configureTestingModule({
      providers: [
        EmployeeService,
        provideHttpClient(),
        provideHttpClientTesting(),
        { provide: AuthStore, useValue: { user: () => null, refreshPermissions: vi.fn() } },
      ],
    });
    service = TestBed.inject(EmployeeService);
    backend = TestBed.inject(HttpTestingController);
  });

  afterEach(() => backend.verify());

  /**
   * 006b-1 #24: `byRole` used `GET /employees/by-role/{roleId}`, a route that never existed. It now
   * reads `GET /api/roles/{roleId}/users` and maps each account onto the directory row its consumer
   * (`ui/roles/roles.component.ts`, the members panel) renders: `id` (track), `fullName`,
   * `jobTitle || email`, and the page's `totalCount`.
   */
  it('byRole(roleId) reads /api/roles/{roleId}/users and maps accounts to directory rows', () => {
    let result: unknown;
    service.byRole('r-mgr').subscribe((r) => (result = r));

    backend.expectNone((r) => r.url.includes('/employees/by-role/'));
    const req = backend.expectOne((r) => r.url === `${environment.apiUrl}/roles/r-mgr/users`);
    expect(req.request.params.get('page')).toBe('1');
    expect(req.request.params.get('pageSize')).toBe('100');
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
        {
          id: 'u-2',
          email: 'nameless@pera.test',
          firstName: '',
          lastName: '',
          userType: 'Client',
          isActive: false,
          lastLoginAt: null,
          roles: ['manager'],
        },
      ],
      pageNumber: 1,
      pageSize: 100,
      totalCount: 2,
      totalPages: 1,
    });

    expect(result).toEqual({
      items: [
        {
          id: 'u-1',
          userId: 'u-1',
          fullName: 'Mona Adel',
          email: 'mona@pera.test',
          jobTitle: '',
          isActive: true,
          primaryDepartmentId: null,
          trackKey: 'u-1',
        },
        {
          id: 'u-2',
          userId: 'u-2',
          fullName: 'nameless@pera.test',
          email: 'nameless@pera.test',
          jobTitle: '',
          isActive: false,
          primaryDepartmentId: null,
          trackKey: 'u-2',
        },
      ],
      totalCount: 2,
      pageIndex: 1,
      totalPages: 1,
      truncated: false,
    });
  });

  /** 006b-2 #10: backend v3 hides inactive employees unless `includeInactive=true`. */
  it('listPaged({ includeInactive, isActive: false }) asks for inactive rows and keeps the client narrowing', () => {
    let result: { items: { id: string }[] } | undefined;
    service
      .listPaged({ page: 1, pageSize: 50, isActive: false, includeInactive: true })
      .subscribe((r) => (result = r));

    const req = backend.expectOne((r) => r.url === `${environment.apiUrl}/employees`);
    expect(req.request.params.get('includeInactive')).toBe('true');
    req.flush({
      items: [
        { id: 'e-1', appUserId: 'u-1', fullName: 'Active A', jobTitle: 'x', isActive: true },
        { id: 'e-2', appUserId: 'u-2', fullName: 'Gone B', jobTitle: 'y', isActive: false },
      ],
      pageNumber: 1,
      pageSize: 50,
      totalCount: 2,
      totalPages: 1,
    });
    expect(result!.items.map((e) => e.id)).toEqual(['e-2']);
  });

  it('listPaged() without includeInactive leaves the server default (active only)', () => {
    service.listPaged({ page: 1, pageSize: 50, isActive: true }).subscribe();
    const req = backend.expectOne((r) => r.url === `${environment.apiUrl}/employees`);
    expect(req.request.params.has('includeInactive')).toBe(false);
    req.flush({ items: [], pageNumber: 1, pageSize: 50, totalCount: 0, totalPages: 0 });
  });
});
