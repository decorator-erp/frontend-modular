import { of } from 'rxjs';
import { CrmItemService } from '../../data/crm-item.service';
import { signal } from '@angular/core';
import { TestBed } from '@angular/core/testing';
import { ActivatedRoute, convertToParamMap, provideRouter } from '@angular/router';
import { EN } from '@platform/i18n/catalog/en';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { BriefStore } from '../../stores/brief.store';
import { ClientProfileStore } from '../../stores/client-profile.store';
import { ItemsStore } from '../../stores/items.store';
import { MeetingsStore } from '../../stores/meetings.store';
import { PortalOverviewStore } from '../../stores/portal-overview.store';

// crmp P2-B: no portal section is on, so only the four base tabs show.
const PORTAL_OFF = {
  load: vi.fn(),
  loading: signal(false),
  overview: signal(null),
  tabs: signal([]),
};
import { CrmClientProfileComponent } from './client-profile.component';

// 009b #N-3: no portal items read exists (EP/CrmPortalEndpoints.cs:36-153), so the profile's
// requirements tab renders "not available" and loads no list.
describe('CrmClientProfileComponent — requirements tab (009b #N-3)', () => {
  const loadPortal = vi.fn();

  beforeEach(() => {
    loadPortal.mockClear();
    TestBed.configureTestingModule({
      imports: [CrmClientProfileComponent],
      providers: [
        provideRouter([]),
        {
          provide: CrmItemService,
          useValue: {
            listPortal: () =>
              of({ items: [], totalCount: 0, page: 1, pageSize: 20, totalPages: 0 }),
          },
        },
      ],
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
                  activeStageId: 's1',
                  activeStageName: 'Design',
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
          { provide: PortalOverviewStore, useValue: PORTAL_OFF },
        ],
      },
    });
  });

  it('crmp C-2: the overview shows the status label (a ProjectStatus name) and the active stage', () => {
    const fixture = TestBed.createComponent(CrmClientProfileComponent);
    fixture.detectChanges();
    const el = fixture.nativeElement as HTMLElement;
    expect(el.querySelector('[data-testid="project-status"]')?.textContent?.trim()).toBe(
      EN['projects.status.InProgress'],
    );
    expect(el.textContent).toContain(EN['client.activeStage']);
    expect(el.textContent).toContain('Design');
  });

  it('crmp C-1: the Requirements tab hosts the portal items list (no "not available" state)', () => {
    const fixture = TestBed.createComponent(CrmClientProfileComponent);
    fixture.detectChanges();
    const el = fixture.nativeElement as HTMLElement;
    const tab = [...el.querySelectorAll('button')].find(
      (b) => b.textContent?.trim() === 'Requirements',
    ) as HTMLButtonElement;
    tab.click();
    fixture.detectChanges();

    expect(el.textContent).not.toContain('Your requirements list is not available yet.');
    expect(el.querySelector('app-crm-portal-items')).toBeTruthy();
  });
});

// crm-prod B1-fe: the approvals inbox's "View" link opens `/portal?projectId&tab`.
describe('CrmClientProfileComponent — ?projectId&tab deep link (crm-prod B1-fe)', () => {
  const loadAsClient = vi.fn();
  const project = (id: string, name: string) => ({
    id,
    code: `PRJ-${id}`,
    name,
    status: 'InProgress',
    activeStageId: null,
    activeStageName: null,
    progressPercentage: 0,
    openPeriodId: null,
  });

  function render(query: Record<string, string>): HTMLElement {
    loadAsClient.mockClear();
    TestBed.configureTestingModule({
      imports: [CrmClientProfileComponent],
      providers: [
        provideRouter([]),
        {
          provide: ActivatedRoute,
          useValue: { snapshot: { queryParamMap: convertToParamMap(query) } },
        },
      ],
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
              projects: signal([project('P', 'Villa'), project('Q', 'Flat')]),
              isSingleProject: signal(false),
            },
          },
          {
            provide: BriefStore,
            useValue: {
              loadAsClient,
              error: signal(null),
              nothingSent: signal(true),
              head: signal(null),
            },
          },
          { provide: MeetingsStore, useValue: { loadPortal: vi.fn(), agenda: signal([]) } },
          { provide: PortalOverviewStore, useValue: PORTAL_OFF },
        ],
      },
    });
    const fixture = TestBed.createComponent(CrmClientProfileComponent);
    fixture.detectChanges();
    return fixture.nativeElement as HTMLElement;
  }

  it('selects the named project and opens its Brief tab', () => {
    const el = render({ projectId: 'Q', tab: 'brief' });
    expect(loadAsClient).toHaveBeenCalledWith('Q');
    expect(loadAsClient).not.toHaveBeenCalledWith('P');
    expect(el.textContent).toContain(EN['client.briefNotSent']);
  });

  it('falls back to the first project and the overview for an unknown id or tab', () => {
    const el = render({ projectId: 'X', tab: 'nope' });
    expect(loadAsClient).toHaveBeenCalledWith('P');
    expect(el.textContent).not.toContain(EN['client.briefNotSent']);
  });
});

describe('CrmClientProfileComponent — error states (crmp C-2)', () => {
  const load = vi.fn();
  function render(errorKey: string): HTMLElement {
    load.mockClear();
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
              load,
              loading: signal(false),
              loaded: signal(true),
              error: signal(errorKey),
              client: signal(null),
              contacts: signal([]),
              projects: signal([]),
              isSingleProject: signal(false),
            },
          },
          { provide: BriefStore, useValue: { loadAsClient: vi.fn() } },
          { provide: MeetingsStore, useValue: { loadPortal: vi.fn() } },
          { provide: PortalOverviewStore, useValue: PORTAL_OFF },
        ],
      },
    });
    const fixture = TestBed.createComponent(CrmClientProfileComponent);
    fixture.detectChanges();
    return fixture.nativeElement as HTMLElement;
  }

  it('a 404 shows the "no linked client" catalog message and no retry', () => {
    const el = render('client.profileNoClient');
    expect(el.textContent).toContain(EN['client.profileNoClient']);
    expect(el.textContent).not.toContain(EN['client.profileRetry']);
  });

  it('any other failure offers a retry that reloads', () => {
    const el = render('client.profileUnavailable');
    const retry = [...el.querySelectorAll('button')].find(
      (b) => b.textContent?.trim() === EN['client.profileRetry'],
    ) as HTMLButtonElement;
    load.mockClear();
    retry.click();
    expect(load).toHaveBeenCalledTimes(1);
  });
});
