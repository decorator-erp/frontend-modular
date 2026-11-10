import { signal } from '@angular/core';
import { TestBed } from '@angular/core/testing';
import { provideRouter, Router } from '@angular/router';
import { of } from 'rxjs';
import { describe, expect, it, vi } from 'vitest';
import { EN } from '@platform/i18n/catalog/en';
import { ToastService } from '@platform/feedback/toast.service';
import { PermissionsService } from '@platform/permissions';
import { StageTemplatesService } from '@modules/library';
import { CrmLeadService, type CrmLead } from '../../../data/crm-lead.service';
import { LeadSource, LeadStatus, ProjectSector } from '../../../model/crm-enums';
import { LeadConvertRunner } from '../../../stores/lead-convert.runner';
import { LeadConvertPageComponent } from './lead-convert-page.component';

const lead: CrmLead = {
  id: 'L1',
  firstName: 'Mona',
  lastName: 'Adel',
  email: 'mona@example.com',
  phone: '+201001234567',
  source: LeadSource.Website,
  status: LeadStatus.New,
  ownerId: null,
  notes: 'Call after 5pm',
  convertedClientId: null,
  convertedAtUtc: null,
};

const intake = {
  clientAddress: 'Zamalek, Cairo',
  sector: ProjectSector.Residential,
  unitAddress: 'Villa 7, New Cairo',
  areaSqm: 240,
  residential: { unitType: 2, unitCondition: 2, isLicensed: true, isRented: false },
};

const templateStages = [
  {
    id: 'TS1',
    stageTemplateId: 'T1',
    name: 'Design',
    description: 'Concept',
    order: 1,
    weightPercent: 50,
    defaultFee: 5000,
    taskCount: 2,
  },
  {
    id: 'TS2',
    stageTemplateId: 'T1',
    name: 'Fit-out',
    description: null,
    order: 2,
    weightPercent: 50,
    defaultFee: null,
    taskCount: 4,
  },
];

function make(
  opts: {
    can?: (p: string) => boolean;
    lead?: CrmLead;
    run?: ReturnType<typeof vi.fn>;
    issuedLogin?: { email: string; password: string } | null;
  } = {},
) {
  const run = opts.run ?? vi.fn().mockResolvedValue('P1');
  const issuedLogin = signal(opts.issuedLogin ?? null);
  TestBed.configureTestingModule({
    imports: [LeadConvertPageComponent],
    providers: [
      provideRouter([]),
      {
        provide: CrmLeadService,
        useValue: {
          getById: () => of(opts.lead ?? lead),
          getIntake: () => of(intake),
          searchClients: () =>
            of({ items: [{ id: 'C9', displayName: 'Old client' }], totalCount: 1 }),
        },
      },
      {
        provide: StageTemplatesService,
        useValue: {
          list: () => of([{ id: 'T1', name: 'Villa' }]),
          stages: () => of(templateStages),
        },
      },
      { provide: PermissionsService, useValue: { can: opts.can ?? (() => true) } },
      { provide: ToastService, useValue: { show: vi.fn() } },
    ],
  });
  TestBed.overrideComponent(LeadConvertPageComponent, {
    set: {
      providers: [
        {
          provide: LeadConvertRunner,
          useValue: {
            run,
            running: () => false,
            steps: () => ({
              client: 'pending',
              project: 'pending',
              scope: 'pending',
              site: 'pending',
              lead: 'pending',
            }),
            failedStep: () => null,
            error: () => null,
            progressOf: () => ({}),
            issuedLogin,
          },
        },
      ],
    },
  });
  const fixture = TestBed.createComponent(LeadConvertPageComponent);
  fixture.componentRef.setInput('leadId', 'L1');
  fixture.detectChanges();
  return { fixture, c: fixture.componentInstance, run, issuedLogin };
}

const text = (fixture: { detectChanges(): void; nativeElement: unknown }) => {
  fixture.detectChanges();
  return (fixture.nativeElement as HTMLElement).textContent ?? '';
};

