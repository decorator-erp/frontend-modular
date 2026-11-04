import { TestBed } from '@angular/core/testing';
import { HttpErrorResponse, provideHttpClient, withInterceptors } from '@angular/common/http';
import { HttpTestingController, provideHttpClientTesting } from '@angular/common/http/testing';
import { provideRouter } from '@angular/router';
import { NEVER, of, throwError } from 'rxjs';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { ToastService } from '@platform/feedback/toast.service';
import { errorInterceptor } from '@platform/http/error.interceptor';
import { PermissionsService } from '@platform/permissions';
import { ModalService, type SelectOption } from '@ds';
import { EmployeeService } from '@modules/people';
import { CrmLeadFormComponent } from '../dashboard/forms/lead-form.component';
import { CrmLeadService, type CrmLead } from '../../data/crm-lead.service';
import { LeadSource, LeadStatus, PastExperience, ProjectSector } from '../../model/crm-enums';
import { LeadDetailStore } from '../../stores/lead-detail.store';
import { CrmLeadDetailComponent } from './lead-detail.component';

const lead: CrmLead = {
  id: 'L',
  firstName: 'Mona',
  lastName: 'Adel',
  email: null,
  phone: null,
  source: LeadSource.Phone,
  status: LeadStatus.New,
  ownerId: 'E1',
  notes: null,
  convertedClientId: null,
  convertedAtUtc: null,
};

function make(
  upsert = vi.fn().mockReturnValue(of(undefined)),
  opts: { can?: (p: string) => boolean; lead?: CrmLead; getById?: ReturnType<typeof vi.fn> } = {},
) {
  const api = {
    getById: opts.getById ?? vi.fn().mockReturnValue(of(opts.lead ?? lead)),
    getIntake: vi.fn().mockReturnValue(of({})),
    upsertIntake: upsert,
    updateStatus: vi.fn().mockReturnValue(of(undefined)),
  };
  const modal = { open: vi.fn().mockReturnValue({ afterClosed: () => Promise.resolve(false) }) };
  TestBed.configureTestingModule({
    imports: [CrmLeadDetailComponent],
    providers: [
      provideRouter([]),
      LeadDetailStore,
      { provide: CrmLeadService, useValue: api },
      { provide: ToastService, useValue: { show: () => undefined } },
      { provide: PermissionsService, useValue: { can: opts.can ?? (() => true) } },
      { provide: ModalService, useValue: modal },
      {
        provide: EmployeeService,
        useValue: { listPaged: () => of({ items: [{ id: 'E1', fullName: 'Sara Nabil' }] }) },
      },
    ],
  });
  const fixture = TestBed.createComponent(CrmLeadDetailComponent);
  fixture.componentRef.setInput('leadId', 'L');
  return { c: fixture.componentInstance, api, fixture, modal };
}

function rendered(fixture: { detectChanges(): void; nativeElement: unknown }) {
  fixture.detectChanges();
  return fixture.nativeElement as HTMLElement;
}

describe('CrmLeadDetailComponent — intake body (009b #6)', () => {
  it('sends sector (never projectSector) and residential:null off Residential', () => {
    const { c, api } = make();
    c.form.patchValue({ projectSector: String(ProjectSector.Medical) });
    c.save();

    const body = api.upsertIntake.mock.calls[0][1] as Record<string, unknown>;
    expect(body['sector']).toBe(ProjectSector.Medical);
    expect(body).not.toHaveProperty('projectSector');
    expect(body['residential']).toBeNull();
  });

  it('nulls the designer experience and reason unless usedDesignerBefore is true', () => {
    const { c, api } = make();
    c.form.patchValue(
      {
        usedDesignerBefore: false,
        designerExperience: PastExperience.Good,
        designerExperienceReason: 'old',
      },
      { emitEvent: false },
    );
    c.form.clearValidators();
    c.form.updateValueAndValidity({ emitEvent: false });
    c.save();

    const body = api.upsertIntake.mock.calls[0][1] as Record<string, unknown>;
    expect(body['designerExperience']).toBeNull();
    expect(body['designerExperienceReason']).toBeNull();
  });

  it('maps crm.leads.ResidentialWithoutSector onto the sector control', () => {
    const err = new HttpErrorResponse({
      status: 400,
      error: {
        status: 400,
        title: 'crm.leads.ResidentialWithoutSector',
        errors: { 'crm.leads.ResidentialWithoutSector': ['x'] },
      },
    });
    const { c } = make(vi.fn().mockReturnValue(throwError(() => err)));
    c.save();

    expect(c.errorOf('projectSector')).not.toBe('');
  });
});

