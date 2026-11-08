import { TestBed } from '@angular/core/testing';
import { of } from 'rxjs';
import { describe, expect, it } from 'vitest';
import { CrmItemService } from '../../data/crm-item.service';
import { PortalItemsComponent } from './portal-items.component';

/** Sync F4e: portal rows show the category and priority PortalRequirementItemResponse carries. */
describe('PortalItemsComponent — category and priority (sync F4e)', () => {
  it('shows both badges when present, none when the row lacks them', () => {
    TestBed.configureTestingModule({
      imports: [PortalItemsComponent],
      providers: [
        {
          provide: CrmItemService,
          useValue: {
            listPortal: () =>
              of({
                items: [
                  { id: 'a', title: 'Sofa', approvalStatus: 3, category: 5, priority: 3 },
                  { id: 'b', title: 'Lamp', approvalStatus: 3, category: null, priority: null },
                ],
                totalCount: 2,
              }),
          },
        },
      ],
    });
    const f = TestBed.createComponent(PortalItemsComponent);
    f.detectChanges();
    const rows = f.nativeElement.querySelectorAll('[data-item]') as NodeListOf<HTMLElement>;
    expect(rows[0].querySelector('[data-category]')?.textContent?.trim()).toBeTruthy();
    expect(rows[0].querySelector('[data-priority]')?.textContent?.trim()).toBe('High');
    expect(rows[1].querySelector('[data-category]')).toBeNull();
    expect(rows[1].querySelector('[data-priority]')).toBeNull();
  });
});
