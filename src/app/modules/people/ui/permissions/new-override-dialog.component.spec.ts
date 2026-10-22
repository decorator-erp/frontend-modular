import { TestBed } from '@angular/core/testing';
import { provideHttpClient } from '@angular/common/http';
import { HttpTestingController, provideHttpClientTesting } from '@angular/common/http/testing';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { PERA_MODAL_DATA, PeraModalRef } from '@ds';
import { environment } from '../../../../../environments/environment';
import { AuthStore } from '@platform/auth/auth.store';
import { PermissionOverrideDto } from '../../model/people.model';
import { NewOverrideDialogComponent } from './new-override-dialog.component';

const USERS = `${environment.apiUrl}/permissions/users/u-7`;
const override = (isGranted: boolean, expiresAt: string | null): PermissionOverrideDto => ({
  id: 'o-1',
  permission: 'projects.read',
  isGranted,
  grantedById: 'admin-1',
  reason: null,
  expiresAt,
});

/**
 * 006b-1 #7. Backend v3 renews an expired or inactive override in place and answers 409 only for a
 * LIVE one, so the dialog deletes first only when replacing a live override in the opposite
 * direction.
 */
describe('NewOverrideDialogComponent — writes against backend v3 (006b-1 #7)', () => {
  let backend: HttpTestingController;
  const modalRef = { close: vi.fn() };

  function create(existing: PermissionOverrideDto[]) {
    TestBed.configureTestingModule({
      imports: [NewOverrideDialogComponent],
      providers: [
        provideHttpClient(),
        provideHttpClientTesting(),
        {
          provide: PERA_MODAL_DATA,
          useValue: {
            targetUserId: 'u-7',
            targetName: 'Mona',
            permissions: [
              { value: 'projects.read', group: 'Projects', displayName: 'Projects read' },
            ],
            existing,
          },
        },
        { provide: PeraModalRef, useValue: modalRef },
        {
          provide: AuthStore,
          useValue: { user: () => ({ userId: 'admin-1' }), refreshPermissions: vi.fn() },
        },
      ],
    });
    backend = TestBed.inject(HttpTestingController);
    const fixture = TestBed.createComponent(NewOverrideDialogComponent);
    fixture.detectChanges();
    return fixture.componentInstance;
  }

  beforeEach(() => modalRef.close.mockClear());
  afterEach(() => backend.verify());

  it('an EXPIRED opposite override → a direct grant, no delete', () => {
    const c = create([override(false, '2020-01-01T00:00:00Z')]);
    c.form.patchValue({ permission: 'projects.read', type: 'grant' });
    c.submit();

    backend.expectNone((r) => r.method === 'DELETE');
    backend.expectOne(`${USERS}/overrides/grant`).flush(null);
    expect(modalRef.close).toHaveBeenCalledWith(true);
  });

  it('a LIVE grant replaced by a deny → DELETE the override, then POST the deny', () => {
    const c = create([override(true, null)]);
    c.form.patchValue({ permission: 'projects.read', type: 'deny' });
    c.submit();

    backend.expectNone(`${USERS}/overrides/deny`);
    const del = backend.expectOne(`${USERS}/overrides/projects.read`);
    expect(del.request.method).toBe('DELETE');
    del.flush(null);
    backend.expectOne(`${USERS}/overrides/deny`).flush(null);
    expect(modalRef.close).toHaveBeenCalledWith(true);
  });

  it('a live override in the SAME direction is left for the server (no delete)', () => {
    const c = create([override(true, null)]);
    c.form.patchValue({ permission: 'projects.read', type: 'grant' });
    c.submit();
    backend.expectNone((r) => r.method === 'DELETE');
    backend.expectOne(`${USERS}/overrides/grant`).flush(null);
  });

  it.each([
    ['permissions.LastHolder', 409, 'At least one active user must keep this permission.'],
    ['users.NotFound', 404, 'User not found.'],
  ])('%s → the catalog message on the form', (code, status, message) => {
    const c = create([]);
    c.form.patchValue({ permission: 'projects.read', type: 'deny' });
    c.submit();
    backend
      .expectOne(`${USERS}/overrides/deny`)
      .flush({ title: code, errors: { [code]: ['server text'] } }, { status, statusText: 'x' });
    expect(c.serverError()?.generalMessage).toBe(message);
    expect(modalRef.close).not.toHaveBeenCalled();
  });
});
