import { TestBed } from '@angular/core/testing';
import { HttpErrorResponse } from '@angular/common/http';
import { of, throwError } from 'rxjs';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { ClientService } from '@modules/clients';
import { ProjectService, ScopeOfWorkService, ScopeOfWorkStatus } from '@modules/projects';
import { CrmLeadService } from '../data/crm-lead.service';
import { CrmSiteSurveyService } from '../data/crm-site-survey.service';
import { EMPTY_SITE_DATA, type ConvertPlan } from '../model/lead-convert.model';
import { LeadConvertRunner } from './lead-convert.runner';

const header = {
  durationDays: 120,
  plannedStartDate: '2027-01-10',
  adjustmentAmount: 0,
  adjustmentNote: null,
  notes: null,
};

function plan(overrides: Partial<ConvertPlan> = {}): ConvertPlan {
  return {
    leadId: 'L1',
    client: {
      mode: 'new',
      request: {
        firstName: 'Mona',
        lastName: 'Adel',
        email: 'mona@example.com',
        password: 'Pw!12345678abcd',
        phone: '0100',
        address: 'Zamalek, Cairo',
      },
    },
    project: {
      code: 'MON-1',
      name: 'Mona villa',
      address: 'New Cairo',
      description: null,
      estimatedStartDate: '2027-01-10',
    },
    scope: {
      header,
      items: [
        {
          sourceStageId: 'TS1',
          sourceTemplateName: 'T',
          name: 'Design',
          description: 'd',
          fee: 5000,
        },
        {
          sourceStageId: 'TS2',
          sourceTemplateName: 'T',
          name: 'Fit-out',
          description: null,
          fee: 18000,
        },
      ],
    },
    site: { ...EMPTY_SITE_DATA, address: 'New Cairo', areaSqm: 240 },
    ...overrides,
  };
}

/** A server item as `addItems` returns it: the template stage's own name and fee. */
const serverItem = (
  id: string,
  sourceStageId: string,
  name: string,
  fee: number,
  order: number,
) => ({
  id,
  sourceStageId,
  sourceTemplateName: 'T',
  name,
  description: sourceStageId === 'TS1' ? 'd' : null,
  order,
  fee,
  createdStageId: null,
  sourceMissing: false,
});

const emptyScope = (status = ScopeOfWorkStatus.Draft, items: unknown[] = []) => ({
  id: null,
  projectId: 'P1',
  status,
  items,
});

function setup() {
  const calls: string[] = [];
  const track =
    <T>(name: string, value: () => T) =>
    (...args: unknown[]) => {
      calls.push(name);
      void args;
      return value();
    };
  const clients = { create: vi.fn(track('client.create', () => of('C1'))) };
  const projects = { create: vi.fn(track('project.create', () => of('P1'))) };
  const scope = {
    getScope: vi.fn(track('scope.get', () => of(emptyScope()))),
    updateHeader: vi.fn(track('scope.header', () => of(undefined))),
    addItems: vi.fn(
      track('scope.addItems', () =>
        of([
          serverItem('I1', 'TS1', 'Design', 5000, 1),
          serverItem('I2', 'TS2', 'Fit-out', 20000, 2),
        ]),
      ),
    ),
    updateItem: vi.fn(track('scope.updateItem', () => of(undefined))),
    removeItem: vi.fn(track('scope.removeItem', () => of(undefined))),
    reorder: vi.fn(track('scope.reorder', () => of(undefined))),
    confirm: vi.fn(track('scope.confirm', () => of({ createdStageIds: ['S1', 'S2'] }))),
  };
  const sites = { createDraft: vi.fn(track('site.create', () => of('SITE1'))) };
  const leads = { convert: vi.fn(track('lead.convert', () => of('C1'))) };
  TestBed.configureTestingModule({
    providers: [
      LeadConvertRunner,
      { provide: ClientService, useValue: clients },
      { provide: ProjectService, useValue: projects },
      { provide: ScopeOfWorkService, useValue: scope },
      { provide: CrmSiteSurveyService, useValue: sites },
      { provide: CrmLeadService, useValue: leads },
    ],
  });
  return {
    runner: TestBed.inject(LeadConvertRunner),
    calls,
    clients,
    projects,
    scope,
    sites,
    leads,
  };
}

const fail = (status: number, code: string) =>
  throwError(
    () =>
      new HttpErrorResponse({
        status,
        error: { status, title: code, detail: code, errors: { [code]: [code] } },
      }),
  );

