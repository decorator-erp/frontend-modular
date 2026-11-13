import { TestBed } from '@angular/core/testing';
import { ActivatedRouteSnapshot, Router, RouterStateSnapshot } from '@angular/router';
import { describe, expect, it, vi } from 'vitest';
import { AuthStore } from './auth.store';
import { PermissionGuard } from './permission.guard';

describe('PermissionGuard', () => {
  function run(permission: string | string[] | undefined, held: string[]) {
    const navigate = vi.fn();
    TestBed.resetTestingModule();
    TestBed.configureTestingModule({
      providers: [
        { provide: AuthStore, useValue: { can: (p: string) => held.includes(p) } },
        { provide: Router, useValue: { navigate } },
      ],
    });
    const route = { data: { permission } } as unknown as ActivatedRouteSnapshot;
    const result = TestBed.runInInjectionContext(() =>
      PermissionGuard(route, {} as RouterStateSnapshot),
    );
    return { result, navigate };
  }

  it('admits a holder and sends anyone else to /403', () => {
    expect(run('x.read', ['x.read']).result).toBe(true);
    const denied = run('x.read', []);
    expect(denied.result).toBe(false);
    expect(denied.navigate).toHaveBeenCalledWith(['/403']);
  });

  it('UI-1: a list admits a caller holding any one of them', () => {
    expect(run(['permissions.manage', 'roles.read'], ['roles.read']).result).toBe(true);
    expect(run(['permissions.manage', 'roles.read'], ['users.read']).result).toBe(false);
  });

  it('a route with no permission is open', () => {
    expect(run(undefined, []).result).toBe(true);
  });
});
