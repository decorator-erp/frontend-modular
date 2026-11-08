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

  // Sync W1-9: NotificationEndpoints.cs:30 takes a 1-based pageNumber (no more 0-based page).
  it('sends uiPage=1 as pageNumber=1 (no 0-based page param)', () => {
    svc.list(1).subscribe();
    const req = http.expectOne((r) => r.url === '/api/notifications');
    expect(req.request.params.get('pageNumber')).toBe('1');
    expect(req.request.params.has('page')).toBe(false);
    expect(req.request.params.get('pageSize')).toBe('20');
    req.flush({ items: [], totalCount: 0, pageNumber: 1, pageSize: 20 });
  });

  it('sends uiPage=3 as pageNumber=3', () => {
    svc.list(3, 20).subscribe();
    const req = http.expectOne((r) => r.url === '/api/notifications');
    expect(req.request.params.get('pageNumber')).toBe('3');
    req.flush({ items: [], totalCount: 0, pageNumber: 3, pageSize: 20 });
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

  it('maps the wire PagedResult (1-based pageNumber) onto the app PagedResult', () => {
    let result: PagedResult<NotificationResponse> | undefined;
    svc.list(2, 20).subscribe((r) => (result = r));
    const req = http.expectOne((r) => r.url === '/api/notifications');
    req.flush({ items: [{ id: 'n1' }], totalCount: 5, pageNumber: 2, pageSize: 20, totalPages: 3 });
    expect(result?.page).toBe(2);
    expect(result?.totalCount).toBe(5);
    expect(result?.totalPages).toBe(3);
    expect(result?.items).toHaveLength(1);
  });

  it('still reads a legacy 0-based pageIndex response', () => {
    let result: PagedResult<NotificationResponse> | undefined;
    svc.list(2, 20).subscribe((r) => (result = r));
    const req = http.expectOne((r) => r.url === '/api/notifications');
    req.flush({ items: [], totalCount: 5, pageIndex: 1, totalPages: 3 });
    expect(result?.page).toBe(2);
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
