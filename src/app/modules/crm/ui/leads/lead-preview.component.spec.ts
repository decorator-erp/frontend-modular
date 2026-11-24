import { TestBed } from '@angular/core/testing';
import { provideRouter } from '@angular/router';
import { of } from 'rxjs';
import { describe, expect, it, vi } from 'vitest';
import { PermissionsService } from '@platform/permissions';
import { ToastService } from '@platform/feedback/toast.service';
import { CrmLeadService, type CrmLead } from '../../data/crm-lead.service';
import { LeadSource, LeadStatus, ProjectSector } from '../../model/crm-enums';
import { LeadPreviewComponent } from './lead-preview.component';

const lead = {
  id: 'L1',
  firstName: 'Hana',
  lastName: 'Ali',
  email: 'hana@example.com',
  phone: '+20 100 000 0000',
  source: LeadSource.Website,
  status: LeadStatus.New,
  ownerId: null,
} as unknown as CrmLead;

function render(intake: object, can = true) {
  const api = {
    getIntake: vi.fn(() => of(intake)),
    updateStatus: vi.fn(() => of(undefined)),
  };
  TestBed.configureTestingModule({
    imports: [LeadPreviewComponent],
    providers: [
      provideRouter([]),
      { provide: CrmLeadService, useValue: api },
      { provide: ToastService, useValue: { show: vi.fn() } },
      { provide: PermissionsService, useValue: { can: () => can, canAll: () => can } },
    ],
  });
  const f = TestBed.createComponent(LeadPreviewComponent);
  f.componentRef.setInput('lead', lead);
  f.detectChanges();
  f.detectChanges();
  return { f, api, el: f.nativeElement as HTMLElement };
}

describe('LeadPreviewComponent (OS-6)', () => {
  it('reads the intake of the selected lead and shows sector and area', () => {
    const { el, api } = render({ sector: ProjectSector.Residential, areaSqm: 180 });
    expect(api.getIntake).toHaveBeenCalledWith('L1');
    expect(el.querySelector('[data-intake]')?.textContent).toContain('180 m²');
    expect(el.querySelector('[data-preview-open]')?.getAttribute('href')).toBe('/crm/leads/L1');
  });

  it('says when no intake is captured yet', () => {
    const { el } = render({});
    expect(el.querySelector('[data-no-intake]')).not.toBeNull();
  });

  it('marks a New lead contacted and tells the list to refetch', () => {
    const { f, el, api } = render({});
    const changed = vi.fn();
    f.componentInstance.changed.subscribe(changed);
    el.querySelector<HTMLButtonElement>('[data-mark-contacted] button')!.click();
    expect(api.updateStatus).toHaveBeenCalledWith('L1', LeadStatus.Contacted);
    expect(changed).toHaveBeenCalled();
  });

  it('hides Mark contacted without crm.leads.change_status', () => {
    const { el } = render({}, false);
    expect(el.querySelector('[data-mark-contacted]')).toBeNull();
  });
});
