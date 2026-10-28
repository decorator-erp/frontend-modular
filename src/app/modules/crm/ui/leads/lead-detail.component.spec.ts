import { TestBed } from '@angular/core/testing';
import { HttpErrorResponse } from '@angular/common/http';
import { provideRouter } from '@angular/router';
import { of, throwError } from 'rxjs';
import { describe, expect, it, vi } from 'vitest';
import { ToastService } from '@platform/feedback/toast.service';
import { CrmLeadService } from '../../data/crm-lead.service';
import { LeadSource, LeadStatus, PastExperience, ProjectSector } from '../../model/crm-enums';
import { LeadDetailStore } from '../../stores/lead-detail.store';
import { CrmLeadDetailComponent } from './lead-detail.component';

const lead = {
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

function make(upsert = vi.fn().mockReturnValue(of(undefined))) {
  const api = {
    getById: vi.fn().mockReturnValue(of(lead)),
    getIntake: vi.fn().mockReturnValue(of({})),
    upsertIntake: upsert,
  };
  TestBed.configureTestingModule({
    imports: [CrmLeadDetailComponent],
    providers: [
      provideRouter([]),
      LeadDetailStore,
      { provide: CrmLeadService, useValue: api },
      { provide: ToastService, useValue: { show: () => undefined } },
    ],
  });
  const fixture = TestBed.createComponent(CrmLeadDetailComponent);
  fixture.componentRef.setInput('leadId', 'L');
  return { c: fixture.componentInstance, api };
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
