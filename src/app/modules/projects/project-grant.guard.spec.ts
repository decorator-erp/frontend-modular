import { TestBed } from '@angular/core/testing';
import {
  ActivatedRouteSnapshot,
  Router,
  RouterStateSnapshot,
  UrlTree,
  convertToParamMap,
  provideRouter,
} from '@angular/router';
import { Observable, firstValueFrom, isObservable, of, throwError } from 'rxjs';
import { describe, expect, it, vi } from 'vitest';
import { AuthStore } from '@platform/auth/auth.store';
import { ProjectService } from './data/project.service';
import { ProjectAccessGrantService } from './data/project-access-grant.service';
import type { MyAccessGrant, ProjectAccess } from './model/access-grant.model';
import { ProjectGrantGuard } from './project-grant.guard';

/**
 * crmp P1-B: a grantee's token lacks the implied route codes, so the grant-aware routes admit the
 * token claim OR the grant (the project's myAccess, or — with no project in the URL — the caller's
 * own grants). The backend still scopes every request.
 */
describe('ProjectGrantGuard (crmp P1-B)', () => {
  async function run(
    data: Record<string, unknown>,
    params: Record<string, string>,
    opts: {
      token?: string[];
      myAccess?: ProjectAccess | null;
      projectFails?: boolean;
      mine?: Partial<MyAccessGrant>[];
    } = {},
  ): Promise<boolean | string> {
    const getById = vi.fn(() =>
      opts.projectFails
        ? throwError(() => new Error('404'))
        : of({ id: 'P1', myAccess: opts.myAccess ?? null }),
    );
    TestBed.configureTestingModule({
      providers: [
        provideRouter([]),
        { provide: AuthStore, useValue: { can: (p: string) => (opts.token ?? []).includes(p) } },
        { provide: ProjectService, useValue: { getById } },
        {
          provide: ProjectAccessGrantService,
          useValue: { mine: () => of((opts.mine ?? []) as MyAccessGrant[]) },
        },
      ],
    });
    const route = {
      data,
      paramMap: convertToParamMap(params),
    } as unknown as ActivatedRouteSnapshot;
    const out = TestBed.runInInjectionContext(() =>
      ProjectGrantGuard(route, {} as RouterStateSnapshot),
    );
    const router = TestBed.inject(Router);
    const settle = async (v: unknown): Promise<boolean | string> =>
      v instanceof UrlTree ? router.serializeUrl(v) : (v as boolean);
    return settle(await (isObservable(out) ? firstValueFrom(out as Observable<unknown>) : out));
  }

  const grant = (
    areas: ProjectAccess['areas'],
    stageIds: string[] = [],
    level: ProjectAccess['level'] = 'Viewer',
  ): ProjectAccess => ({
    source: 'Grant',
    level,
    areas,
    stageIds,
    expiresAtUtc: null,
  });
  const stagePage = { permission: 'project.read', grantArea: 'StagesAndTasks' };

  it('the token claim passes without reading anything', async () => {
    expect(
      await run(stagePage, { projectId: 'P1', stageId: 'S1' }, { token: ['project.read'] }),
    ).toBe(true);
  });

  it('a grant covering the stage passes; another stage, another area or no grant → /403', async () => {
    expect(
      await run(
        stagePage,
        { projectId: 'P1', stageId: 'S1' },
        { myAccess: grant(['StagesAndTasks'], ['S1']) },
      ),
    ).toBe(true);
    TestBed.resetTestingModule();
    expect(
      await run(
        stagePage,
        { projectId: 'P1', stageId: 'S2' },
        { myAccess: grant(['StagesAndTasks'], ['S1']) },
      ),
    ).toBe('/403');
    TestBed.resetTestingModule();
    expect(
      await run(stagePage, { projectId: 'P1', stageId: 'S1' }, { myAccess: grant(['Documents']) }),
    ).toBe('/403');
    TestBed.resetTestingModule();
    expect(await run(stagePage, { projectId: 'P1', stageId: 'S1' }, { myAccess: null })).toBe(
      '/403',
    );
    TestBed.resetTestingModule();
    expect(await run(stagePage, { projectId: 'P1', stageId: 'S1' }, { projectFails: true })).toBe(
      '/403',
    );
  });

  it('a list route (grantList) admits a stage-limited grant on its area', async () => {
    const tasks = { permission: 'stage_tasks.read', grantArea: 'StagesAndTasks', grantList: true };
    expect(await run(tasks, { id: 'P1' }, { myAccess: grant(['StagesAndTasks'], ['S1']) })).toBe(
      true,
    );
  });

  it('the implied code must match the level', async () => {
    const scope = { permission: 'scope.read', grantArea: 'Overview' };
    expect(await run(scope, { id: 'P1' }, { myAccess: grant(['Overview']) })).toBe(true);
    TestBed.resetTestingModule();
    const manage = { permission: 'stages.manage', grantArea: 'StagesAndTasks' };
    expect(
      await run(manage, { id: 'P1' }, { myAccess: grant(['StagesAndTasks'], [], 'Manager') }),
    ).toBe('/403');
  });

  it('no project in the URL: any active whole-project grant on the area passes', async () => {
    const sites = { permission: 'sites.read', grantArea: 'Sites' };
    const g = {
      areas: ['Sites'],
      stageIds: [],
      level: 'Viewer',
      status: 'Active',
    } as Partial<MyAccessGrant>;
    expect(await run(sites, {}, { mine: [g] })).toBe(true);
    TestBed.resetTestingModule();
    expect(await run(sites, {}, { mine: [{ ...g, stageIds: ['S1'] }] })).toBe('/403');
    TestBed.resetTestingModule();
    expect(await run(sites, {}, { mine: [{ ...g, status: 'Upcoming' }] })).toBe('/403');
    TestBed.resetTestingModule();
    expect(await run(sites, {}, { mine: [] })).toBe('/403');
  });

  it('a route without grantArea keeps the plain permission check', async () => {
    expect(
      await run({ permission: 'stages.read' }, { id: 'P1' }, { myAccess: grant(['Team']) }),
    ).toBe('/403');
  });
});