describe('LeadConvertPageComponent (LC-1)', () => {
  it('prefills the client, project and site from the lead and its intake', () => {
    const { c } = make();

    expect(c.clientForm.getRawValue()).toMatchObject({
      firstName: 'Mona',
      lastName: 'Adel',
      email: 'mona@example.com',
      phone: '+201001234567',
      address: 'Zamalek, Cairo',
    });
    expect(c.projectForm.getRawValue()).toMatchObject({
      name: `Mona Adel — ${EN['sector.residential']}`,
      address: 'Villa 7, New Cairo',
    });
    expect(c.siteForm.getRawValue()).toMatchObject({
      address: 'Villa 7, New Cairo',
      areaSqm: '240',
      unitType: '2',
      unitCondition: '2',
      isLicensed: true,
      isRented: false,
    });
  });

  it('cannot leave the client step with a required field missing', () => {
    const { c } = make();
    c.clientForm.controls.email.setValue('');

    c.next();

    expect(c.step()).toBe(1);
  });

  it('moves through the steps, and the scope step needs a confirmable scope', () => {
    const { c } = make();
    c.next(); // client -> project
    c.projectForm.patchValue({ code: 'MON-1', estimatedStartDate: '2027-01-10' });
    c.next(); // project -> scope
    expect(c.step()).toBe(3);

    c.next();
    expect(c.step()).toBe(3); // no items, no duration

    c.addStage('TS1');
    c.addStage('TS2');
    c.onHeader({
      durationDays: 120,
      plannedStartDate: '2027-01-10',
      adjustmentAmount: 0,
      adjustmentNote: null,
      notes: null,
    });
    c.next();
    expect(c.step()).toBe(4);
    expect(c.scopeItems()).toEqual([
      {
        sourceStageId: 'TS1',
        sourceTemplateName: 'Villa',
        name: 'Design',
        description: 'Concept',
        fee: 5000,
      },
      {
        sourceStageId: 'TS2',
        sourceTemplateName: 'Villa',
        name: 'Fit-out',
        description: null,
        fee: 0,
      },
    ]);
  });

  it('defaults the scope start to the project start', () => {
    const { c } = make();
    c.next();
    c.projectForm.patchValue({ code: 'MON-1', estimatedStartDate: '2027-01-10' });
    c.next();

    expect(c.scopeHeader().plannedStartDate).toBe('2027-01-10');
  });

  it('builds the plan from every step: a new client, the project, the scope and the site', () => {
    const { c } = make();
    c.projectForm.patchValue({ code: 'MON-1', estimatedStartDate: '2027-01-10' });
    c.addStage('TS1');
    c.onItemUpdate({
      itemId: 'TS1',
      request: { name: 'Design', description: 'Concept', fee: 4500 },
    });
    c.onHeader({
      durationDays: 90,
      plannedStartDate: '2027-01-10',
      adjustmentAmount: 0,
      adjustmentNote: null,
      notes: null,
    });

    const plan = c.plan();

    expect(plan.leadId).toBe('L1');
    expect(plan.client.mode).toBe('new');
    expect(plan.client.mode === 'new' && plan.client.request).toMatchObject({
      firstName: 'Mona',
      email: 'mona@example.com',
      address: 'Zamalek, Cairo',
    });
    expect(
      plan.client.mode === 'new' && plan.client.request.password.length,
    ).toBeGreaterThanOrEqual(16);
    expect(plan.project).toEqual({
      code: 'MON-1',
      name: `Mona Adel — ${EN['sector.residential']}`,
      address: 'Villa 7, New Cairo',
      description: null,
      estimatedStartDate: '2027-01-10',
    });
    expect(plan.scope.items).toEqual([
      {
        sourceStageId: 'TS1',
        sourceTemplateName: 'Villa',
        name: 'Design',
        description: 'Concept',
        fee: 4500,
      },
    ]);
    expect(plan.site).toMatchObject({
      address: 'Villa 7, New Cairo',
      areaSqm: 240,
      unitType: 2,
      isLicensed: true,
    });
  });

  it('LC-2: every plan (Create, then Retry) carries a fresh password the backend accepts', () => {
    const { c } = make();
    const pw = () => {
      const plan = c.plan();
      return plan.client.mode === 'new' ? plan.client.request.password : '';
    };
    const first = pw();
    const second = pw();

    // A refused password is never sent twice; the runner skips the client step once it exists.
    expect(second).not.toBe(first);
    for (const p of [first, second]) {
      expect(p).toMatch(/[a-z]/);
      expect(p).toMatch(/[A-Z]/);
      expect(p).toMatch(/[0-9]/);
      expect(p).toMatch(/[^A-Za-z0-9]/);
    }
  });

  it('uses an existing client when one is picked', () => {
    const { c } = make();
    c.clientMode.set('existing');
    c.existingClientId.setValue('C9');

    expect(c.plan().client).toEqual({ mode: 'existing', clientId: 'C9' });
  });

  it('Create checks every step first and opens the step that is incomplete', async () => {
    const { c, run } = make();

    await c.create();

    expect(run).not.toHaveBeenCalled();
    expect(c.step()).toBe(2); // the project code is missing
  });

  it('Create runs the conversion and opens the new project', async () => {
    const { c, run } = make();
    const navigate = vi.spyOn(TestBed.inject(Router), 'navigate').mockResolvedValue(true);
    c.projectForm.patchValue({ code: 'MON-1' });
    c.addStage('TS1');
    c.onHeader({
      durationDays: 90,
      plannedStartDate: null,
      adjustmentAmount: 0,
      adjustmentNote: null,
      notes: null,
    });

    await c.create();

    expect(run).toHaveBeenCalledWith(expect.objectContaining({ leadId: 'L1' }));
    expect(navigate).toHaveBeenCalledWith(['/projects', 'P1']);
  });

  it('LC-2: a new client login is shown once — email and password — before opening the project', async () => {
    const { c, fixture } = make({
      issuedLogin: { email: 'mona@example.com', password: 'Tmp!Pass2wordX9' },
    });
    const navigate = vi.spyOn(TestBed.inject(Router), 'navigate').mockResolvedValue(true);
    c.projectForm.patchValue({ code: 'MON-1' });
    c.addStage('TS1');
    c.onHeader({
      durationDays: 90,
      plannedStartDate: null,
      adjustmentAmount: 0,
      adjustmentNote: null,
      notes: null,
    });

    c.step.set(5); // Create is pressed on the review step.
    await c.create();
    fixture.detectChanges();
    const el = fixture.nativeElement as HTMLElement;

    expect(navigate).not.toHaveBeenCalled();
    expect(el.querySelector('[data-testid="convert-credentials"]')).not.toBeNull();
    expect(el.querySelector('[data-value="email"]')?.textContent?.trim()).toBe('mona@example.com');
    expect(el.querySelector('[data-value="password"]')?.textContent?.trim()).toBe(
      'Tmp!Pass2wordX9',
    );
    expect(el.querySelector('[data-testid="convert-create"]')).toBeNull();

    el.querySelector<HTMLElement>(
      '[data-testid="convert-open-project"] button, [data-testid="convert-open-project"]',
    )!.click();
    expect(navigate).toHaveBeenCalledWith(['/projects', 'P1']);
  });

  it('lists the permissions the conversion needs and the user lacks', () => {
    const { fixture } = make({ can: (p) => p !== 'scope.confirm' && p !== 'sites.create' });
    const el = text(fixture);

    expect(el).toContain(EN['convert.missingPerms']);
    expect(el).toContain('scope.confirm');
    expect(el).toContain('sites.create');
  });

  it('says so when the lead is already converted', () => {
    const { fixture } = make({
      lead: { ...lead, status: LeadStatus.Converted, convertedClientId: 'C1' },
    });

    expect(text(fixture)).toContain(EN['convert.alreadyConverted']);
  });
});
