import { describe, expect, it } from 'vitest';
import type { ProjectLevel } from '@modules/projects';
import { canCreateSurvey, siteCaps } from './site-capabilities';

// sites S-1 (U3–U5): claim × level × status × closed × self.
const ALL = [
  'sites.create',
  'sites.update',
  'sites.submit',
  'sites.approve',
  'sites.delete',
] as const;
const levels: ProjectLevel[] = ['Viewer', 'Editor', 'Manager'];
const statuses = [1, 2, 3, 4];

function project(level: ProjectLevel, closed: boolean) {
  return {
    myLevel: level,
    status: closed ? ('OnHold' as const) : ('InProgress' as const),
    isActive: true,
  };
}

/** The expected answer, written independently of the implementation. */
function expected(
  perms: Set<string>,
  level: ProjectLevel,
  status: number,
  closed: boolean,
  self: boolean,
) {
  const rank = { Viewer: 1, Editor: 2, Manager: 3 }[level];
  const editable = status === 1 || status === 4;
  const decide = perms.has('sites.approve') && rank >= 3 && status === 2;
  const selfBlocked = self && !perms.has('project.read_all');
  return {
    closed,
    edit: perms.has('sites.update') && rank >= 2 && editable && !closed,
    submit: perms.has('sites.submit') && rank >= 2 && status === 1 && !closed,
    decide,
    approve: decide && !selfBlocked,
    selfApproval: decide && selfBlocked,
    reopen: perms.has('sites.update') && rank >= 3 && status === 4 && !closed,
    del: perms.has('sites.delete') && rank >= 3 && editable && !closed,
  };
}

describe('siteCaps (sites S-1)', () => {
  const claimSets: string[][] = [
    [...ALL],
    [...ALL, 'project.read_all'],
    ...ALL.map((p) => ALL.filter((x) => x !== p)),
    [],
  ];
  const cases: [string[], ProjectLevel, number, boolean, boolean][] = [];
  for (const c of claimSets)
    for (const l of levels)
      for (const s of statuses)
        for (const closed of [false, true])
          for (const self of [false, true]) cases.push([c, l, s, closed, self]);

  it(`answers every combination (${cases.length})`, () => {
    for (const [claims, level, status, closed, self] of cases) {
      const perms = new Set(claims);
      const got = siteCaps(
        { status, createdById: self ? 'E-me' : 'E-other' },
        project(level, closed),
        (p) => perms.has(p),
        'E-me',
      );
      expect(got, JSON.stringify({ claims, level, status, closed, self })).toEqual(
        expected(perms, level, status, closed, self),
      );
    }
  });

  it('a Submitted survey on a closed project can still be decided (U4)', () => {
    const c = siteCaps({ status: 2, createdById: 'X' }, project('Manager', true), () => true, 'E');
    expect(c.closed).toBe(true);
    expect(c.decide).toBe(true);
    expect(c.approve).toBe(true);
  });

  it('the creator sees Reject but not Approve (U5)', () => {
    const can = (p: string) => p !== 'project.read_all';
    const c = siteCaps({ status: 2, createdById: 'E' }, project('Manager', false), can, 'E');
    expect(c.decide).toBe(true);
    expect(c.approve).toBe(false);
    expect(c.selfApproval).toBe(true);
  });

  it('an unknown caller id (no employee) hides nothing by self-approval', () => {
    const c = siteCaps(
      { status: 2, createdById: 'E' },
      project('Manager', false),
      () => true,
      null,
    );
    expect(c.approve).toBe(true);
  });

  it('inactive and Completed/Cancelled projects are closed', () => {
    const can = () => true;
    const s = { status: 1, createdById: 'X' };
    expect(
      siteCaps(s, { myLevel: 'Manager', status: 'InProgress', isActive: false }, can, 'E').closed,
    ).toBe(true);
    expect(
      siteCaps(s, { myLevel: 'Manager', status: 'Completed', isActive: true }, can, 'E').edit,
    ).toBe(false);
    expect(
      siteCaps(s, { myLevel: 'Manager', status: 'Cancelled', isActive: true }, can, 'E').del,
    ).toBe(false);
    expect(
      siteCaps(s, { myLevel: 'Manager', status: 'Draft', isActive: true }, can, 'E').edit,
    ).toBe(true);
  });

  it('nothing is allowed before the project is loaded', () => {
    expect(siteCaps({ status: 1, createdById: 'X' }, null, () => true, 'E')).toEqual({
      closed: false,
      edit: false,
      submit: false,
      decide: false,
      approve: false,
      selfApproval: false,
      reopen: false,
      del: false,
    });
  });
});

describe('canCreateSurvey (sites S-2)', () => {
  it.each([
    [['sites.create'], 'Editor', false, true],
    [['sites.create'], 'Manager', false, true],
    [['sites.create'], 'Viewer', false, false],
    [['sites.create'], 'Editor', true, false],
    [[], 'Manager', false, false],
  ] as const)('%j at %s, closed=%s → %s', (claims, level, closed, ok) => {
    const perms = new Set<string>(claims);
    expect(canCreateSurvey(project(level, closed), (p) => perms.has(p))).toBe(ok);
  });

  it('no project → false', () => {
    expect(canCreateSurvey(null, () => true)).toBe(false);
  });
});
