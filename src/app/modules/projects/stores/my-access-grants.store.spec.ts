import { signal } from '@angular/core';
import { TestBed } from '@angular/core/testing';
import { Observable, of, throwError } from 'rxjs';
import { describe, expect, it, vi } from 'vitest';
import { AuthStore } from '@platform/auth/auth.store';
import { ProjectAccessGrantService } from '../data/project-access-grant.service';
import type { MyAccessGrant } from '../model/access-grant.model';
import { MyAccessGrantsStore } from './my-access-grants.store';

/** crmp P1-B: "Shared with me" rows, once per signed-in user. */
describe('MyAccessGrantsStore (crmp P1-B)', () => {
  const row = { grantId: 'G1', projectId: 'P1' } as MyAccessGrant;

  function make(mine: () => Observable<MyAccessGrant[]>) {
    const user = signal<{ userId: string } | null>({ userId: 'U1' });
    const api = { mine: vi.fn(mine) };
    TestBed.configureTestingModule({
      providers: [
        { provide: ProjectAccessGrantService, useValue: api },
        { provide: AuthStore, useValue: { user } },
      ],
    });
    return { store: TestBed.inject(MyAccessGrantsStore), api, user };
  }

  it('reads once, exposes hasAny, refresh re-reads', () => {
    const { store, api } = make(() => of([row]));
    store.ensure();
    store.ensure();
    expect(api.mine).toHaveBeenCalledTimes(1);
    expect(store.hasAny()).toBe(true);
    store.refresh();
    expect(api.mine).toHaveBeenCalledTimes(2);
  });

  it('no rows → no nav entry; a failed read is retried on the next ensure()', () => {
    const { store, api } = make(() => throwError(() => new Error('x')));
    store.ensure();
    expect(store.hasAny()).toBe(false);
    expect(store.error()).toBe(true);
    store.ensure();
    expect(api.mine).toHaveBeenCalledTimes(2);
  });

  it('signed out: no read; another login drops the rows and reads again', () => {
    const { store, api, user } = make(() => of([row]));
    store.ensure();
    user.set({ userId: 'U2' });
    TestBed.tick();
    expect(store.grants()).toEqual([]);
    store.ensure();
    expect(api.mine).toHaveBeenCalledTimes(2);
    user.set(null);
    TestBed.tick();
    store.ensure();
    expect(api.mine).toHaveBeenCalledTimes(2);
  });
});
