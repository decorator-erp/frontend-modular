import { provideHttpClient } from '@angular/common/http';
import { HttpTestingController, provideHttpClientTesting } from '@angular/common/http/testing';
import { TestBed } from '@angular/core/testing';
import { NotificationResponse } from '../model/notification.model';
import { PagedResult } from '@platform/types/paged-result';
import { NotificationService } from './notification.service';

describe('NotificationService', () => {
  let svc: NotificationService;
  let http: HttpTestingController;

  beforeEach(() => {
    TestBed.configureTestingModule({
      providers: [NotificationService, provideHttpClient(), provideHttpClientTesting()],
    });
    svc = TestBed.inject(NotificationService);
    http = TestBed.inject(HttpTestingController);
  });

  afterEach(() => http.verify());

  it('translates uiPage=1 → page=0 on the wire (0-based quirk, Principle VI)', () => {
    svc.list(1).subscribe();
    const req = http.expectOne((r) => r.url === '/api/notifications');
    expect(req.request.params.get('page')).toBe('0');
    expect(req.request.params.get('pageSize')).toBe('20');
    req.flush({ items: [], totalCount: 0, pageIndex: 0, totalPages: 0 });
  });

  it('translates uiPage=3 → page=2', () => {
    svc.list(3, 20).subscribe();
    const req = http.expectOne((r) => r.url === '/api/notifications');
    expect(req.request.params.get('page')).toBe('2');
    req.flush({ items: [], totalCount: 0, pageIndex: 2, totalPages: 0 });
  });

  it('omits unreadOnly unless explicitly true', () => {
    svc.list(1, 20, false).subscribe();
    const req = http.expectOne((r) => r.url === '/api/notifications');
    expect(req.request.params.has('unreadOnly')).toBe(false);
    req.flush({ items: [], totalCount: 0, pageIndex: 0, totalPages: 0 });
  });

  it('sends unreadOnly=true when requested', () => {
    svc.list(1, 20, true).subscribe();
    const req = http.expectOne((r) => r.url === '/api/notifications');
    expect(req.request.params.get('unreadOnly')).toBe('true');
    req.flush({ items: [], totalCount: 0, pageIndex: 0, totalPages: 0 });
  });

  it('maps the wire response onto a 1-based PagedResult (0-based index + 1)', () => {
    let result: PagedResult<NotificationResponse> | undefined;
    svc.list(2, 20).subscribe((r) => (result = r));
    const req = http.expectOne((r) => r.url === '/api/notifications');
    req.flush({ items: [{ id: 'n1' }], totalCount: 5, pageIndex: 1, totalPages: 3 });
    expect(result?.page).toBe(2); // wire 0-based 1 → app 1-based 2
    expect(result?.totalCount).toBe(5);
    expect(result?.totalPages).toBe(3);
    expect(result?.items).toHaveLength(1);
  });

  it('unreadCount() returns the bare integer', () => {
    let n: number | undefined;
    svc.unreadCount().subscribe((v) => (n = v));
    http.expectOne('/api/notifications/unread-count').flush(7);
    expect(n).toBe(7);
  });

  it('markRead() PUTs /{id}/read and resolves on 204', () => {
    let done = false;
    svc.markRead('abc').subscribe(() => (done = true));
    const req = http.expectOne('/api/notifications/abc/read');
    expect(req.request.method).toBe('PUT');
    req.flush(null, { status: 204, statusText: 'No Content' });
    expect(done).toBe(true);
  });

  it('markAllRead() PUTs /read-all', () => {
    svc.markAllRead().subscribe();
    const req = http.expectOne('/api/notifications/read-all');
    expect(req.request.method).toBe('PUT');
    req.flush(null, { status: 204, statusText: 'No Content' });
  });
});
