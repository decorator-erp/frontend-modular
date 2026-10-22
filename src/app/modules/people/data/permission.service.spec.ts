import { TestBed } from '@angular/core/testing';
import { provideHttpClient } from '@angular/common/http';
import { HttpTestingController, provideHttpClientTesting } from '@angular/common/http/testing';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { environment } from '../../../../environments/environment';
import { AuthStore } from '@platform/auth/auth.store';
import { PermissionService } from './permission.service';

describe('PermissionService', () => {
  let service: PermissionService;
  let backend: HttpTestingController;
  const authStore = { user: vi.fn(() => ({ userId: 'me-1' })), refreshPermissions: vi.fn() };

  beforeEach(() => {
    TestBed.configureTestingModule({
      providers: [
        PermissionService,
        provideHttpClient(),
        provideHttpClientTesting(),
        { provide: AuthStore, useValue: authStore },
      ],
    });
    service = TestBed.inject(PermissionService);
    backend = TestBed.inject(HttpTestingController);
  });

  afterEach(() => backend.verify());

  /** 006b-1 #5b: self reads `/me/effective`, never `{userId}/effective`. */
  it('getMyEffective() reads GET /permissions/me/effective', () => {
    let result: unknown;
    service.getMyEffective().subscribe((r) => (result = r));

    backend
      .expectOne(`${environment.apiUrl}/permissions/me/effective`)
      .flush({ userId: 'me-1', permissions: ['employees.read'], overrides: [] });

    expect(result).toEqual({ userId: 'me-1', permissions: ['employees.read'], overrides: [] });
    backend.expectNone(`${environment.apiUrl}/permissions/users/me-1/effective`);
  });

  it('getUserEffective(id) still reads the admin route', () => {
    service.getUserEffective('u-9').subscribe();
    backend
      .expectOne(`${environment.apiUrl}/permissions/users/u-9/effective`)
      .flush({ userId: 'u-9', permissions: [], overrides: [] });
  });
});
