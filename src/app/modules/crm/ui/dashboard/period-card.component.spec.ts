import { TestBed } from '@angular/core/testing';
import { of } from 'rxjs';
import { describe, expect, it, vi } from 'vitest';
import { ModalService } from '@ds';
import { CrmPeriodService } from '../../data/crm-period.service';
import { RequirementPeriodStatus } from '../../model/crm-enums';
import { PeriodStore } from '../../stores/period.store';
import { CrmPeriodCardComponent } from './period-card.component';

describe('CrmPeriodCardComponent (009b #25)', () => {
  it('renders the close date with no "Opened" date (the response has none)', () => {
    TestBed.configureTestingModule({
      imports: [CrmPeriodCardComponent],
      providers: [
        PeriodStore,
        { provide: ModalService, useValue: { open: vi.fn() } },
        {
          provide: CrmPeriodService,
          useValue: {
            list: vi.fn().mockReturnValue(
              of([
                {
                  id: 'Per',
                  projectId: 'P',
                  projectStageId: null,
                  status: RequirementPeriodStatus.Open,
                  closesAtUtc: '2026-07-20T18:00:00Z',
                  closedAtUtc: null,
                  openedById: 'E',
                },
              ]),
            ),
          },
        },
      ],
    });
    TestBed.inject(PeriodStore).load('P');
    const fixture = TestBed.createComponent(CrmPeriodCardComponent);
    fixture.detectChanges();
    const text = (fixture.nativeElement as HTMLElement).textContent ?? '';

    expect(text).toContain('Closes');
    expect(text).not.toContain('Opened');
    expect(text).not.toContain('Invalid');
  });
});
