import { TestBed } from '@angular/core/testing';
import { of } from 'rxjs';
import { describe, expect, it, vi } from 'vitest';
import { ProjectService } from '@modules/projects';
import { PermissionsService } from '@platform/permissions/permissions.service';
import { SiteService } from '../data/site.service';
import { SiteListStore } from '../stores/site-list.store';
import { canCreateSurvey, siteCaps, type SiteProjectGate } from './site-capabilities';
import { SiteStatus } from './site-enums';

/**
 * crmp P1-B: a grantee's token holds no `sites.*` codes; the Sites area of an active, whole-project
 * grant implies them (dms GrantAreaPermissions.cs:47-50). A stage-limited grant never opens Sites
 * (ProjectAccessContext.Covers).
 */
type Area = 'Overview' | 'StagesAndTasks' | 'Documents' | 'Sites' | 'Crm' | 'Team';
const grantee = (
  level: 'Viewer' | 'Editor' | 'Manager',
  areas: Area[],
  stageIds: string[] = [],
): SiteProjectGate => ({
  myLevel: level,
  status: 'InProgress',
  isActive: true,
  myAccess: { source: 'Grant', level, areas, stageIds, expiresAtUtc: null },
});
const noToken = (): boolean => false;
const draft = { status: SiteStatus.Draft, createdById: 'X' };
const submitted = { status: SiteStatus.Submitted, createdById: 'X' };

describe('siteCaps / canCreateSurvey — grantees (crmp P1-B)', () => {
  it('an Editor grant on Sites edits, submits and creates without any token claim', () => {
    const g = grantee('Editor', ['Sites']);
    const c = siteCaps(draft, g, noToken, 'E');
    expect(c.edit).toBe(true);
    expect(c.submit).toBe(true);
    expect(c.del).toBe(false);
    expect(canCreateSurvey(g, noToken)).toBe(true);
  });

  it('a Manager grant on Sites decides and deletes', () => {
    const g = grantee('Manager', ['Sites']);
    expect(siteCaps(submitted, g, noToken, 'E').approve).toBe(true);
    expect(siteCaps(draft, g, noToken, 'E').del).toBe(true);
  });

  it('a Viewer grant reads only', () => {
    const g = grantee('Viewer', ['Sites']);
    const c = siteCaps(draft, g, () => true, 'E');
    expect(c.edit || c.submit || c.del).toBe(false);
    expect(canCreateSurvey(g, () => true)).toBe(false);
  });

  it('no Sites area, or a stage-limited grant, opens nothing — whatever the token says', () => {
    for (const g of [grantee('Manager', ['Documents']), grantee('Manager', ['Sites'], ['S1'])]) {
      const c = siteCaps(draft, g, () => true, 'E');
      expect(c.edit || c.submit || c.del || c.reopen).toBe(false);
      expect(canCreateSurvey(g, () => true)).toBe(false);
    }
  });

  it('members keep the token check', () => {
    const member: SiteProjectGate = {
      myLevel: 'Editor',
      status: 'InProgress',
      isActive: true,
      myAccess: { source: 'Member', level: 'Editor', areas: [], stageIds: [], expiresAtUtc: null },
    };
    expect(siteCaps(draft, member, noToken, 'E').edit).toBe(false);
    expect(siteCaps(draft, member, (p) => p === 'sites.update', 'E').edit).toBe(true);
  });
});

describe('SiteListStore — grantees (crmp P1-B)', () => {
  it('lists members and Sites grantees; drops grants without Sites or limited to stages', () => {
    const row = (id: string, myAccess: unknown) => ({
      id,
      code: id,
      name: id,
      myLevel: 'Editor',
      status: 'InProgress',
      isActive: true,
      myAccess,
    });
    const getAll = vi.fn(() =>
      of({
        items: [
          row('M', { source: 'Member', level: 'Editor', areas: [], stageIds: [] }),
          row('L', null),
          row('S', { source: 'Grant', level: 'Editor', areas: ['Sites'], stageIds: [] }),
          row('D', { source: 'Grant', level: 'Editor', areas: ['Documents'], stageIds: [] }),
          row('X', { source: 'Grant', level: 'Editor', areas: ['Sites'], stageIds: ['S1'] }),
        ],
        totalPages: 1,
        totalCount: 5,
        page: 1,
        pageSize: 200,
      }),
    );
    TestBed.configureTestingModule({
      providers: [
        SiteListStore,
        { provide: ProjectService, useValue: { getAll } },
        { provide: SiteService, useValue: { list: () => of({ items: [], totalCount: 0 }) } },
        { provide: PermissionsService, useValue: { can: () => false } },
      ],
    });
    const store = TestBed.inject(SiteListStore);
    store.loadProjects(null);
    expect(store.projects().map((p) => p.id)).toEqual(['M', 'L', 'S']);
    // The grantee creates on S without sites.create in the token.
    expect(store.creatableProjects().map((p) => p.id)).toEqual(['S']);
  });
});
