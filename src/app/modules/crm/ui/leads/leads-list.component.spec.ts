import { TestBed } from '@angular/core/testing';
import { provideRouter } from '@angular/router';
import { of, throwError } from 'rxjs';
import { describe, expect, it, vi } from 'vitest';
import { EmployeeService } from '@modules/people';
import { CrmLeadService } from '../../data/crm-lead.service';
import { LeadSource, LeadStatus } from '../../model/crm-enums';
import { EN } from '@platform/i18n/catalog/en';
import { CrmLeadsListComponent } from './leads-list.component';

function make() {
  const leads = {
    search: vi
      .fn()
      .mockReturnValue(of({ items: [], totalCount: 0, page: 1, pageSize: 50, totalPages: 0 })),
    statusCounts: vi
      .fn()
      .mockReturnValue(
        of({ total: 9, new: 1, contacted: 2, qualified: 3, unqualified: 1, converted: 2 }),
      ),
  };
  TestBed.configureTestingModule({
    imports: [CrmLeadsListComponent],
    providers: [
      provideRouter([]),
      { provide: CrmLeadService, useValue: leads },
      { provide: EmployeeService, useValue: { listPaged: () => of({ items: [] }) } },
    ],
  });
  const component = TestBed.createComponent(CrmLeadsListComponent).componentInstance;
  return { component, leads };
}

describe('CrmLeadsListComponent — status pills (009b #2)', () => {
  it('counts each pill from status-counts, not from the loaded page', () => {
    const { component, leads } = make();
    component.ngOnInit();

    expect(leads.statusCounts).toHaveBeenCalledWith({ search: undefined });
    const status = component.facets().find((f) => f.key === 'status');
    const qualified = status?.options.find((o) => o.value === String(LeadStatus.Qualified));
    expect(component.statusCount(LeadStatus.Qualified)).toBe(3);
    expect(qualified?.label).toContain('3');
  });

  it('re-counts with the same search as the list when the filters change', () => {
    const { component, leads } = make();
    component.ngOnInit();
    component.onFilters({ search: 'mo' });

    expect(leads.search).toHaveBeenLastCalledWith(expect.objectContaining({ search: 'mo' }));
    expect(leads.statusCounts).toHaveBeenLastCalledWith({ search: 'mo' });
  });
});

describe('CrmLeadsListComponent — load failure (crm-prod M4)', () => {
  it('shows an error with Retry instead of the empty state, and Retry refetches', () => {
    const { leads } = make();
    leads.search.mockReturnValue(throwError(() => new Error('down')));
    const fixture = TestBed.createComponent(CrmLeadsListComponent);
    fixture.detectChanges();
    fixture.detectChanges();
    const el = fixture.nativeElement as HTMLElement;

    const alert = el.querySelector('[data-testid="leads-load-error"]');
    expect(alert?.textContent).toContain('Could not load the leads.');
    expect(el.textContent).not.toContain('No leads yet');

    const calls = leads.search.mock.calls.length;
    leads.search.mockReturnValue(
      of({ items: [], totalCount: 0, page: 1, pageSize: 50, totalPages: 0 }),
    );
    (alert?.querySelector('button') as HTMLButtonElement).click();
    fixture.detectChanges();
    expect(leads.search).toHaveBeenCalledTimes(calls + 1);
    expect(el.querySelector('[data-testid="leads-load-error"]')).toBeNull();
    expect(el.textContent).toContain('No leads yet');
  });
});

describe('CrmLeadsListComponent — unassigned leads (LI-1)', () => {
  it("names an unassigned lead's owner Unassigned", () => {
    const { component } = make();
    const row = {
      id: 'L',
      firstName: 'Mona',
      lastName: 'Adel',
      email: null,
      phone: null,
      source: LeadSource.Website,
      status: LeadStatus.New,
      ownerId: null,
      notes: null,
      convertedClientId: null,
      convertedAtUtc: null,
    };

    expect((component as unknown as { ownerName(r: typeof row): string }).ownerName(row)).toBe(
      EN['leads.unassigned'],
    );
  });
});
