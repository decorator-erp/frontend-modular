import { signal } from '@angular/core';
import { TestBed } from '@angular/core/testing';
import { provideRouter } from '@angular/router';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { BriefStore } from '../../stores/brief.store';
import { ClientProfileStore } from '../../stores/client-profile.store';
import { ItemsStore } from '../../stores/items.store';
import { MeetingsStore } from '../../stores/meetings.store';
import { CrmClientProfileComponent } from './client-profile.component';

// 009b #N-3: no portal items read exists (EP/CrmPortalEndpoints.cs:36-153), so the profile's
// requirements tab renders "not available" and loads no list.
describe('CrmClientProfileComponent — requirements tab (009b #N-3)', () => {
  const loadPortal = vi.fn();

  beforeEach(() => {
    loadPortal.mockClear();
    TestBed.configureTestingModule({
      imports: [CrmClientProfileComponent],
      providers: [provideRouter([])],
    });
    TestBed.overrideComponent(CrmClientProfileComponent, {
      set: {
        providers: [
          {
            provide: ClientProfileStore,
            useValue: {
              load: vi.fn(),
              loading: signal(false),
              loaded: signal(true),
              error: signal(null),
              client: signal(null),
              contacts: signal([]),
              projects: signal([
                {
                  id: 'P',
                  code: 'PRJ-1',
                  name: 'Villa',
                  status: 'InProgress',
                  productOwnerName: null,
                  progressPercentage: 0,
                  openPeriodId: null,
                },
              ]),
              isSingleProject: signal(true),
            },
          },
          {
            provide: BriefStore,
            useValue: {
              loadAsClient: vi.fn(),
              error: signal(null),
              nothingSent: signal(true),
              head: signal(null),
            },
          },
          { provide: ItemsStore, useValue: { loadPortal, items: signal([]) } },
          { provide: MeetingsStore, useValue: { loadPortal: vi.fn(), agenda: signal([]) } },
        ],
      },
    });
  });

  it('renders the not-available state and loads no items', () => {
    const fixture = TestBed.createComponent(CrmClientProfileComponent);
    fixture.detectChanges();
    const el = fixture.nativeElement as HTMLElement;
    const tab = [...el.querySelectorAll('button')].find(
      (b) => b.textContent?.trim() === 'Requirements',
    ) as HTMLButtonElement;
    tab.click();
    fixture.detectChanges();

    expect(el.textContent).toContain('Your requirements list is not available yet.');
    expect(loadPortal).not.toHaveBeenCalled();
  });
});
