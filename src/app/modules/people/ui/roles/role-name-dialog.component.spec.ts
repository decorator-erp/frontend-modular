import { TestBed } from '@angular/core/testing';
import { provideHttpClient } from '@angular/common/http';
import { HttpTestingController, provideHttpClientTesting } from '@angular/common/http/testing';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { PERA_MODAL_DATA, PeraModalRef } from '@ds';
import { environment } from '../../../../../environments/environment';
import { AuthStore } from '@platform/auth/auth.store';
import { RoleNameDialogComponent, RoleNameDialogData } from './role-name-dialog.component';

/** 006b-1 #6: a seeded role keeps its name; its description stays editable. */
describe('RoleNameDialogComponent — seeded roles (006b-1 #6)', () => {
  let backend: HttpTestingController;
  const modalRef = { close: vi.fn() };

  function create(data: RoleNameDialogData) {
    TestBed.configureTestingModule({
      imports: [RoleNameDialogComponent],
      providers: [
        provideHttpClient(),
        provideHttpClientTesting(),
        { provide: PERA_MODAL_DATA, useValue: data },
        { provide: PeraModalRef, useValue: modalRef },
        { provide: AuthStore, useValue: { user: () => null } },
      ],
    });
    backend = TestBed.inject(HttpTestingController);
    const fixture = TestBed.createComponent(RoleNameDialogComponent);
    fixture.detectChanges();
    return fixture;
  }

  beforeEach(() => modalRef.close.mockClear());
  afterEach(() => backend.verify());

  it('locks the name of a system role, saves the description with the ORIGINAL name', () => {
    const fixture = create({
      roleId: 'r-admin',
      currentName: 'admin',
      currentDescription: 'Old',
      systemRole: true,
    });
    const c = fixture.componentInstance;
    expect(c.form.controls.roleName.disabled).toBe(true);
    expect((fixture.nativeElement as HTMLElement).textContent).toContain(
      'System roles keep their name.',
    );

    c.form.controls.description.setValue('Runs the office');
    c.submit();
    const put = backend.expectOne(`${environment.apiUrl}/roles/r-admin`);
    expect(put.request.body).toEqual({ name: 'admin', description: 'Runs the office' });
    put.flush(null);
    expect(modalRef.close).toHaveBeenCalledWith(true);
  });

  it('a custom role can still be renamed', () => {
    const fixture = create({ roleId: 'r-x', currentName: 'Designer', systemRole: false });
    expect(fixture.componentInstance.form.controls.roleName.enabled).toBe(true);
  });
});