describe('LeadConvertRunner (LC-1)', () => {
  beforeEach(() => sessionStorage.clear());
  afterEach(() => sessionStorage.clear());

  it('creates the client, the project, the confirmed scope and the site, then converts the lead last', async () => {
    const { runner, calls, clients, projects, scope, sites, leads } = setup();

    const projectId = await runner.run(plan());

    expect(projectId).toBe('P1');
    expect(calls).toEqual([
      'client.create',
      'project.create',
      'scope.get',
      'scope.header',
      'scope.addItems',
      'scope.updateItem',
      'scope.confirm',
      'site.create',
      'lead.convert',
    ]);
    expect(clients.create).toHaveBeenCalledWith(
      expect.objectContaining({ email: 'mona@example.com' }),
    );
    expect(projects.create).toHaveBeenCalledWith({
      code: 'MON-1',
      name: 'Mona villa',
      address: 'New Cairo',
      clientId: 'C1',
      workflowType: 'Stage',
      description: null,
      estimatedStartDate: '2027-01-10',
    });
    expect(scope.updateHeader).toHaveBeenCalledWith('P1', header);
    expect(scope.addItems).toHaveBeenCalledWith('P1', ['TS1', 'TS2']);
    // Only the re-priced item is written; the server already holds Design as picked.
    expect(scope.updateItem).toHaveBeenCalledWith('P1', 'I2', {
      name: 'Fit-out',
      description: null,
      fee: 18000,
    });
    expect(scope.reorder).not.toHaveBeenCalled();
    expect(sites.createDraft).toHaveBeenCalledWith(
      'P1',
      expect.objectContaining({ address: 'New Cairo', areaSqm: 240 }),
    );
    expect(leads.convert).toHaveBeenCalledWith('L1', { existingClientId: 'C1' });
    expect(runner.steps()).toEqual({
      client: 'done',
      project: 'done',
      scope: 'done',
      site: 'done',
      lead: 'done',
    });
    expect(sessionStorage.getItem('pera.leadConvert.L1')).toBeNull();
  });

  it('uses a picked existing client: no client is created and the lead converts into it', async () => {
    const { runner, clients, projects, leads } = setup();

    await runner.run(plan({ client: { mode: 'existing', clientId: 'C9' } }));

    expect(clients.create).not.toHaveBeenCalled();
    expect(projects.create).toHaveBeenCalledWith(expect.objectContaining({ clientId: 'C9' }));
    expect(leads.convert).toHaveBeenCalledWith('L1', { existingClientId: 'C9' });
  });

  it('stops at a failed step, keeps the lead open, and a retry continues from that step without duplicates', async () => {
    const { runner, calls, scope, leads, sites } = setup();
    scope.confirm.mockReturnValueOnce(fail(409, 'teams.MissingHead'));

    expect(await runner.run(plan())).toBeNull();
    expect(runner.failedStep()).toBe('scope');
    expect(runner.error()).toBeTruthy();
    expect(runner.steps()).toMatchObject({
      client: 'done',
      project: 'done',
      scope: 'failed',
      site: 'pending',
      lead: 'pending',
    });
    expect(sites.createDraft).not.toHaveBeenCalled();
    expect(leads.convert).not.toHaveBeenCalled();
    expect(JSON.parse(sessionStorage.getItem('pera.leadConvert.L1')!)).toEqual({
      clientId: 'C1',
      projectId: 'P1',
    });

    // The fix is made (a department head assigned); the server now holds the draft with both items.
    calls.length = 0;
    scope.getScope.mockImplementationOnce(() => {
      calls.push('scope.get');
      return of(
        emptyScope(ScopeOfWorkStatus.Draft, [
          serverItem('I1', 'TS1', 'Design', 5000, 1),
          serverItem('I2', 'TS2', 'Fit-out', 18000, 2),
        ]),
      );
    });

    expect(await runner.run(plan())).toBe('P1');
    expect(calls).toEqual([
      'scope.get',
      'scope.header',
      'scope.confirm',
      'site.create',
      'lead.convert',
    ]);
  });

  it('skips a scope the server already confirmed', async () => {
    const { runner, calls, scope } = setup();
    sessionStorage.setItem(
      'pera.leadConvert.L1',
      JSON.stringify({ clientId: 'C1', projectId: 'P1' }),
    );
    scope.getScope.mockImplementationOnce(() => {
      calls.push('scope.get');
      return of(emptyScope(ScopeOfWorkStatus.Confirmed));
    });

    await runner.run(plan());

    expect(calls).toEqual(['scope.get', 'site.create', 'lead.convert']);
  });

  it('a retry removes items the user dropped and reorders to the wizard order', async () => {
    const { runner, scope } = setup();
    sessionStorage.setItem(
      'pera.leadConvert.L1',
      JSON.stringify({ clientId: 'C1', projectId: 'P1' }),
    );
    scope.getScope.mockReturnValueOnce(
      of(
        emptyScope(ScopeOfWorkStatus.Draft, [
          serverItem('I1', 'TS1', 'Design', 5000, 1),
          serverItem('I3', 'TS3', 'Old', 100, 2),
          serverItem('I2', 'TS2', 'Fit-out', 18000, 3),
        ]),
      ),
    );
    const items = [...plan().scope.items].reverse();

    await runner.run(plan({ scope: { header, items } }));

    expect(scope.removeItem).toHaveBeenCalledWith('P1', 'I3');
    expect(scope.addItems).not.toHaveBeenCalled();
    expect(scope.reorder).toHaveBeenCalledWith('P1', ['I2', 'I1']);
  });

  it('a failed project create keeps the created client for the retry', async () => {
    const { runner, clients, projects } = setup();
    projects.create.mockReturnValueOnce(fail(409, 'projects.CodeTaken'));

    await runner.run(plan());
    expect(runner.failedStep()).toBe('project');

    await runner.run(plan());
    expect(clients.create).toHaveBeenCalledTimes(1);
    expect(projects.create).toHaveBeenCalledTimes(2);
  });
});
