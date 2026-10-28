import { TestBed } from '@angular/core/testing';
import { beforeEach, describe, expect, it } from 'vitest';
import { ApprovalState } from '../model/crm-enums';
import type { CrmTaskBlock } from '../model';
import { CatalogService } from '@platform/i18n/catalog.service';
import { LocaleService } from '@platform/i18n';
import { blockingReason } from './blocking-reason';

function block(over: Partial<CrmTaskBlock> = {}): CrmTaskBlock {
  return {
    briefId: 'brief-1',
    briefStatus: ApprovalState.Approved,
    entryTotal: 0,
    entryPending: 0,
    itemTotal: 0,
    itemPending: 0,
    unresolvedTotal: 0,
    meetingsUpcoming: 0,
    ...over,
  };
}

describe('blockingReason', () => {
  let catalog: CatalogService;

  beforeEach(() => {
    TestBed.configureTestingModule({ providers: [CatalogService, LocaleService] });
    catalog = TestBed.inject(CatalogService);
  });

  it('is null when the brief is approved and nothing is pending — Complete is NOT blocked', () => {
    expect(blockingReason(block(), catalog)).toBeNull();
  });

  it('blocks when the brief is Pending (and briefStatus is non-null)', () => {
    const reason = blockingReason(block({ briefStatus: ApprovalState.PendingApproval }), catalog);
    expect(reason).toContain('brief head is Pending');
  });

  it('does NOT block on briefStatus when there is no brief at all (null)', () => {
    expect(blockingReason(block({ briefStatus: null }), catalog)).toBeNull();
  });

  it('blocks on pending entries, naming the count', () => {
    const reason = blockingReason(block({ entryPending: 2 }), catalog);
    expect(reason).toContain('2');
  });

  it('blocks on pending items, naming the count', () => {
    const reason = blockingReason(block({ itemPending: 3 }), catalog);
    expect(reason).toContain('3');
  });

  it('combines every outstanding reason, not just the first', () => {
    const reason = blockingReason(
      block({ briefStatus: ApprovalState.PendingApproval, entryPending: 1, itemPending: 1 }),
      catalog,
    );
    expect(reason).toContain('brief head is Pending');
    expect(reason).toContain('pending entries');
    expect(reason).toContain('pending items');
  });
});
