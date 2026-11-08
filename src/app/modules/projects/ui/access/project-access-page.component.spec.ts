import { signal } from '@angular/core';
import { TestBed } from '@angular/core/testing';
import { HttpErrorResponse } from '@angular/common/http';
import { ActivatedRoute, convertToParamMap, provideRouter } from '@angular/router';
import { Observable, of, throwError } from 'rxjs';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { ConfirmService, ModalService } from '@ds';
import { EmployeeService } from '@modules/people';
import { ToastService } from '@platform/feedback/toast.service';
import { LocaleService } from '@platform/i18n';
import { PermissionsService } from '@platform/permissions';
import { ProjectService } from '../../data/project.service';
import { ProjectAccessGrantService } from '../../data/project-access-grant.service';
import { ProjectAccessStore } from '../../stores/project-access.store';
import type { ProjectAccess, ProjectAccessGrant } from '../../model/access-grant.model';
import type { ProjectDetails } from '../../model/project.model';
import { ProjectAccessPageComponent } from './project-access-page.component';
import { GrantFormDialogComponent, GrantFormDialogData } from './grant-form-dialog.component';

/** crmp P1-B: the project's Access tab. */
describe('ProjectAccessPageComponent (crmp P1-B)', () => {
  const grant = (o: Partial<ProjectAccessGrant>): ProjectAccessGrant => ({
    id: 'G1',
    projectId: 'P1',
    employeeId: 'E1',
    employeeName: 'Mona Adel',
    level: 'Editor',
    areas: ['StagesAndTasks', 'Documents'],
    stageIds: ['S1'],
    startsAtUtc: '2026-11-01T08:00:00Z',
    expiresAtUtc: '2026-12-01T08:00:00Z',
    reason: 'Q3 audit',
    grantedById: 'E9',
    grantedAtUtc: '2026-11-01T08:00:00Z',
    revokedAtUtc: null,
    revokedById: null,
    revokeReason: null,
    status: 'Active',
    ...o,
  });

  let list: ProjectAccessGrant[];
  let api: {
    list: ReturnType<typeof vi.fn>;
    revoke: ReturnType<typeof vi.fn>;
  };
  let confirm: { openWithReason: ReturnType<typeof vi.fn> };
  let modal: { open: ReturnType<typeof vi.fn> };
  let toasts: { tone: string; message: string }[];
  let token: string[];
  let myAccess: ProjectAccess | null;
  let detailsErr: number | null;

  beforeEach(() => {
    list = [
      grant({}),
      grant({
        id: 'G2',
        employeeId: 'E2',
        employeeName: null,
        status: 'Upcoming',
        stageIds: [],
        expiresAtUtc: null,
      }),
      grant({
        id: 'G3',
        employeeName: 'Old Timer',
        status: 'Revoked',
        revokedAtUtc: '2026-11-05T08:00:00Z',
        revokedById: 'E9',
        revokeReason: 'left',
      }),
      grant({ id: 'G4', employeeName: 'Done', status: 'Expired' }),
    ];
    api = {
      list: vi.fn(() => of([...list])),
      revoke: vi.fn((): Observable<unknown> => of(null)),
    };
    confirm = { openWithReason: vi.fn(async () => ({ confirmed: true, reason: 'audit over' })) };
    modal = { open: vi.fn(() => ({ afterClosed: () => Promise.resolve(true) })) };
    toasts = [];
    token = [];
    myAccess = { source: 'Member', level: 'Manager', areas: [], stageIds: [], expiresAtUtc: null };
    detailsErr = null;
  });

  async function render() {
    const details = {
      myLevel: myAccess?.level ?? 'Viewer',
      myAccess,
      project: { id: 'P1', name: 'Marina', status: 'InProgress', isActive: true, myAccess },
      stages: [{ id: 'S1', name: 'Design' }],
      unstagedTasks: [],
      taskCounts: [],
      gates: {},
    } as unknown as ProjectDetails;
    TestBed.configureTestingModule({
      imports: [ProjectAccessPageComponent],
      providers: [
        provideRouter([]),
        {
          provide: ProjectService,
          useValue: {
            getDetails: () =>
              detailsErr
                ? throwError(() => new HttpErrorResponse({ status: detailsErr! }))
                : of(details),
          },
        },
        { provide: ProjectAccessGrantService, useValue: api },
        {
          provide: EmployeeService,
          useValue: {
            listPaged: () =>
              of({
                items: [
                  { id: 'E9', fullName: 'Sara Boss' },
                  { id: 'E2', fullName: 'Omar Two' },
                ],
              }),
          },
        },
        { provide: ConfirmService, useValue: confirm },
        { provide: ModalService, useValue: modal },
        {
          provide: ToastService,
          useValue: { show: (t: { tone: string; message: string }) => toasts.push(t) },
        },
        { provide: LocaleService, useValue: { locale: signal<'en' | 'ar'>('en') } },
        { provide: PermissionsService, useValue: { can: (p: string) => token.includes(p) } },
        { provide: ProjectAccessStore, useValue: { seed: () => undefined } },
        {
          provide: ActivatedRoute,
          useValue: { snapshot: { paramMap: convertToParamMap({ id: 'P1' }) } },
        },
      ],
    });
    const f = TestBed.createComponent(ProjectAccessPageComponent);
    f.detectChanges();
    await f.whenStable();
    f.detectChanges();
    return f;
  }

  const rows = (el: HTMLElement) => [...el.querySelectorAll<HTMLElement>('[data-grant-row]')];

  it('lists active and upcoming grants by default, all on demand, with every column', async () => {
    const f = await render();
    const el = f.nativeElement as HTMLElement;
    expect(api.list).toHaveBeenCalledWith('P1');
    expect(rows(el).map((r) => r.dataset['status'])).toEqual(['Active', 'Upcoming']);
    const first = rows(el)[0].textContent ?? '';
    expect(first).toContain('Mona Adel');
    expect(first).toContain('Read + write');
    expect(first).toContain('Stages & tasks');
    expect(first).toContain('Documents');
    expect(first).toContain('Design');
    expect(first).toContain('Ends');
    expect(first).toContain('Q3 audit');
    expect(first).toContain('Granted by Sara Boss');
    expect(first).toContain('Active');
    const second = rows(el)[1].textContent ?? '';
    expect(second).toContain('Omar Two');
    expect(second).toContain('Whole project');
    expect(second).toContain('No end');
    expect(second).toContain('Starts');

    f.componentInstance.filter.set('all');
    f.detectChanges();
    expect(rows(el)).toHaveLength(4);
    const revoked = rows(el)[2];
    expect(revoked.querySelector('[data-revoked-by]')?.textContent).toContain(
      'Revoked by Sara Boss',
    );
    expect(revoked.querySelector('[data-revoked-by]')?.textContent).toContain('left');
    expect(revoked.querySelector('[data-revoke]')).toBeNull();
    expect(rows(el)[3].querySelector('[data-edit]')).toBeNull();
  });

  it('revoke: confirm with an optional reason, POST, success toast, list re-read', async () => {
    const f = await render();
    const el = f.nativeElement as HTMLElement;
    list = list.map((g) => (g.id === 'G1' ? { ...g, status: 'Revoked' as const } : g));
    await f.componentInstance.revoke(f.componentInstance.visible()[0]);
    expect(confirm.openWithReason).toHaveBeenCalledWith(
      expect.objectContaining({
        tone: 'danger',
        reason: expect.objectContaining({ maxLength: 500 }),
      }),
    );
    expect(api.revoke).toHaveBeenCalledWith('P1', 'G1', 'audit over');
    expect(toasts).toEqual([
      { tone: 'success', message: 'Access revoked — it stops on their next action' },
    ]);
    expect(api.list).toHaveBeenCalledTimes(2);
    f.detectChanges();
    expect(rows(el).map((r) => r.dataset['status'])).toEqual(['Upcoming']);
  });

  it('revoke: a dismissed confirm sends nothing; an error shows its catalog message', async () => {
    const f = await render();
    confirm.openWithReason.mockResolvedValueOnce({ confirmed: false, reason: '' });
    await f.componentInstance.revoke(list[0]);
    expect(api.revoke).not.toHaveBeenCalled();

    api.revoke.mockReturnValueOnce(
      throwError(
        () =>
          new HttpErrorResponse({
            status: 409,
            error: { errors: { 'projects.access_grants.AlreadyRevoked': ['x'] } },
          }),
      ),
    );
    await f.componentInstance.revoke(list[0]);
    f.detectChanges();
    expect(
      (f.nativeElement as HTMLElement).querySelector('[data-inline-error]')?.textContent,
    ).toContain('This grant is already revoked.');
    expect(toasts).toEqual([]);
  });

  it('Grant access and Edit open the dialog with the right data, then toast and re-read', async () => {
    const f = await render();
    await f.componentInstance.openCreate();
    const [cmp, cfg] = modal.open.mock.calls[0] as [unknown, { data: GrantFormDialogData }];
    expect(cmp).toBe(GrantFormDialogComponent);
    expect(cfg.data).toMatchObject({
      mode: 'create',
      projectId: 'P1',
      projectName: 'Marina',
      stages: [{ id: 'S1', name: 'Design' }],
      maxLevel: 'Manager',
      excludeEmployeeIds: ['E1', 'E2'],
    });
    expect(toasts.at(-1)?.message).toBe('Access granted');

    await f.componentInstance.openEdit(list[0]);
    const [, edit] = modal.open.mock.calls[1] as [unknown, { data: GrantFormDialogData }];
    expect(edit.data).toMatchObject({ mode: 'edit', grant: { id: 'G1' } });
    expect(toasts.at(-1)?.message).toBe('Access updated');
    expect(api.list).toHaveBeenCalledTimes(3);
  });

  it('a grantee, a member Editor and read_all alone cannot manage; manage_access can', async () => {
    for (const a of [
      { source: 'Grant', level: 'Manager', areas: ['Team'], stageIds: [], expiresAtUtc: null },
      { source: 'Member', level: 'Editor', areas: [], stageIds: [], expiresAtUtc: null },
      { source: 'ReadAll', level: 'Manager', areas: [], stageIds: [], expiresAtUtc: null },
    ] as ProjectAccess[]) {
      TestBed.resetTestingModule();
      myAccess = a;
      const el = (await render()).nativeElement as HTMLElement;
      expect(el.querySelector('[data-not-allowed]'), a.source).not.toBeNull();
    }
    expect(api.list).not.toHaveBeenCalled();
    TestBed.resetTestingModule();
    myAccess = { source: 'ReadAll', level: 'Manager', areas: [], stageIds: [], expiresAtUtc: null };
    token = ['project.manage_access'];
    const el = (await render()).nativeElement as HTMLElement;
    expect(el.querySelector('[data-grant-access]')).not.toBeNull();
  });

  it('404 → not found; 403 from the list → not allowed; empty list → empty state', async () => {
    detailsErr = 404;
    expect(
      ((await render()).nativeElement as HTMLElement).querySelector('[data-not-found]'),
    ).not.toBeNull();
    TestBed.resetTestingModule();
    detailsErr = null;
    api.list.mockReturnValueOnce(throwError(() => new HttpErrorResponse({ status: 403 })));
    expect(
      ((await render()).nativeElement as HTMLElement).querySelector('[data-not-allowed]'),
    ).not.toBeNull();
    TestBed.resetTestingModule();
    list = [];
    expect(
      ((await render()).nativeElement as HTMLElement).querySelector('[data-empty]'),
    ).not.toBeNull();
  });

  it('guards against a second revoke while one is in flight', async () => {
    const f = await render();
    api.revoke.mockReturnValueOnce(new Observable(() => undefined));
    await f.componentInstance.revoke(list[0]);
    await f.componentInstance.revoke(list[0]);
    expect(api.revoke).toHaveBeenCalledTimes(1);
    expect(f.componentInstance.busy()).toBe(true);
  });
});
