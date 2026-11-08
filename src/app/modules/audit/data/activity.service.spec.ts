import { TestBed } from '@angular/core/testing';
import { HttpTestingController, provideHttpClientTesting } from '@angular/common/http/testing';
import { provideHttpClient } from '@angular/common/http';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { environment } from '../../../../environments/environment';
import { ActivityService } from './activity.service';
import type { ActivityPagedResult } from '../model/audit.model';

/** Sync W1-5: GET /api/activities is the only activity route (dms AuditEndpoints.cs ActivityEndpoints). */
describe('ActivityService (sync W1-5)', () => {
  let service: ActivityService;
  let http: HttpTestingController;
  const url = `${environment.apiUrl}/activities`;

  beforeEach(() => {
    TestBed.configureTestingModule({
      providers: [provideHttpClient(), provideHttpClientTesting()],
    });
    service = TestBed.inject(ActivityService);
    http = TestBed.inject(HttpTestingController);
  });

  afterEach(() => http.verify());

  const page = {
    items: [
      {
        id: 'A1',
        actorUserId: 'U1',
        actorName: 'Mona',
        action: 2,
        entityName: 'ProjectTask',
        entityId: 'T1',
        entityDisplayName: 'Paint',
        projectId: 'P1',
        message: 'Task assigned to Omar',
        occurredAtUtc: '2026-11-07T10:00:00Z',
      },
      { id: 'A2', action: 'Delete', entityName: 'ProjectTask', message: '' },
    ],
    pageNumber: 2,
    pageSize: 25,
    totalCount: 27,
    totalPages: 2,
  };

  it('reads an entity timeline with entityName/entityId and 1-based pageNumber', () => {
    let res: ActivityPagedResult | undefined;
    service.getEntityTimeline('ProjectTask', 'T1', { pageSize: 100 }).subscribe((r) => (res = r));
    const req = http.expectOne((r) => r.url === url);
    expect(req.request.method).toBe('GET');
    expect(req.request.params.get('entityName')).toBe('ProjectTask');
    expect(req.request.params.get('entityId')).toBe('T1');
    expect(req.request.params.get('pageNumber')).toBe('1');
    expect(req.request.params.get('pageSize')).toBe('100');
    expect(req.request.params.has('page')).toBe(false);
    req.flush(page);
    expect(res?.page).toBe(2);
    expect(res?.totalCount).toBe(27);
    expect(res?.items[0].action).toBe('Update');
    expect(res?.items[0].occurredAt).toBe('2026-11-07T10:00:00Z');
    expect(res?.items[0].message).toBe('Task assigned to Omar');
    expect(res?.items[1].action).toBe('Delete');
  });

  it('reads a project feed with projectId (no /projects/{id}/activities route)', () => {
    service.getProjectFeed('P1', { pageSize: 8 }).subscribe();
    const req = http.expectOne((r) => r.url === url);
    expect(req.request.params.get('projectId')).toBe('P1');
    expect(req.request.params.get('pageNumber')).toBe('1');
    expect(req.request.params.get('pageSize')).toBe('8');
    req.flush({ items: [], pageNumber: 1, pageSize: 8, totalCount: 0 });
  });

  it('maps action ints 1/2/3 to Create/Update/Delete', () => {
    let actions: string[] = [];
    service.getFeed().subscribe((r) => (actions = r.items.map((i) => i.action)));
    http
      .expectOne((r) => r.url === url)
      .flush({ items: [{ action: 1 }, { action: 2 }, { action: 3 }], pageNumber: 1 });
    expect(actions).toEqual(['Create', 'Update', 'Delete']);
  });
});
