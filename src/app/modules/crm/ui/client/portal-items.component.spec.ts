import { TestBed } from '@angular/core/testing';
import { HttpErrorResponse } from '@angular/common/http';
import { HttpTestingController, provideHttpClientTesting } from '@angular/common/http/testing';
import { provideHttpClient } from '@angular/common/http';
import { of, throwError } from 'rxjs';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { HANDLED_ERROR_STATUSES } from '@platform/http/handled-errors';
import { environment } from '../../../../../environments/environment';
import { CrmItemService } from '../../data/crm-item.service';
import { ApprovalState } from '../../model/crm-enums';
import { PORTAL_ITEMS_PAGE_SIZE, PortalItemsComponent } from './portal-items.component';

/** crmp C-1: the client's portal items (dms CrmPortalEndpoints.cs:61, PortalContracts.cs:132). */
describe('portal items (crmp C-1)', () => {
  afterEach(() => TestBed.resetTestingModule());

  it('pins GET /crm/portal/requirement-items with filters, status as int and paging', () => {
    TestBed.configureTestingModule({
      providers: [provideHttpClient(), provideHttpClientTesting()],
    });
    const http = TestBed.inject(HttpTestingController);
    let state = 0;
    TestBed.inject(CrmItemService)
      .listPortal({
        projectId: 'P1',
        periodId: 'PE1',
        status: ApprovalState.Approved,
        pageNumber: 2,
        pageSize: 20,
      })
      .subscribe((r) => (state = r.items[0]?.approvalStatus ?? 0));
    const r = http.expectOne((x) => x.url === `${environment.apiUrl}/crm/portal/requirement-items`);
    expect(r.request.params.get('projectId')).toBe('P1');
    expect(r.request.params.get('periodId')).toBe('PE1');
    expect(r.request.params.get('status')).toBe('3');
    expect(r.request.params.get('pageNumber')).toBe('2');
    // A9: a 403 (no requirements.view_own) is shown inline by the tab, so the global toast skips it
    expect(r.request.context.get(HANDLED_ERROR_STATUSES)).toEqual(
      expect.arrayContaining([403, 404]),
    );
    r.flush({
      items: [{ id: 'I1', title: 't', approvalStatus: 3, decisionComment: 'ok' }],
      totalCount: 1,
      pageNumber: 2,
      pageSize: 20,
      totalPages: 1,
    });
    expect(state).toBe(ApprovalState.Approved);
    http.verify();
  });

  function make(listPortal: ReturnType<typeof vi.fn>) {
    TestBed.configureTestingModule({
      imports: [PortalItemsComponent],
      providers: [{ provide: CrmItemService, useValue: { listPortal } }],
    });
    const f = TestBed.createComponent(PortalItemsComponent);
    f.componentRef.setInput('projects', [{ id: 'P1', name: 'Villa', openPeriodId: 'PE1' }]);
    f.detectChanges();
    return { f, c: f.componentInstance, el: f.nativeElement as HTMLElement };
  }

  it('lists items with their state and decision note; filters reset to page 1', () => {
    const listPortal = vi.fn(() =>
      of({
        items: [
          {
            id: 'I1',
            title: 'Kitchen tiles',
            projectName: 'Villa',
            approvalStatus: ApprovalState.Rejected,
            decisionComment: 'Darker please',
            createdAtUtc: '2026-11-01T10:00:00Z',
          },
        ],
        totalCount: 1,
        page: 1,
        pageSize: 20,
        totalPages: 1,
      }),
    );
    const { c, el, f } = make(listPortal);
    f.detectChanges();
    expect(el.querySelector('[data-item]')?.textContent).toContain('Kitchen tiles');
    expect(el.querySelector('[data-state]')?.textContent).toContain('Changes requested');
    expect(el.querySelector('[data-comment]')?.textContent).toContain('Darker please');
    c.setProject('P1');
    c.setFilter('status', ApprovalState.Approved);
    expect(listPortal).toHaveBeenLastCalledWith({
      projectId: 'P1',
      periodId: null,
      status: ApprovalState.Approved,
      pageNumber: 1,
      pageSize: PORTAL_ITEMS_PAGE_SIZE,
    });
    expect(c.periodOptions().map((o) => o.value)).toEqual([null, 'PE1']);
  });

  it('a 404 (filter outside the client’s projects) shows its catalog message', () => {
    const err = new HttpErrorResponse({
      status: 404,
      error: { errors: { 'crm.portal.NotFound': ['x'] } },
    });
    const { el, f } = make(vi.fn(() => throwError(() => err)));
    f.detectChanges();
    expect(el.querySelector('[data-error]')).toBeTruthy();
  });
});
