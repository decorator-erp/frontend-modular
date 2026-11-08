import { TestBed } from '@angular/core/testing';
import { ActivatedRoute, convertToParamMap, provideRouter } from '@angular/router';
import { of } from 'rxjs';
import { describe, expect, it, vi } from 'vitest';
import { ModalService } from '@ds';
import { PermissionsService } from '@platform/permissions';
import { LedgerEntryService } from '../../data/ledger-entry.service';
import { LedgerListComponent } from './ledger-list.component';
import { LedgerAllocateComponent } from './ledger-allocate.component';

/** Sync W1-11: a payment with an unallocated remainder offers Allocate (finance.record_payment). */
describe('LedgerListComponent — allocate (sync W1-11)', () => {
  function make(canRecord: boolean) {
    const open = vi.fn(() => ({ afterClosed: () => Promise.resolve(false) }));
    const api = {
      getByProject: vi.fn(() =>
        of({
          items: [
            {
              id: 'L1',
              direction: 'In',
              type: 'ClientPayment',
              amount: '100',
              occurredOn: '2026-11-01',
              isReversed: false,
              note: null,
            },
            {
              id: 'L2',
              direction: 'Out',
              type: 'ActualCost',
              amount: '30',
              occurredOn: '2026-11-02',
              isReversed: true,
              note: 'Wrong vendor',
            },
          ],
          totalCount: 2,
          page: 1,
          pageSize: 100,
          totalPages: 1,
        }),
      ),
      getUnallocated: vi.fn(() => of(new Map([['L1', '40']]))),
    };
    TestBed.configureTestingModule({
      imports: [LedgerListComponent],
      providers: [
        provideRouter([]),
        {
          provide: ActivatedRoute,
          useValue: { snapshot: { paramMap: convertToParamMap({ projectId: 'P1' }) } },
        },
        { provide: LedgerEntryService, useValue: api },
        { provide: ModalService, useValue: { open } },
        { provide: PermissionsService, useValue: { can: () => canRecord } },
      ],
    });
    const fixture = TestBed.createComponent(LedgerListComponent);
    fixture.detectChanges();
    fixture.detectChanges();
    return { fixture, open, el: fixture.nativeElement as HTMLElement };
  }

  it('shows Allocate only on the entry with a remainder and opens the allocate dialog with it', () => {
    const { el, open } = make(true);
    // The data table renders a desktop table and a mobile card list; count in the table only.
    const buttons = el.querySelector('table')!.querySelectorAll('pera-button[data-allocate]');
    expect(buttons.length).toBe(1);
    (buttons[0].querySelector('button') ?? (buttons[0] as HTMLElement)).click();
    expect(open).toHaveBeenCalledWith(LedgerAllocateComponent, {
      size: 'md',
      data: { projectId: 'P1', entryId: 'L1', unallocated: '40' },
    });
  });

  it('offers no Allocate without finance.record_payment', () => {
    const { el } = make(false);
    expect(el.querySelectorAll('pera-button[data-allocate]').length).toBe(0);
  });

  it('W2-6: a reversed entry is struck through and its note shows', () => {
    const { el } = make(true);
    expect(el.querySelector('.line-through')).not.toBeNull();
    expect(el.textContent).toContain('Wrong vendor');
  });
});