describe('CrmLeadDetailComponent — details and status (crm-prod H3)', () => {
  const only =
    (...granted: string[]) =>
    (p: string) =>
      granted.includes(p);
  const buttonLabels = (el: HTMLElement) =>
    Array.from(el.querySelectorAll('pera-button')).map((b) => b.textContent?.trim());

  it('shows the owner by name', () => {
    const { fixture } = make();
    expect(rendered(fixture).querySelector('[data-testid="lead-owner"]')?.textContent).toContain(
      'Sara Nabil',
    );
  });

  it('offers the status control with crm.leads.change_status, never Converted or the current one', () => {
    const { fixture, c } = make(undefined, { can: only('crm.leads.change_status') });
    const el = rendered(fixture);
    expect(el.querySelector('[data-testid="lead-status"]')).not.toBeNull();
    const options = (c as unknown as { statusOptions(): SelectOption[] }).statusOptions();
    expect(options.map((o) => o.value)).toEqual([
      String(LeadStatus.Contacted),
      String(LeadStatus.Qualified),
      String(LeadStatus.Unqualified),
    ]);
  });

  it('hides the status control without crm.leads.change_status', () => {
    const { fixture } = make(undefined, { can: only('crm.leads.update') });
    expect(rendered(fixture).querySelector('[data-testid="lead-status"]')).toBeNull();
  });

  it('a status pick sends PUT /status and reloads the lead', () => {
    const { fixture, c, api } = make();
    rendered(fixture);
    c.statusControl.setValue(String(LeadStatus.Qualified));

    expect(api.updateStatus).toHaveBeenCalledWith('L', LeadStatus.Qualified);
    expect(api.getById).toHaveBeenCalledTimes(2);
    expect(c.statusControl.value).toBeNull();
  });

  it('shows Edit with crm.leads.update and opens the lead form on this lead', () => {
    const { fixture, c, modal } = make(undefined, { can: only('crm.leads.update') });
    expect(buttonLabels(rendered(fixture))).toContain('Edit');

    void c.openEdit(lead);
    expect(modal.open).toHaveBeenCalledWith(CrmLeadFormComponent, {
      size: 'lg',
      data: { lead },
    });
  });

  it('hides Edit without crm.leads.update', () => {
    const { fixture } = make(undefined, { can: only('crm.leads.change_status') });
    expect(buttonLabels(rendered(fixture))).not.toContain('Edit');
  });

  it('links a converted lead to its client, with no edit or status control', () => {
    const converted = {
      ...lead,
      status: LeadStatus.Converted,
      convertedClientId: 'C1',
      convertedAtUtc: '2026-10-01T00:00:00Z',
    };
    const { fixture } = make(undefined, { lead: converted });
    const el = rendered(fixture);
    expect(el.querySelector('[data-testid="lead-client-link"]')?.getAttribute('href')).toBe(
      '/crm/clients/C1',
    );
    expect(el.querySelector('[data-testid="lead-status"]')).toBeNull();
    expect(buttonLabels(el)).not.toContain('Edit');
  });
});

