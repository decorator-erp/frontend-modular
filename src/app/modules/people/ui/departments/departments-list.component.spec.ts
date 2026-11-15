import { TestBed } from '@angular/core/testing';
import { HttpErrorResponse } from '@angular/common/http';
import { provideRouter } from '@angular/router';
import { of, throwError } from 'rxjs';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { ConfirmService, ModalService } from '@ds';
import { ToastService } from '@platform/feedback/toast.service';
import { PermissionsService } from '@platform/permissions';
import { DepartmentResponse } from '../../model/people.model';
import { DepartmentService } from '../../data/department.service';
import { EmployeeService } from '../../data/employee.service';
import { DepartmentsListComponent } from './departments-list.component';

const dept = (id: string, over: Partial<DepartmentResponse> = {}): DepartmentResponse => ({
  id,
  name: `Dept ${id}`,
  description: null,
  departmentHeadId: null,
  isActive: true,
  headName: null,
  memberCount: 0,
  ...over,
});

/**
 * 006b-2 #22: backend v3's list response carries `headName` and `memberCount`, so the list renders
 * from it alone — no join against the directory and no per-card request.
 */
describe('DepartmentsListComponent — list response only (006b-2 #22)', () => {
  const api = {
    getAll: vi.fn(() =>
      of([
        dept('a', { departmentHeadId: 'e-9', headName: 'Hala Head', memberCount: 7 }),
        dept('b', { memberCount: 2 }),
        dept('c', { departmentHeadId: 'e-8', headName: 'Omar Lead', memberCount: 4 }),
      ]),
    ),
    getMembers: vi.fn(() => of([])),
    getById: vi.fn(),
  };

  beforeEach(() => {
    vi.clearAllMocks();
    TestBed.configureTestingModule({
      providers: [
        provideRouter([]),
        { provide: DepartmentService, useValue: api },
        // The directory knows nobody: names must come from the list response.
        { provide: EmployeeService, useValue: { listPaged: () => of({ items: [] }) } },
        { provide: ModalService, useValue: { open: vi.fn() } },
        { provide: ConfirmService, useValue: { open: vi.fn() } },
        { provide: ToastService, useValue: { show: vi.fn() } },
        { provide: PermissionsService, useValue: { can: () => true, canAll: () => true } },
      ],
    });
  });

  it('shows each head and the member count from the list response, with no per-card requests', () => {
    const fixture = TestBed.createComponent(DepartmentsListComponent);
    fixture.detectChanges();
    const el = fixture.nativeElement as HTMLElement;

    expect(el.textContent).toContain('Hala Head');
    expect(el.textContent).toContain('Omar Lead');
    expect(el.textContent).toContain('No head assigned');
    // The selected (first) department's count comes from `memberCount`, not from `/members`.
    expect(el.textContent).toContain('7');

    // One list read; `/members` only for the ONE selected department; no `/head` lookup at all.
    expect(api.getAll).toHaveBeenCalledTimes(1);
    expect(api.getMembers).toHaveBeenCalledTimes(1);
    expect(api.getMembers).toHaveBeenCalledWith('a');
    expect(api.getById).not.toHaveBeenCalled();
  });

  it('EmployeeService no longer offers the never-existing /departments/{id}/head lookup', () => {
    expect('getDepartmentHead' in EmployeeService.prototype).toBe(false);
  });
});

/** 006b-2 #26: `/members` of an unknown or deleted department is now 404 `departments.NotFound`. */
describe('DepartmentsListComponent — a vanished department (006b-2 #26)', () => {
  function render(getMembers: () => unknown) {
    TestBed.configureTestingModule({
      providers: [
        provideRouter([]),
        {
          provide: DepartmentService,
          useValue: { getAll: () => of([dept('a', { memberCount: 3 })]), getMembers },
        },
        { provide: EmployeeService, useValue: { listPaged: () => of({ items: [] }) } },
        { provide: ModalService, useValue: { open: vi.fn() } },
        { provide: ConfirmService, useValue: { open: vi.fn() } },
        { provide: ToastService, useValue: { show: vi.fn() } },
        { provide: PermissionsService, useValue: { can: () => true, canAll: () => true } },
      ],
    });
    const fixture = TestBed.createComponent(DepartmentsListComponent);
    fixture.detectChanges();
    return fixture.nativeElement as HTMLElement;
  }

  it('a 404 on /members shows the not-found state, not "No members."', () => {
    const el = render(() =>
      throwError(
        () => new HttpErrorResponse({ status: 404, error: { title: 'departments.NotFound' } }),
      ),
    );
    expect(el.textContent).toContain('This department no longer exists.');
    expect(el.textContent).not.toContain('No members.');
  });

  it('an empty, existing department still reads "No members."', () => {
    const el = render(() => of([]));
    expect(el.textContent).toContain('No members.');
    expect(el.textContent).not.toContain('This department no longer exists.');
  });
});
