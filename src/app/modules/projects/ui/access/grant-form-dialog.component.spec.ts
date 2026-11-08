import { signal } from '@angular/core';
import { TestBed } from '@angular/core/testing';
import { HttpErrorResponse } from '@angular/common/http';
import { Observable, of, throwError } from 'rxjs';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { PERA_MODAL_DATA, PeraModalRef, RadioOption } from '@ds';
import { EmployeeService } from '@modules/people';
import { ToastService } from '@platform/feedback/toast.service';
import { LocaleService } from '@platform/i18n';
import { ProjectAccessGrantService } from '../../data/project-access-grant.service';
import type { ProjectAccessGrant } from '../../model/access-grant.model';
import { utcToLocalInput } from '../../model/grant-window';
import { GrantFormDialogComponent, GrantFormDialogData } from './grant-form-dialog.component';

/** crmp P1-B: the grant dialog — validation, presets, UTC dates, level cap, edit, refusals. */
describe('GrantFormDialogComponent (crmp P1-B)', () => {
  const NOW = '2026-11-08T10:00:00.000Z';
  let api: { create: ReturnType<typeof vi.fn>; update: ReturnType<typeof vi.fn> };
  let close: ReturnType<typeof vi.fn>;
  let toasts: unknown[];

  beforeEach(() => {
    vi.useFakeTimers({ toFake: ['Date'] });
    vi.setSystemTime(new Date(NOW));
    api = {
      create: vi.fn((): Observable<unknown> => of('G9')),
      update: vi.fn((): Observable<unknown> => of(null)),
    };
    close = vi.fn();
    toasts = [];
  });
  afterEach(() => vi.useRealTimers());

  function make(over: Partial<GrantFormDialogData> = {}) {
    const data: GrantFormDialogData = {
      mode: 'create',
      projectId: 'P1',
      projectName: 'Marina',
      stages: [
        { id: 'S1', name: 'Design' },
        { id: 'S2', name: 'Build' },
      ],
      maxLevel: 'Manager',
      excludeEmployeeIds: ['E2'],
      ...over,
    };
    TestBed.configureTestingModule({
      imports: [GrantFormDialogComponent],
      providers: [
        { provide: ProjectAccessGrantService, useValue: api },
        {
          provide: EmployeeService,
          useValue: {
            listPaged: () =>
              of({
                items: [
                  { id: 'E1', fullName: 'Mona' },
                  { id: 'E2', fullName: 'Already granted' },
                ],
              }),
          },
        },
        { provide: PERA_MODAL_DATA, useValue: data },
        { provide: PeraModalRef, useValue: { close } },
        { provide: ToastService, useValue: { show: (t: unknown) => toasts.push(t) } },
        { provide: LocaleService, useValue: { locale: signal<'en' | 'ar'>('en') } },
      ],
    });
    const f = TestBed.createComponent(GrantFormDialogComponent);
    f.detectChanges();
    return { f, c: f.componentInstance, el: f.nativeElement as HTMLElement };
  }

  function fill(c: GrantFormDialogComponent) {
    c.employeeId.set('E1');
    c.reason.set('  Q3 audit ');
  }

  it('offers the directory minus employees with an open grant', () => {
    const { c } = make();
    expect(c.employeeOptions()).toEqual([{ value: 'E1', label: 'Mona' }]);
  });

  it('refuses an empty form and says why, sending nothing', () => {
    const { c, f, el } = make();
    c.reason.set('');
    c.toggleArea('Overview', false);
    c.submit();
    f.detectChanges();
    expect(api.create).not.toHaveBeenCalled();
    expect(c.shown('employee')).toBe('Choose an employee.');
    expect(c.shown('areas')).toBe('Choose at least one area.');
    expect(c.shown('reason')).toBe('Give a reason (at most 500 characters).');
    expect(el.textContent).toContain('Choose an employee.');
  });

  it('defaults: Viewer, Overview, whole project, now, 1 week — the end is UTC Z one week on', () => {
    const { c } = make();
    fill(c);
    c.submit();
    expect(api.create).toHaveBeenCalledWith('P1', {
      employeeId: 'E1',
      level: 'Viewer',
      areas: ['Overview'],
      stageIds: [],
      startsAtUtc: null,
      expiresAtUtc: '2026-11-15T10:00:00.000Z',
      reason: 'Q3 audit',
    });
    expect(close).toHaveBeenCalledWith(true);
  });

  it.each([
    ['day', '2026-11-09T10:00:00.000Z'],
    ['month', '2026-12-08T10:00:00.000Z'],
    ['none', null],
  ] as const)('preset %s → expiresAtUtc %s', (preset, expected) => {
    const { c } = make();
    fill(c);
    c.duration.set(preset);
    c.submit();
    expect(api.create.mock.calls[0][1].expiresAtUtc).toBe(expected);
  });

  it('a custom start and end go out as UTC Z; presets run from the custom start', () => {
    const { c } = make();
    fill(c);
    c.start.set('custom');
    c.startAt.set(utcToLocalInput('2026-11-10T08:00:00Z'));
    c.duration.set('day');
    c.submit();
    expect(api.create.mock.calls[0][1]).toMatchObject({
      startsAtUtc: '2026-11-10T08:00:00.000Z',
      expiresAtUtc: '2026-11-11T08:00:00.000Z',
    });

    api.create.mockClear();
    c.duration.set('custom');
    c.endAt.set(utcToLocalInput('2026-11-20T16:30:00Z'));
    c.submit();
    expect(api.create.mock.calls[0][1].expiresAtUtc).toBe('2026-11-20T16:30:00.000Z');
  });

  it('refuses an end before the start or in the past, and a missing custom start', () => {
    const { c } = make();
    fill(c);
    c.duration.set('custom');
    c.endAt.set(utcToLocalInput('2026-11-08T09:00:00Z'));
    c.submit();
    expect(c.shown('end')).toBe('Choose an end later than the start and than now.');
    c.duration.set('week');
    c.start.set('custom');
    c.startAt.set('');
    c.submit();
    expect(c.shown('start')).toBe('Choose the start date and time.');
    expect(api.create).not.toHaveBeenCalled();
  });

  it('specific stages need at least one; areas and stages travel as chosen', () => {
    const { c } = make();
    fill(c);
    c.level.set('Editor');
    c.toggleArea('Documents', true);
    c.toggleArea('StagesAndTasks', true);
    c.scope.set('stages');
    c.submit();
    expect(c.shown('stages')).toBe('Choose at least one stage, or Whole project.');
    c.toggleStage('S2', true);
    c.submit();
    expect(api.create.mock.calls[0][1]).toMatchObject({
      level: 'Editor',
      areas: ['Overview', 'StagesAndTasks', 'Documents'],
      stageIds: ['S2'],
    });
  });

  it('the reason is at most 500 characters', () => {
    const { c } = make();
    fill(c);
    c.reason.set('x'.repeat(501));
    c.submit();
    expect(api.create).not.toHaveBeenCalled();
    c.reason.set('x'.repeat(500));
    c.submit();
    expect(api.create).toHaveBeenCalledTimes(1);
  });

  it('a capped granter cannot pick a level above their own', () => {
    const { c } = make({ maxLevel: 'Editor' });
    expect(c.levelOptions.map((o: RadioOption) => [o.value, !!o.disabled])).toEqual([
      ['Viewer', false],
      ['Editor', false],
      ['Manager', true],
    ]);
  });

  it('edit: no employee or start; prefilled; PUT with level, areas, stages, end and reason', () => {
    const grant: ProjectAccessGrant = {
      id: 'G1',
      projectId: 'P1',
      employeeId: 'E1',
      employeeName: 'Mona',
      level: 'Editor',
      areas: ['Documents'],
      stageIds: ['S1'],
      startsAtUtc: '2026-11-01T08:00:00Z',
      expiresAtUtc: '2026-12-01T08:00:00Z',
      reason: 'audit',
      grantedById: 'E9',
      grantedAtUtc: '2026-11-01T08:00:00Z',
      revokedAtUtc: null,
      revokedById: null,
      revokeReason: null,
      status: 'Active',
    };
    const { c, el } = make({ mode: 'edit', grant });
    expect(el.querySelector('[data-employee]')).toBeNull();
    expect(el.querySelector('[data-start]')).toBeNull();
    expect([c.level(), c.areas(), c.scope(), c.stageIds(), c.duration()]).toEqual([
      'Editor',
      ['Documents'],
      'stages',
      ['S1'],
      'custom',
    ]);
    c.duration.set('none');
    c.reason.set('extended');
    c.submit();
    expect(api.update).toHaveBeenCalledWith('P1', 'G1', {
      level: 'Editor',
      areas: ['Documents'],
      stageIds: ['S1'],
      expiresAtUtc: null,
      reason: 'extended',
    });
    // Unchanged custom end round-trips.
    api.update.mockClear();
    c.duration.set('custom');
    c.endAt.set(utcToLocalInput(grant.expiresAtUtc));
    c.submit();
    expect(api.update.mock.calls[0][2].expiresAtUtc).toBe('2026-12-01T08:00:00.000Z');
  });

  it.each([
    ['projects.access_grants.AlreadyGranted', 409, 'already has a current or upcoming grant'],
    ['projects.access_grants.AboveOwnLevel', 403, 'cannot grant a level above your own'],
    ['projects.access_grants.SelfGrant', 400, 'cannot grant access to yourself'],
    ['projects.access_grants.AlreadyMember', 409, 'already on the project'],
    ['projects.access_grants.InvalidWindow', 400, 'later than the start'],
    ['projects.access_grants.NotAllowed', 403, 'may not manage access grants'],
  ])('%s shows its catalog message and keeps the dialog open', (code, status, text) => {
    const { c, f, el } = make();
    fill(c);
    api.create.mockReturnValueOnce(
      throwError(() => new HttpErrorResponse({ status, error: { errors: { [code]: ['x'] } } })),
    );
    c.submit();
    f.detectChanges();
    expect(c.serverError()).toContain(text);
    expect(el.querySelector('[role="alert"]')?.textContent).toContain(text);
    expect(close).not.toHaveBeenCalled();
    expect(c.busy()).toBe(false);
  });

  it('a concurrent change closes the dialog for a reload, with the shared toast', () => {
    const { c } = make();
    fill(c);
    api.create.mockReturnValueOnce(
      throwError(
        () =>
          new HttpErrorResponse({
            status: 409,
            error: { errors: { 'projects.access_grants.ConcurrentUpdate': ['x'] } },
          }),
      ),
    );
    c.submit();
    expect(close).toHaveBeenCalledWith(true);
    expect(toasts).toHaveLength(1);
  });

  it('ignores a second submit while the first is in flight', () => {
    const { c } = make();
    fill(c);
    api.create.mockReturnValueOnce(new Observable(() => undefined));
    c.submit();
    c.submit();
    expect(api.create).toHaveBeenCalledTimes(1);
  });
});
