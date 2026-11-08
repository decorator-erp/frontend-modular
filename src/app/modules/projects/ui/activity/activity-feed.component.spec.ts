import { TestBed } from '@angular/core/testing';
import { of } from 'rxjs';
import { describe, expect, it, vi } from 'vitest';
import { ActivityService } from '@modules/audit';
import type { ActivityResponse } from '@modules/audit';
import { ActivityFeedComponent } from './activity-feed.component';

const row = (o: Partial<ActivityResponse>): ActivityResponse => ({
  id: 'A1',
  actorUserId: 'U1',
  actorName: 'Mona',
  action: 'Update',
  entityName: 'ProjectTask',
  entityId: 'T1',
  entityDisplayName: 'Paint',
  projectId: 'P1',
  message: '',
  occurredAt: '2026-11-07T10:00:00Z',
  ...o,
});

/** Sync W1-5: the feed reads the backend's rows (action names, the message as the headline). */
describe('ActivityFeedComponent (sync W1-5)', () => {
  function make(items: ActivityResponse[], inputs: Record<string, unknown>) {
    const page = { items, totalCount: items.length, page: 1, pageSize: 50, totalPages: 1 };
    const api = {
      getEntityTimeline: vi.fn(() => of(page)),
      getProjectFeed: vi.fn(() => of(page)),
      getFeed: vi.fn(() => of(page)),
    };
    TestBed.configureTestingModule({
      imports: [ActivityFeedComponent],
      providers: [{ provide: ActivityService, useValue: api }],
    });
    const fixture = TestBed.createComponent(ActivityFeedComponent);
    for (const [k, v] of Object.entries(inputs)) fixture.componentRef.setInput(k, v);
    fixture.detectChanges();
    return { el: fixture.nativeElement as HTMLElement, api };
  }

  it("shows the backend's message as the headline", () => {
    const { el } = make([row({ message: 'Task assigned to Omar' })], {
      entityName: 'ProjectTask',
      entityId: 'T1',
    });
    expect(el.querySelector('[data-message]')?.textContent?.trim()).toBe('Task assigned to Omar');
  });

  it('falls back to verb + entity when there is no message', () => {
    const { el } = make([row({ action: 'Create', message: '' })], {
      entityName: 'ProjectTask',
      entityId: 'T1',
    });
    expect(el.querySelector('[data-message]')).toBeNull();
    expect(el.textContent).toContain('created');
    expect(el.textContent).toContain('Paint');
  });

  it('does not crash on a numeric action that slipped through', () => {
    const { el } = make([row({ action: 2 as unknown as string })], {
      entityName: 'ProjectTask',
      entityId: 'T1',
    });
    expect(el.textContent).toContain('Mona');
  });

  it('reads the project feed in projectId mode', () => {
    const { api } = make([], { projectId: 'P1', take: 8 });
    expect(api.getProjectFeed).toHaveBeenCalledWith('P1', { pageSize: 8 });
  });
});
