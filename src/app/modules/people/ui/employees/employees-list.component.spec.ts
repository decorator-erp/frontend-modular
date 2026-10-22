import { TestBed } from '@angular/core/testing';
import { provideRouter } from '@angular/router';
import { of } from 'rxjs';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { ConfirmService, ModalService } from '@ds';
import { ToastService } from '@platform/feedback/toast.service';
import { PermissionsService } from '@platform/permissions';
import { EmployeeService } from '../../data/employee.service';
import { LookupCache } from '../../data/lookup.cache';
import { EmployeesListComponent } from './employees-list.component';

/** 006b-2 #10: the status filter against backend v3's inactive-hidden default. */
describe('EmployeesListComponent — status filter (006b-2 #10)', () => {
  const employees = {
    listPaged: vi.fn(() => of({ items: [], totalCount: 0, pageIndex: 1, totalPages: 0 })),
  };

  beforeEach(() => {
    vi.clearAllMocks();
    TestBed.configureTestingModule({
      providers: [
        provideRouter([]),
        { provide: EmployeeService, useValue: employees },
        { provide: LookupCache, useValue: { departments: () => of([]), roles: () => of([]) } },
        { provide: ModalService, useValue: { open: vi.fn() } },
        { provide: ConfirmService, useValue: { open: vi.fn() } },
        { provide: ToastService, useValue: { show: vi.fn() } },
        { provide: PermissionsService, useValue: { can: () => true } },
      ],
    });
  });

  function create() {
    const fixture = TestBed.createComponent(EmployeesListComponent);
    fixture.detectChanges();
    return fixture.componentInstance;
  }

  const lastCall = () => (employees.listPaged.mock.calls.at(-1) as unknown[])[0];

  it('Active (the default) leaves the server default: no includeInactive', () => {
    create();
    expect(lastCall()).toMatchObject({ isActive: true, includeInactive: false });
  });

  it.each([
    ['inactive', false],
    ['all', undefined],
  ])('%s sends includeInactive=true and keeps the client narrowing', (status, isActive) => {
    const c = create();
    c.onFilters({ facets: { status: [status] } });
    expect(lastCall()).toMatchObject({ includeInactive: true, isActive });
  });
});
