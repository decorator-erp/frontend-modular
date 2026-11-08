import { NO_ERRORS_SCHEMA, signal } from '@angular/core';
import { TestBed } from '@angular/core/testing';
import { ActivatedRoute, Router, convertToParamMap } from '@angular/router';
import { of } from 'rxjs';
import { describe, expect, it } from 'vitest';
import { ModalService, PeraEntityHeaderCardComponent } from '@ds';
import { EmployeeService } from '@modules/people';
import { ToastService } from '@platform/feedback/toast.service';
import { LocaleService } from '@platform/i18n';
import { CanDirective, PermissionsService } from '@platform/permissions';
import { ProjectDetailComponent } from './project-detail.component';
import { ProjectService } from '../../data/project.service';
import { ProjectMemberService } from '../../data/project-member.service';
import { StageTeamsService } from '../../data/stage-teams.service';
import { ProjectDocumentsService } from '../../data/documents.service';
import { ScopeOfWorkService } from '../../data/scope-of-work.service';
import { ProjectGrantBannerComponent } from '../shared/project-grant-banner.component';
import type { ProjectAccess } from '../../model/access-grant.model';
import type { ProjectDetails, ProjectStage } from '../../model/project.model';

/**
 * crmp P1-B: a project opened through a grant shows the temporary-access banner and only the links,
 * panels and stages the grant covers. The grantee's token holds no project codes at all.
 */
