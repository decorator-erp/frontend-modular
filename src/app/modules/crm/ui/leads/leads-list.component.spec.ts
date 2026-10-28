import { TestBed } from '@angular/core/testing';
import { provideRouter } from '@angular/router';
import { of } from 'rxjs';
import { describe, expect, it, vi } from 'vitest';
import { EmployeeService } from '@modules/people';
import { CrmLeadService } from '../../data/crm-lead.service';
import { LeadStatus } from '../../model/crm-enums';
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
