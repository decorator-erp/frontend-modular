import { TestBed } from '@angular/core/testing';
import { provideHttpClient } from '@angular/common/http';
import { provideHttpClientTesting } from '@angular/common/http/testing';
import { ConditionType } from '../model/project.model';
import { ProjectService } from './project.service';

/**
 * KNOWN-FIX-1 (charter §6, enum-audit §4): the CONDITION read map decodes every value the
 * `conditionInt()` write map encodes. At SOURCE_SHA the read map stopped at 5, so an integer
 * `Budget` (6) — or any CRM condition (7–9) — read back as the `ManualCheck` fallback.
 */
describe('ProjectService — KNOWN-FIX-1 condition round-trip', () => {
  const all: ConditionType[] = [
    'Task',
    'Stage',
    'Approval',
    'ManualCheck',
    'Attachment',
    'Budget',
    'CrmPeriodClosed',
    'CrmBriefApproved',
    'CrmItemsResolved',
  ];

  let svc: ProjectService;

  beforeEach(() => {
    TestBed.configureTestingModule({
      providers: [provideHttpClient(), provideHttpClientTesting()],
    });
    svc = TestBed.inject(ProjectService);
  });

  it.each(all)('%s survives write (conditionInt) → read (normalizeGate) as an integer', (v) => {
    const wire = svc.conditionInt(v);
    expect(svc.normalizeGate({ conditionType: wire }).conditionType).toBe(v);
  });

  it('encodes the nine values to nine distinct integers 1..9', () => {
    expect(all.map((v) => svc.conditionInt(v))).toEqual([1, 2, 3, 4, 5, 6, 7, 8, 9]);
  });
});
