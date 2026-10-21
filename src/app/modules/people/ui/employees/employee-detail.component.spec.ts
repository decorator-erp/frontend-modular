import { TestBed } from '@angular/core/testing';
import { ActivatedRoute, convertToParamMap, provideRouter } from '@angular/router';
import { of } from 'rxjs';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { ConfirmService, ModalService } from '@ds';
import { ToastService } from '@platform/feedback/toast.service';
import { PermissionsService } from '@platform/permissions';
import { EmployeeService } from '../../data/employee.service';
import { LookupCache } from '../../data/lookup.cache';
import { EmployeeFull } from '../../model/employee.model';
import { EmployeeDetailComponent } from './employee-detail.component';

const employee = (over: Partial<EmployeeFull>): EmployeeFull => ({
  id: 'e-1',
  userId: 'u-1',
  fullName: 'Mona Adel',
  email: 'mona@pera.test',
  jobTitle: 'Designer',
  isActive: true,
  primaryDepartmentId: null,
  trackKey: 'e-1',
  contractType: 'FullTime',
  phoneNumber: null,
  emergencyContactPhone: null,
  hireDate: '2024-01-01',
  endDate: null,
  notes: null,
  loginActive: true,
  ...over,
});

/** 006b-2 #20: the login's own state on the employee detail, and the post-activate refetch. */
describe('EmployeeDetailComponent — loginActive (006b-2 #20)', () => {
  const api = {
    getFull: vi.fn(),
    getOverview: () => of(null),
    getProjects: () => of([]),
    getTasks: () => of([]),
    activate: vi.fn(() => of(undefined)),
    deactivate: vi.fn(() => of(undefined)),
  };

  beforeEach(() => {
    vi.useFakeTimers();
    vi.clearAllMocks();
    TestBed.configureTestingModule({
      providers: [
        provideRouter([]),
        {
          provide: ActivatedRoute,
          useValue: { snapshot: { paramMap: convertToParamMap({ id: 'e-1' }) } },
        },
        { provide: EmployeeService, useValue: api },
        { provide: LookupCache, useValue: { departments: () => of([]) } },
        { provide: ConfirmService, useValue: { open: () => Promise.resolve(true) } },
        { provide: ModalService, useValue: { open: vi.fn() } },
        { provide: ToastService, useValue: { show: vi.fn() } },
        { provide: PermissionsService, useValue: { can: () => true } },
      ],
    });
  });

  afterEach(() => vi.useRealTimers());

  function render(first: EmployeeFull) {
    api.getFull.mockReturnValueOnce(of(first));
    const fixture = TestBed.createComponent(EmployeeDetailComponent);
    fixture.detectChanges();
    return fixture;
  }

  const text = (fixture: { nativeElement: HTMLElement }) => fixture.nativeElement.textContent ?? '';
  const BANNER = "This employee is active, but their login is off, so they can't sign in.";

  it('shows the login chip, and warns when an active employee cannot sign in', () => {
    const fixture = render(employee({ loginActive: false }));
    expect(text(fixture)).toContain('Login off');
    expect(text(fixture)).toContain(BANNER);
  });

  it('no warning when the login is on', () => {
    expect(text(render(employee({ loginActive: true })))).not.toContain(BANNER);
  });

  it('no warning for an inactive employee (their login is off by design)', () => {
    expect(text(render(employee({ isActive: false, loginActive: false })))).not.toContain(BANNER);
  });

  it('after activate: no banner at first, one refetch after ~2 s, and the refetch decides', async () => {
    const fixture = render(employee({ isActive: false, loginActive: false }));
    expect(text(fixture)).not.toContain(BANNER);

    api.getFull.mockReturnValueOnce(of(employee({ isActive: true, loginActive: true })));
    await fixture.componentInstance.toggleActive();
    fixture.detectChanges();

    // Active now, login still reads off: the banner is held while the outbox catches up.
    expect(fixture.componentInstance.employee()?.isActive).toBe(true);
    expect(text(fixture)).not.toContain(BANNER);
    expect(api.getFull).toHaveBeenCalledTimes(1);

    vi.advanceTimersByTime(1999);
    expect(api.getFull).toHaveBeenCalledTimes(1);
    vi.advanceTimersByTime(1);
    expect(api.getFull).toHaveBeenCalledTimes(2);
    fixture.detectChanges();
    expect(text(fixture)).toContain('Login on');
    expect(text(fixture)).not.toContain(BANNER);
  });

  it('after activate, a refetch that still reads "login off" shows the banner', async () => {
    const fixture = render(employee({ isActive: false, loginActive: false }));
    api.getFull.mockReturnValueOnce(of(employee({ isActive: true, loginActive: false })));
    await fixture.componentInstance.toggleActive();
    vi.advanceTimersByTime(2000);
    fixture.detectChanges();
    expect(text(fixture)).toContain(BANNER);
  });
});
