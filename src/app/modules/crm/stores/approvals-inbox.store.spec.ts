import { TestBed } from '@angular/core/testing';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { provideHttpClient, withInterceptors } from '@angular/common/http';
import {
  HttpTestingController,
  provideHttpClientTesting,
  type TestRequest,
} from '@angular/common/http/testing';
import { ToastService } from '@platform/feedback/toast.service';
import { errorInterceptor } from '@platform/http/error.interceptor';
import { environment } from '../../../../environments/environment';
import { ApprovalDecision } from '../model/crm-enums';
import { ApprovalsInboxStore } from './approvals-inbox.store';

const BASE = `${environment.apiUrl}/crm/portal/approvals`;

function row(id: string, decision: number | null = null): Record<string, unknown> {
  return {
    id,
    subjectType: 2,
    subjectId: `b-${id}`,
    projectId: 'p1',
    projectName: 'Villa',
    briefId: `b-${id}`,
    stageId: null,
    stageName: null,
    round: 1,
    title: null,
    requestedAtUtc: '2026-10-01T10:00:00Z',
    dueAtUtc: null,
    decision,
    decidedAtUtc: decision ? '2026-10-02T10:00:00Z' : null,
    comment: null,
  };
}

function page(items: Record<string, unknown>[], pageNumber = 1, totalPages = 1) {
  return { items, pageNumber, pageSize: 20, totalCount: items.length, totalPages };
}

// crm-prod B1-fe: replaces 009b #N-2's "not available".
describe('ApprovalsInboxStore (crm-prod B1-fe)', () => {
  let http: HttpTestingController;
  let toast: { show: ReturnType<typeof vi.fn> };

  beforeEach(() => {
    toast = { show: vi.fn() };
    TestBed.configureTestingModule({
      providers: [
        ApprovalsInboxStore,
        provideHttpClient(),
        provideHttpClientTesting(),
        { provide: ToastService, useValue: toast },
      ],
    });
    http = TestBed.inject(HttpTestingController);
  });

  afterEach(() => http.verify());

  const store = () => TestBed.inject(ApprovalsInboxStore);
  const list = (status: 'pending' | 'decided'): TestRequest =>
    http.expectOne((r) => r.url === BASE && r.params.get('status') === status);
  const decideReq = (id: string): TestRequest => http.expectOne(`${BASE}/${id}/decide`);
  const flushBoth = (pending = [row('a1'), row('a2')], decided = [row('d1', 1)]) => {
    list('pending').flush(page(pending));
    list('decided').flush(page(decided));
  };

  it('load() reads the first page of pending and decided', () => {
    const s = store();
    s.load();
    expect(s.pending().loading).toBe(true);
    flushBoth();
    expect(s.pending().rows.map((r) => r.id)).toEqual(['a1', 'a2']);
    expect(s.decided().rows.map((r) => r.id)).toEqual(['d1']);
    expect(s.pending().loading).toBe(false);
    expect(s.pending().error).toBeNull();
  });

  it('loadMore() appends the next page, and stops on the last page', () => {
    const s = store();
    s.load();
    list('pending').flush(page([row('a1')], 1, 2));
    list('decided').flush(page([]));

    s.loadMore('pending');
    const next = list('pending');
    expect(next.request.params.get('pageNumber')).toBe('2');
    next.flush(page([row('a2')], 2, 2));
    expect(s.pending().rows.map((r) => r.id)).toEqual(['a1', 'a2']);

    s.loadMore('pending');
    http.expectNone((r) => r.url === BASE);
  });

  it('a failed list read lands on a catalog message', () => {
    const s = store();
    s.load();
    list('pending').flush(
      { errors: { 'crm.portal.NotAClient': ['x'] } },
      { status: 403, statusText: 'Forbidden' },
    );
    list('decided').flush(null, { status: 500, statusText: 'Server Error' });
    expect(s.pending().error).toBe('This page is for clients only.');
    expect(s.decided().error).toBe('Could not load your approvals.');
  });

  it('approve PUTs the decision, toasts, and re-reads both lists', () => {
    const s = store();
    s.load();
    flushBoth();
    const onDone = vi.fn();

    s.decide('a1', ApprovalDecision.Approved, null, { onDone });
    expect(s.isDeciding('a1')).toBe(true);
    const req = decideReq('a1');
    expect(req.request.body).toEqual({ decision: 1, comment: null });
    req.flush(null, { status: 204, statusText: 'No Content' });

    expect(onDone).toHaveBeenCalled();
    expect(toast.show).toHaveBeenCalledWith({
      tone: 'success',
      message: 'Your decision was sent.',
    });
    flushBoth([row('a2')], [row('a1', 1), row('d1', 1)]);
    expect(s.isDeciding('a1')).toBe(false);
    expect(s.pending().rows.map((r) => r.id)).toEqual(['a2']);
    expect(s.decided().rows.map((r) => r.id)).toEqual(['a1', 'd1']);
  });

  it('holds one decide request per approval in flight (double click → one request)', () => {
    const s = store();
    s.decide('a1', ApprovalDecision.Approved, null);
    s.decide('a1', ApprovalDecision.Approved, null);
    s.decide('a1', ApprovalDecision.ChangesRequested, 'x');
    const req = decideReq('a1');
    req.flush(null, { status: 204, statusText: 'No Content' });
    flushBoth();
  });

  it('a click after the 204 and before the reload lands sends no second PUT (FINDING-P2-3)', () => {
    const s = store();
    s.load();
    flushBoth();
    s.decide('a1', ApprovalDecision.Approved, null);
    decideReq('a1').flush(null, { status: 204, statusText: 'No Content' });

    expect(s.pending().rows.map((r) => r.id)).toEqual(['a2']);
    expect(s.isDeciding('a1')).toBe(true);
    s.decide('a1', ApprovalDecision.Approved, null);
    http.expectNone(`${BASE}/a1/decide`);

    flushBoth([row('a2')], [row('a1', 1), row('d1', 1)]);
    expect(s.isDeciding('a1')).toBe(false);
  });

  it('409 approvals.AlreadyDecided reloads both lists and toasts', () => {
    const s = store();
    s.load();
    flushBoth();
    s.decide('a1', ApprovalDecision.Approved, null);
    decideReq('a1').flush(
      { errors: { 'approvals.AlreadyDecided': ['x'] } },
      { status: 409, statusText: 'Conflict' },
    );
    expect(toast.show).toHaveBeenCalledWith({
      tone: 'warning',
      message: 'This approval was already decided. Your list has been refreshed.',
    });
    expect(s.isDeciding('a1')).toBe(false);
    flushBoth([row('a2')], [row('a1', 1)]);
    expect(s.pending().rows.map((r) => r.id)).toEqual(['a2']);
  });

  it('404 crm.portal.NotFound drops the row at once and reloads both lists', () => {
    const s = store();
    s.load();
    flushBoth();
    s.decide('a1', ApprovalDecision.Approved, null);
    decideReq('a1').flush(
      { errors: { 'crm.portal.NotFound': ['x'] } },
      { status: 404, statusText: 'Not Found' },
    );
    expect(s.pending().rows.map((r) => r.id)).toEqual(['a2']);
    expect(toast.show).toHaveBeenCalledWith({
      tone: 'warning',
      message: 'This approval is no longer available. Your list has been refreshed.',
    });
    flushBoth([row('a2')], []);
  });

  it('a 400 goes to the caller inline, through the catalog, with no reload', () => {
    const s = store();
    const onError = vi.fn();
    s.decide('a1', ApprovalDecision.ChangesRequested, ' ', { onError });
    decideReq('a1').flush(
      { errors: { 'approvals.CommentRequired': ['x'] } },
      { status: 400, statusText: 'Bad Request' },
    );
    expect(onError).toHaveBeenCalledWith('A comment is required to reject or request changes.');
    expect(toast.show).not.toHaveBeenCalled();
  });
});

