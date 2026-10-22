import { TestBed } from '@angular/core/testing';
import { HttpErrorResponse } from '@angular/common/http';
import { provideRouter } from '@angular/router';
import { of, throwError } from 'rxjs';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { PermissionsService } from '@platform/permissions';
import { EmployeeService } from '../../data/employee.service';
import { LookupCache } from '../../data/lookup.cache';
import { ProfileComponent } from './profile.component';

/**
 * 006b-2 #27: backend v3 answers `/employees/me` for a caller with no employee record with a
 * ProblemDetails 404 `employees.NotFound`. The ported "404 → empty state" keys on the status, so it
 * still triggers.
 */
describe('ProfileComponent — no employee record (006b-2 #27)', () => {
  beforeEach(() => {
    // jsdom has no matchMedia; ThemeService reads it for the system colour scheme.
    vi.stubGlobal(
      'matchMedia',
      vi.fn(() => ({
        matches: false,
        addEventListener: vi.fn(),
        removeEventListener: vi.fn(),
        addListener: vi.fn(),
        removeListener: vi.fn(),
      })),
    );
    TestBed.configureTestingModule({
      providers: [
        provideRouter([]),
        {
          provide: EmployeeService,
          useValue: {
            getMe: () =>
              throwError(
                () =>
                  new HttpErrorResponse({
                    status: 404,
                    error: {
                      type: 'https://tools.ietf.org/html/rfc9110#section-15.5.5',
                      title: 'employees.NotFound',
                      status: 404,
                      detail: 'Employee was not found.',
                      errors: { 'employees.NotFound': ['Employee was not found.'] },
                    },
                  }),
              ),
          },
        },
        { provide: LookupCache, useValue: { departments: () => of([]) } },
        { provide: PermissionsService, useValue: { can: () => true } },
      ],
    });
  });

  afterEach(() => vi.unstubAllGlobals());

  it('a ProblemDetails 404 → the empty "profile unavailable" state, not the failure state', () => {
    vi.spyOn(console, 'error').mockImplementation(() => undefined);
    const fixture = TestBed.createComponent(ProfileComponent);
    fixture.detectChanges();
    const c = fixture.componentInstance;
    expect(c.profileUnavailable()).toBe(true);
    expect(c.failed()).toBe(false);
  });
});
