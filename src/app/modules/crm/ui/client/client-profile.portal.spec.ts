import { signal } from '@angular/core';
import { TestBed } from '@angular/core/testing';
import { ActivatedRoute, convertToParamMap, provideRouter } from '@angular/router';
import { of } from 'rxjs';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { AuthStore } from '@platform/auth/auth.store';
import { CrmItemService } from '../../data/crm-item.service';
import { CrmPortalContentService } from '../../data/crm-portal-content.service';
import type { PortalOverview, PortalSections } from '../../model/portal.model';
import { BriefStore } from '../../stores/brief.store';
import { ClientProfileStore } from '../../stores/client-profile.store';
import { MeetingsStore } from '../../stores/meetings.store';
import { PortalOverviewStore } from '../../stores/portal-overview.store';
import { CrmClientProfileComponent } from './client-profile.component';

const OFF: PortalSections = {
  progress: false,
  tasks: false,
  documents: false,
  gallery: false,
  siteSurveys: false,
  updates: false,
};

function overview(sections: Partial<PortalSections>): PortalOverview {
  return {
    projectId: 'P',
    projectName: 'Villa',
    sections: { ...OFF, ...sections },
    progress: sections.progress
      ? {
          progressPercentage: 40,
          activeStageName: 'Design',
          limitedToSharedStages: false,
          stages: [
            {
              name: 'Design',
              note: null,
              order: 1,
              status: 'Active',
              plannedStartDate: '2026-10-01T00:00:00Z',
              plannedEndDate: '2026-11-01T00:00:00Z',
              actualStartDate: null,
              actualEndDate: null,
              progressPercentage: 50,
            },
          ],
        }
      : null,
    counts: { documents: null, images: null, sitePhotos: null, tasks: null, updates: null },
  };
}

/** crmp P2-B: the profile's portal section tabs follow GET overview's sections and the caller's codes. */
describe('CrmClientProfileComponent — portal section tabs (crmp P2-B)', () => {
  let claims: string[];
  let getOverview: ReturnType<typeof vi.fn>;
  let query: Record<string, string>;

  beforeEach(() => {
    claims = ['crm.portal.progress.view_own', 'crm.portal.files.view_own'];
    query = {};
    getOverview = vi.fn(() => of(overview({})));
  });

  function render() {
    TestBed.configureTestingModule({
      imports: [CrmClientProfileComponent],
      providers: [
        provideRouter([]),
        {
          provide: ActivatedRoute,
          useValue: { snapshot: { queryParamMap: convertToParamMap(query) } },
        },
        { provide: AuthStore, useValue: { can: (p: string) => claims.includes(p) } },
        {
          provide: CrmPortalContentService,
          useValue: {
            getOverview,
            getFiles: vi.fn(() => of([])),
            getGallery: vi.fn(() => of([])),
            getTasks: vi.fn(() => of([])),
            getUpdates: vi.fn(() => of([])),
            fileBlob: vi.fn(),
          },
        },
        { provide: CrmItemService, useValue: { listPortal: () => of({ items: [] }) } },
      ],
    });
    TestBed.overrideComponent(CrmClientProfileComponent, {
      set: {
        providers: [
          PortalOverviewStore,
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
                  activeStageId: null,
                  activeStageName: null,
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
              spaces: signal([]),
            },
          },
          {
            provide: MeetingsStore,
            useValue: { loadPortal: vi.fn(), agenda: signal([]), error: signal(null) },
          },
        ],
      },
    });
    const fixture = TestBed.createComponent(CrmClientProfileComponent);
    fixture.detectChanges();
    TestBed.tick();
    fixture.detectChanges();
    return fixture;
  }

  const tabNames = (el: HTMLElement) =>
    Array.from(el.querySelectorAll<HTMLElement>('[data-tab]')).map((b) => b.dataset['tab']);

  it('shows only the four base tabs while every section is off', () => {
    const el = render().nativeElement as HTMLElement;
    expect(getOverview).toHaveBeenCalledWith('P');
    expect(tabNames(el)).toEqual(['overview', 'brief', 'requirements', 'meetings']);
  });

  it('adds a tab for each section that is on', () => {
    getOverview.mockReturnValue(
      of(
        overview({
          progress: true,
          documents: true,
          siteSurveys: true,
          tasks: true,
          updates: true,
        }),
      ),
    );
    const el = render().nativeElement as HTMLElement;
    expect(tabNames(el)).toEqual([
      'overview',
      'brief',
      'requirements',
      'meetings',
      'progress',
      'files',
      'gallery',
      'tasks',
      'updates',
    ]);
  });

  it('hides the file tabs without crm.portal.files.view_own', () => {
    claims = ['crm.portal.progress.view_own'];
    getOverview.mockReturnValue(of(overview({ progress: true, documents: true, gallery: true })));
    const el = render().nativeElement as HTMLElement;
    expect(tabNames(el)).toEqual(['overview', 'brief', 'requirements', 'meetings', 'progress']);
  });

  it('reads no overview (and adds no tab) without crm.portal.progress.view_own', () => {
    claims = ['crm.portal.files.view_own'];
    const el = render().nativeElement as HTMLElement;
    expect(getOverview).not.toHaveBeenCalled();
    expect(tabNames(el)).toEqual(['overview', 'brief', 'requirements', 'meetings']);
  });

  it('opens the tab the link names (?tab=updates) when that section is on', () => {
    query = { projectId: 'P', tab: 'updates' };
    getOverview.mockReturnValue(of(overview({ updates: true })));
    const el = render().nativeElement as HTMLElement;
    expect(el.querySelector('[data-tab="updates"]')?.getAttribute('aria-current')).toBe('true');
    expect(el.querySelector('app-crm-portal-section-tab')).not.toBeNull();
  });

  it('falls back to the overview when the linked section is off', () => {
    query = { projectId: 'P', tab: 'updates' };
    const el = render().nativeElement as HTMLElement;
    expect(el.querySelector('[data-tab="overview"]')?.getAttribute('aria-current')).toBe('true');
  });

  it('the Progress tab renders the stage timeline with Cairo dates', () => {
    getOverview.mockReturnValue(of(overview({ progress: true })));
    const fixture = render();
    const el = fixture.nativeElement as HTMLElement;
    (el.querySelector('[data-tab="progress"]') as HTMLButtonElement).click();
    fixture.detectChanges();
    expect(el.querySelectorAll('[data-testid="portal-stage"]')).toHaveLength(1);
    expect(el.querySelector('[data-testid="portal-percent"]')?.textContent?.trim()).toBe('40%');
    expect(el.querySelector('[data-testid="planned"]')?.textContent).toContain('Oct 1, 2026');
  });
});