describe('CrmLeadDetailComponent — load states (crm-prod M4)', () => {
  const failing = (status: number) =>
    vi.fn().mockReturnValue(throwError(() => new HttpErrorResponse({ status })));

  it('shows a skeleton while the lead loads', () => {
    const { fixture } = make(undefined, { getById: vi.fn().mockReturnValue(NEVER) });
    expect(rendered(fixture).querySelector('[data-testid="lead-skeleton"]')).not.toBeNull();
  });

  it('shows not-found on a 404', () => {
    const { fixture } = make(undefined, { getById: failing(404) });
    const el = rendered(fixture);
    expect(el.querySelector('[data-testid="lead-not-found"]')?.textContent).toContain(
      'Lead not found',
    );
    expect(el.querySelector('[data-testid="lead-load-error"]')).toBeNull();
  });

  it('shows an error with Retry on any other failure, and Retry reloads', () => {
    const getById = failing(500);
    const { fixture } = make(undefined, { getById });
    const el = rendered(fixture);
    const alert = el.querySelector('[data-testid="lead-load-error"]');
    expect(alert?.textContent).toContain('Could not load the lead.');

    getById.mockReturnValue(of(lead));
    (alert?.querySelector('button') as HTMLButtonElement).click();
    expect(getById).toHaveBeenCalledTimes(2);
    expect(rendered(fixture).querySelector('[data-testid="lead-load-error"]')).toBeNull();
  });
});

// crm-prod FINDING-P2-2: the real CrmLeadService behind the real errorInterceptor — a status
// change that fails on the network or with a 5xx shows ONE toast, not two.
describe('CrmLeadDetailComponent — status change failure toasts (FINDING-P2-2)', () => {
  afterEach(() => TestBed.inject(HttpTestingController).verify());

  function makeReal() {
    const toast = { show: vi.fn() };
    TestBed.configureTestingModule({
      imports: [CrmLeadDetailComponent],
      providers: [
        provideRouter([]),
        provideHttpClient(withInterceptors([errorInterceptor])),
        provideHttpClientTesting(),
        LeadDetailStore,
        { provide: ToastService, useValue: toast },
        { provide: PermissionsService, useValue: { can: () => true } },
        { provide: ModalService, useValue: { open: vi.fn() } },
        {
          provide: EmployeeService,
          useValue: { listPaged: () => of({ items: [{ id: 'E1', fullName: 'Sara Nabil' }] }) },
        },
      ],
    });
    const http = TestBed.inject(HttpTestingController);
    const fixture = TestBed.createComponent(CrmLeadDetailComponent);
    fixture.componentRef.setInput('leadId', 'L');
    fixture.detectChanges();
    const flushReads = () =>
      http
        .match((r) => r.method === 'GET')
        .forEach((r) => r.flush(r.request.url.endsWith('/intake') ? {} : lead));
    flushReads();
    fixture.detectChanges();
    return { c: fixture.componentInstance, http, toast, flushReads };
  }

  const statusReq = (http: HttpTestingController) =>
    http.expectOne((r) => r.method === 'PUT' && r.url.endsWith('/crm/leads/L/status'));

  it('a 5xx shows exactly one toast', () => {
    const { c, http, toast } = makeReal();
    c.statusControl.setValue(String(LeadStatus.Qualified));
    statusReq(http).flush(null, { status: 500, statusText: 'Server Error' });
    expect(toast.show).toHaveBeenCalledTimes(1);
    expect(c.statusControl.value).toBeNull();
  });

  it('a network failure (status 0) shows exactly one toast', () => {
    const { c, http, toast } = makeReal();
    c.statusControl.setValue(String(LeadStatus.Qualified));
    statusReq(http).error(new ProgressEvent('error'), { status: 0, statusText: 'Unknown Error' });
    expect(toast.show).toHaveBeenCalledTimes(1);
  });

  it("a 409 still shows the component's own catalog toast once and reloads", () => {
    const { c, http, toast, flushReads } = makeReal();
    c.statusControl.setValue(String(LeadStatus.Qualified));
    statusReq(http).flush(
      { errors: { 'crm.leads.AlreadyConverted': ['x'] } },
      { status: 409, statusText: 'Conflict' },
    );
    flushReads();
    expect(toast.show).toHaveBeenCalledTimes(1);
    expect(toast.show.mock.calls[0][0].tone).toBe('danger');
  });
});