describe('ProjectDetailComponent — grantees (crmp P1-B)', () => {
  const stage = (id: string, order: number): ProjectStage =>
    ({
      id,
      name: order === 1 ? 'Alpha' : 'Beta',
      order,
      status: 'Active',
      tasks: [],
      progressPercent: 0,
    }) as unknown as ProjectStage;

  function render(myAccess: ProjectAccess | null, token: string[] = []) {
    const details = {
      myLevel: myAccess?.level ?? 'Manager',
      myAccess,
      project: {
        id: 'p1',
        code: 'MT',
        name: 'Marina',
        status: 'InProgress',
        workflowType: 'Stage',
        isActive: true,
        myLevel: myAccess?.level ?? 'Manager',
        myAccess,
      },
      stages: [stage('S1', 1), stage('S2', 2)],
      unstagedTasks: [],
      taskCounts: [],
      gates: { total: 0, pending: 0, satisfied: 0, rejected: 0 },
    } as unknown as ProjectDetails;
    const docs = { calls: 0 };
    TestBed.configureTestingModule({
      imports: [ProjectDetailComponent],
      providers: [
        { provide: ProjectService, useValue: { getDetails: () => of(details) } },
        { provide: ProjectMemberService, useValue: { getByProject: () => of([]) } },
        {
          provide: EmployeeService,
          useValue: { listPaged: () => of({ items: [] }), getMe: () => of({ id: 'E1' }) },
        },
        { provide: ScopeOfWorkService, useValue: { getScope: () => of(null) } },
        { provide: StageTeamsService, useValue: { getByProject: () => of([]) } },
        {
          provide: ProjectDocumentsService,
          useValue: {
            getByProject: () => {
              docs.calls++;
              return of([]);
            },
          },
        },
        {
          provide: ModalService,
          useValue: { open: () => ({ afterClosed: () => Promise.resolve() }) },
        },
        { provide: ToastService, useValue: { show: () => undefined } },
        { provide: LocaleService, useValue: { locale: signal<'en' | 'ar'>('en') } },
        { provide: PermissionsService, useValue: { can: (k: string) => token.includes(k) } },
        {
          provide: ActivatedRoute,
          useValue: { snapshot: { paramMap: convertToParamMap({ id: 'p1' }) } },
        },
        { provide: Router, useValue: { navigate: () => undefined } },
      ],
    });
    TestBed.overrideComponent(ProjectDetailComponent, {
      set: {
        imports: [CanDirective, PeraEntityHeaderCardComponent, ProjectGrantBannerComponent],
        schemas: [NO_ERRORS_SCHEMA],
      },
    });
    const f = TestBed.createComponent(ProjectDetailComponent);
    f.detectChanges();
    f.detectChanges();
    return { el: f.nativeElement as HTMLElement, cmp: f.componentInstance, docs };
  }

  const g = (
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

  it('shows the banner and only the granted links: Documents + Sites, no tasks/members/CRM', () => {
    const { el, docs } = render(g(['Overview', 'Documents', 'Sites']));
    expect(el.querySelector('[data-grant-banner]')?.textContent).toContain('Temporary access');
    expect(el.textContent).toContain('Documents');
    expect(el.querySelector('[data-sites-link]')).not.toBeNull();
    expect(el.querySelector('[data-tasks-link]')).toBeNull();
    expect(el.querySelector('[data-members-link]')).toBeNull();
    expect(el.textContent).not.toContain('Stages & tasks');
    expect(el.textContent).not.toContain('Requirement');
    // A Viewer grant on Documents reads, but the recent-documents panel is the upload claim.
    expect(docs.calls).toBe(0);
  });

  it('Stages & tasks panel: shown for the area; a stage-limited grant lists only its stages', () => {
    const { el, cmp } = render(g(['Overview', 'StagesAndTasks'], ['S2']));
    expect(el.textContent).toContain('Stages & tasks');
    expect(el.querySelector('[data-tasks-link]')).not.toBeNull();
    expect(cmp.visibleStages().map((s) => s.id)).toEqual(['S2']);
    expect(el.textContent).toContain('Beta');
    // A stage-limited grant has no project-level Documents or Sites.
    expect(el.querySelector('[data-sites-link]')).toBeNull();
  });

  it('an Editor grant on Documents sees the recent-documents panel without any token claim', () => {
    const { docs } = render(g(['Documents'], [], 'Editor'));
    expect(docs.calls).toBe(1);
  });

  it('a Manager grant never sees the project lifecycle or member writes', () => {
    const { el } = render(
      g(['Overview', 'StagesAndTasks', 'Documents', 'Sites', 'Crm', 'Team'], [], 'Manager'),
      ['project.change_status', 'project.delete', 'project.update', 'stage_teams.manage'],
    );
    expect(el.querySelector('[data-change-status]')).toBeNull();
    expect(el.querySelector('[data-delete-project]')).toBeNull();
    expect(el.textContent).not.toContain('Manage');
    expect(el.querySelector('[data-members-link]')).not.toBeNull();
  });

  it('the Access tab: project.manage_access, or a Manager by membership — never a grantee or read_all alone', () => {
    const member = (level: ProjectAccess['level']): ProjectAccess => ({
      source: 'Member',
      level,
      areas: [],
      stageIds: [],
      expiresAtUtc: null,
    });
    const cases: [ProjectAccess | null, string[], boolean][] = [
      [member('Manager'), [], true],
      [member('Editor'), [], false],
      [member('Editor'), ['project.manage_access'], true],
      [{ ...member('Manager'), source: 'ReadAll' }, ['project.read_all'], false],
      [{ ...member('Manager'), source: 'ReadAll' }, ['project.manage_access'], true],
      [g(['Overview', 'Team'], [], 'Manager'), [], false],
      [null, ['project.read'], false],
    ];
    for (const [access, token, shown] of cases) {
      TestBed.resetTestingModule();
      const { el } = render(access, token);
      expect(!!el.querySelector('[data-access-link]'), `${access?.source} ${token}`).toBe(shown);
    }
  });

  it('members keep the token gating and see no banner', () => {
    const { el } = render(
      { source: 'Member', level: 'Manager', areas: [], stageIds: [], expiresAtUtc: null },
      ['project.read', 'sites.read'],
    );
    expect(el.querySelector('[data-grant-banner]')).toBeNull();
    expect(el.querySelector('[data-sites-link]')).not.toBeNull();
    expect(el.querySelector('[data-tasks-link]')).not.toBeNull();
    expect(el.textContent).toContain('Stages & tasks');
  });
});