// crm-prod FINDING-P2-1: with the real errorInterceptor, a decide that fails on the network or
// with a 5xx shows ONE toast (the interceptor's), not the interceptor's plus the store's.
describe('ApprovalsInboxStore with errorInterceptor (FINDING-P2-1)', () => {
  let http: HttpTestingController;
  let toast: { show: ReturnType<typeof vi.fn> };

  beforeEach(() => {
    toast = { show: vi.fn() };
    TestBed.configureTestingModule({
      providers: [
        ApprovalsInboxStore,
        provideHttpClient(withInterceptors([errorInterceptor])),
        provideHttpClientTesting(),
        { provide: ToastService, useValue: toast },
      ],
    });
    http = TestBed.inject(HttpTestingController);
  });

  afterEach(() => http.verify());

  const decideReq = (id: string): TestRequest => http.expectOne(`${BASE}/${id}/decide`);

  it('a 5xx on decide shows exactly one toast', () => {
    const s = TestBed.inject(ApprovalsInboxStore);
    s.decide('a1', ApprovalDecision.Approved, null);
    decideReq('a1').flush(null, { status: 503, statusText: 'Service Unavailable' });
    expect(toast.show).toHaveBeenCalledTimes(1);
    expect(s.isDeciding('a1')).toBe(false);
  });

  it('a network failure (status 0) on decide shows exactly one toast', () => {
    const s = TestBed.inject(ApprovalsInboxStore);
    s.decide('a1', ApprovalDecision.Approved, null);
    decideReq('a1').error(new ProgressEvent('error'), { status: 0, statusText: 'Unknown Error' });
    expect(toast.show).toHaveBeenCalledTimes(1);
  });

  it("a 403 on decide still shows exactly one toast (the store's catalog message)", () => {
    const s = TestBed.inject(ApprovalsInboxStore);
    s.decide('a1', ApprovalDecision.Approved, null);
    decideReq('a1').flush(
      { errors: { 'crm.portal.NotAClient': ['x'] } },
      { status: 403, statusText: 'Forbidden' },
    );
    expect(toast.show).toHaveBeenCalledTimes(1);
    expect(toast.show).toHaveBeenCalledWith({
      tone: 'danger',
      message: 'This page is for clients only.',
    });
  });
});
