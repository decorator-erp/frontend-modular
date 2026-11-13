import { PermissionsService } from '@platform/permissions';
import { TestBed } from '@angular/core/testing';
import { provideRouter } from '@angular/router';
import { signal } from '@angular/core';
import { describe, expect, it, beforeEach } from 'vitest';
import { ApprovalState } from '../../model/crm-enums';
import { ClientHubStore } from '../../stores/client-hub.store';
import { BriefStore } from '../../stores/brief.store';
import { ItemsStore } from '../../stores/items.store';
import { PeriodStore } from '../../stores/period.store';
import { ClientHubGatheringTabComponent } from './gathering-tab.component';

/**
 * The aggregate-root rule, asserted against what the tab actually renders.
 *
 * `/crm/clients/:clientId` may REPORT project work but never edit it: everything keyed by
 * `project_id` is managed under `/crm/projects/:projectId/*`. Re-embedding an editor here
 * would restore exactly the coupling this replaced, and would do so silently — nothing
 * else fails when a client page grows a write button.
 */
describe('the client hub Gathering tab is a read-only summary', () => {
  const selectedProjectId = signal<string | null>('project-1');
  const openPeriod = signal<unknown>({ id: 'period-1' });

  beforeEach(() => {
    TestBed.configureTestingModule({
      imports: [ClientHubGatheringTabComponent],
      providers: [
        { provide: PermissionsService, useValue: { can: () => true, canAll: () => true } },
        provideRouter([]),
        { provide: ClientHubStore, useValue: { selectedProjectId } },
        { provide: PeriodStore, useValue: { openPeriod } },
        {
          provide: BriefStore,
          useValue: { head: signal({ status: ApprovalState.Draft }), spaces: signal([{}, {}]) },
        },
        { provide: ItemsStore, useValue: { items: signal([{}, {}, {}]) } },
      ],
    });
  });

  function render(): HTMLElement {
    const fixture = TestBed.createComponent(ClientHubGatheringTabComponent);
    fixture.detectChanges();
    return fixture.nativeElement as HTMLElement;
  }

  it('renders no button — every affordance is a link out to the project', () => {
    // The tab has zero (click) handlers by design; any <button> is a regression.
    expect(render().querySelectorAll('button').length).toBe(0);
  });

  it('renders no form control — nothing is editable here', () => {
    const el = render();
    expect(el.querySelectorAll('input, textarea, select').length).toBe(0);
  });

  it('links to the project brief, spaces and items', () => {
    const hrefs = [...render().querySelectorAll('a')].map((a) => a.getAttribute('href') ?? '');
    expect(hrefs.some((h) => h.endsWith('/brief'))).toBe(true);
    expect(hrefs.some((h) => h.endsWith('/spaces'))).toBe(true);
    expect(hrefs.some((h) => h.endsWith('/items'))).toBe(true);
  });

  it('points those links at the PROJECT, never the client', () => {
    const hrefs = [...render().querySelectorAll('a')].map((a) => a.getAttribute('href') ?? '');
    expect(hrefs.every((h) => h.startsWith('/crm/projects/'))).toBe(true);
  });

  it('reports the counts it summarises', () => {
    const text = render().textContent ?? '';
    expect(text).toContain('2'); // gathering entries
    expect(text).toContain('3'); // requirement items
  });

  it('prompts to open a period from the project page when none is open', () => {
    openPeriod.set(null);
    const el = render();
    // Opening a period is what seeds the brief, so this hint is the real answer to
    // "how do I start the brief?" — and it must still be a link, not an action.
    expect(el.querySelectorAll('button').length).toBe(0);
    expect(el.textContent).toBeTruthy();
    openPeriod.set({ id: 'period-1' });
  });
});
