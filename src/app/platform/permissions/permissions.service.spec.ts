import { TestBed } from '@angular/core/testing';
import { describe, expect, it } from 'vitest';
import { AuthStore } from '../auth/auth.store';
import { PermissionsService } from './permissions.service';

describe('PermissionsService', () => {
  function make(held: string[]) {
    TestBed.configureTestingModule({
      providers: [{ provide: AuthStore, useValue: { can: (p: string) => held.includes(p) } }],
    });
    return TestBed.inject(PermissionsService);
  }

  it('can() is any-of', () => {
    const s = make(['a']);
    expect(s.can(['a', 'b'])).toBe(true);
    expect(s.can('b')).toBe(false);
  });

  it('UI-1: canAll() needs every listed permission, and an empty list is never enough', () => {
    const s = make(['a', 'b']);
    expect(s.canAll(['a', 'b'])).toBe(true);
    expect(s.canAll(['a', 'c'])).toBe(false);
    expect(s.canAll([])).toBe(false);
  });
});
