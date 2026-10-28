import { TestBed } from '@angular/core/testing';
import { of } from 'rxjs';
import { describe, expect, it, vi } from 'vitest';
import { CrmApprovalsService } from '../../data/crm-approvals.service';
import { ApprovalSubjectType } from '../../model/crm-enums';
import type { PendingApproval } from '../../model';
import { ApprovalsListComponent } from './approvals-list.component';

const ROW: PendingApproval = {
  id: 'a1',
  subjectType: ApprovalSubjectType.DesignBrief,
  subjectId: 'brief-1',
  type: 2,
  round: 3,
  dueAtUtc: null,
  trackKey: 'a1',
};

describe('ApprovalsListComponent (009b #41)', () => {
  it('pages from 1 and renders the project/gate label as "not available"', () => {
    const pending = vi
      .fn()
      .mockReturnValue(of({ items: [ROW], page: 1, pageSize: 50, totalCount: 1, totalPages: 1 }));
    TestBed.configureTestingModule({
      imports: [ApprovalsListComponent],
      providers: [{ provide: CrmApprovalsService, useValue: { pending } }],
    });

    const fixture = TestBed.createComponent(ApprovalsListComponent);
    fixture.detectChanges();
    const text = (fixture.nativeElement as HTMLElement).textContent ?? '';

    expect(pending).toHaveBeenCalledWith(1, 50);
    expect(text).toContain('Not available');
    expect(text).toContain('round 3');
  });
});
