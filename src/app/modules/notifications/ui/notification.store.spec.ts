import { signal } from '@angular/core';
import { TestBed } from '@angular/core/testing';
import { Router } from '@angular/router';
import { of, throwError } from 'rxjs';
import { AuthStore } from '@platform/auth/auth.store';
import { ToastService } from '@platform/feedback/toast.service';
import { NotificationService } from '../data/notification.service';
import { NotificationResponse } from '../model/notification.model';
import { RealtimeService } from '@platform/realtime/realtime.service';
import { NotificationDeepLink } from './notification-deep-link';
import { NotificationStore } from './notification.store';

function push(id: string, unread = true): NotificationResponse {
  return {
    id,
    type: 100,
    typeName: 'TaskAssigned',
    title: `n-${id}`,
    body: null,
    entityType: 5,
    entityId: `e-${id}`,
    createdAtUtc: '2026-07-08T09:00:00Z',
    readAtUtc: unread ? null : '2026-07-08T10:00:00Z',
  };
}

function realtimeMock() {
  return {
    on: vi.fn(),
    onReconnected: vi.fn(),
    start: vi.fn().mockResolvedValue(undefined),
    stop: vi.fn().mockResolvedValue(undefined),
    status: signal('disconnected'),
  };
}

interface ToastArg {
  title?: string;
  message?: string;
  action?: { run: () => void };
}

function toastMock() {
  let seq = 0;
  const items = signal<{ id: number }[]>([]);
  const show = vi.fn((_t: ToastArg) => {
    const id = ++seq;
    items.update((a) => [...a, { id }]);
    return id;
  });
  return { items, show, dismiss: vi.fn() };
}

describe('NotificationStore (connection layer)', () => {
  let unreadServer: number;
  let onSpy: ReturnType<typeof vi.fn>;
  let onReconnectedSpy: ReturnType<typeof vi.fn>;

  function make() {
    unreadServer = 5;
    const rt = realtimeMock();
    onSpy = rt.on;
    onReconnectedSpy = rt.onReconnected;
    TestBed.configureTestingModule({
      providers: [
        { provide: NotificationService, useValue: { unreadCount: () => of(unreadServer) } },
        { provide: RealtimeService, useValue: rt },
        { provide: AuthStore, useValue: { isAuthenticated: signal(false), can: () => true } },
        { provide: Router, useValue: { navigate: vi.fn() } },
        {
          provide: NotificationDeepLink,
          useValue: { resolve: vi.fn().mockResolvedValue(['/notifications']) },
        },
        { provide: ToastService, useValue: toastMock() },
      ],
    });
    return TestBed.inject(NotificationStore);
  }

  // UI-1: every notification route needs notifications.view_own — without it nothing is requested.
  it('never asks for the unread count (or recent items) without notifications.view_own', () => {
    const unreadCount = vi.fn(() => of(3));
    const list = vi.fn(() => of({ items: [], totalCount: 0 }));
    TestBed.configureTestingModule({
      providers: [
        { provide: NotificationService, useValue: { unreadCount, list } },
        { provide: RealtimeService, useValue: realtimeMock() },
        { provide: AuthStore, useValue: { isAuthenticated: signal(false), can: () => false } },
        { provide: Router, useValue: { navigate: vi.fn() } },
        { provide: NotificationDeepLink, useValue: { resolve: vi.fn() } },
        { provide: ToastService, useValue: toastMock() },
      ],
    });
    const store = TestBed.inject(NotificationStore);
    store.loadUnreadCount();
    store.loadRecent();
    expect(unreadCount).not.toHaveBeenCalled();
    expect(list).not.toHaveBeenCalled();
  });

  it('registers the ReceiveNotification + reconnect handlers on init (before any start)', () => {
    make();
    expect(onSpy).toHaveBeenCalledWith('ReceiveNotification', expect.any(Function));
    expect(onReconnectedSpy).toHaveBeenCalledTimes(1);
  });

  it('increments the count and prepends on a live push', () => {
    const store = make();
    store.onLiveNotification(push('a'));
    store.onLiveNotification(push('b'));
    expect(store.unreadCount()).toBe(2);
    expect(store.recent().map((n) => n.id)).toEqual(['b', 'a']);
  });

  it('dedupes a repeated id (no double count)', () => {
    const store = make();
    store.onLiveNotification(push('a'));
    store.onLiveNotification(push('a'));
    expect(store.unreadCount()).toBe(1);
    expect(store.recent()).toHaveLength(1);
  });

  it('does not bump the count for an already-read push', () => {
    const store = make();
    store.onLiveNotification(push('a', false));
    expect(store.unreadCount()).toBe(0);
    expect(store.recent()).toHaveLength(1);
  });

  it('resyncs the count to the server total on reconnect, even after local drift (SC-001)', () => {
    const store = make();
    store.onLiveNotification(push('a'));
    store.onLiveNotification(push('b')); // local drift → 2
    unreadServer = 5; // server truth
    store.onReconnected();
    expect(store.unreadCount()).toBe(5);
  });

  it('caps the badge text at 99+ (exact boundary: 99 stays "99") and hides below 1', () => {
    const store = make();
    expect(store.badgeText()).toBe('0');
    expect(store.hasUnread()).toBe(false);
    for (let i = 0; i < 99; i++) store.onLiveNotification(push(`x${i}`));
    expect(store.unreadCount()).toBe(99);
    expect(store.badgeText()).toBe('99'); // A2 — 99 is NOT capped
    expect(store.hasUnread()).toBe(true);
    store.onLiveNotification(push('x99')); // → 100
    expect(store.badgeText()).toBe('99+');
  });

  it('exposes the exact count to assistive tech regardless of the cap', () => {
    const store = make();
    store.onLiveNotification(push('a'));
    expect(store.srCountLabel()).toBe('1 unread notification');
    store.onLiveNotification(push('b'));
    expect(store.srCountLabel()).toBe('2 unread notifications');
  });

  it('reset() clears the count and recent buffer (logout leakage guard)', () => {
    const store = make();
    store.onLiveNotification(push('a'));
    store.reset();
    expect(store.unreadCount()).toBe(0);
    expect(store.recent()).toEqual([]);
  });
});

describe('NotificationStore (data layer)', () => {
  let markReadOk: boolean;
  let markAllOk: boolean;
  let listItems: NotificationResponse[];
  let pages: Record<number, NotificationResponse[]>;

  function make() {
    markReadOk = true;
    markAllOk = true;
    listItems = [];
    pages = {};
    TestBed.configureTestingModule({
      providers: [
        {
          provide: NotificationService,
          useValue: {
            unreadCount: () => of(0),
            list: (uiPage: number) =>
              of({
                items: pages[uiPage] ?? listItems,
                totalCount: 40,
                page: uiPage,
                pageSize: 20,
                totalPages: 2,
              }),
            markRead: () => (markReadOk ? of(undefined) : throwError(() => new Error('x'))),
            markAllRead: () => (markAllOk ? of(undefined) : throwError(() => new Error('x'))),
          },
        },
        { provide: RealtimeService, useValue: realtimeMock() },
        { provide: AuthStore, useValue: { isAuthenticated: signal(false), can: () => true } },
        { provide: Router, useValue: { navigate: vi.fn().mockResolvedValue(true) } },
        {
          provide: NotificationDeepLink,
          useValue: { resolve: vi.fn().mockResolvedValue(['/projects', 'p1']) },
        },
        { provide: ToastService, useValue: toastMock() },
      ],
    });
    return TestBed.inject(NotificationStore);
  }

  it('loadRecent() maps the server items into the recent buffer', () => {
    const store = make();
    listItems = [push('a'), push('b')];
    store.loadRecent();
    expect(store.recent().map((n) => n.id)).toEqual(['a', 'b']);
    expect(store.loadingRecent()).toBe(false);
  });

  it('loadPage() maps items and propagates the unreadOnly filter', () => {
    const store = make();
    listItems = [push('a')];
    store.loadPage(1, true);
    expect(store.page().items).toHaveLength(1);
    expect(store.page().unreadOnly).toBe(true);
    expect(store.page().loading).toBe(false);
  });

  it('SC-004: paging replaces items with the requested page (each appears once, no accumulation)', () => {
    const store = make();
    pages = { 1: [push('a'), push('b')], 2: [push('c'), push('d')] };
    store.loadPage(1, false);
    expect(store.page().items.map((n) => n.id)).toEqual(['a', 'b']);
    expect(store.page().pageIndex).toBe(1);
    store.loadPage(2, false);
    expect(store.page().items.map((n) => n.id)).toEqual(['c', 'd']); // replaced — no a/b leftover
    expect(store.page().pageIndex).toBe(2);
  });

  it('markRead() optimistically flips read and decrements the count, then persists', () => {
    const store = make();
    store.onLiveNotification(push('a')); // count 1, unread
    store.markRead('a');
    expect(store.unreadCount()).toBe(0);
    expect(store.recent()[0].isUnread).toBe(false);
  });

  it('markRead() rolls back on error', () => {
    const store = make();
    markReadOk = false;
    store.onLiveNotification(push('a')); // count 1
    store.markRead('a'); // optimistic → 0, error → rollback → 1
    expect(store.unreadCount()).toBe(1);
    expect(store.recent()[0].isUnread).toBe(true);
    expect(store.error()).toBeTruthy();
  });

  it('markRead() on an already-read item is a no-op for the count (FR-022)', () => {
    const store = make();
    store.onLiveNotification(push('a', false)); // read, count 0
    store.markRead('a');
    expect(store.unreadCount()).toBe(0);
  });

  it('markAllRead() zeroes the count and flips every item', () => {
    const store = make();
    store.onLiveNotification(push('a'));
    store.onLiveNotification(push('b'));
    store.markAllRead();
    expect(store.unreadCount()).toBe(0);
    expect(store.recent().every((n) => !n.isUnread)).toBe(true);
  });

  it('markAllRead() rolls back on error', () => {
    const store = make();
    markAllOk = false;
    store.onLiveNotification(push('a'));
    store.onLiveNotification(push('b')); // count 2
    store.markAllRead();
    expect(store.unreadCount()).toBe(2);
  });

  it('G1: a mark-read reflects across BOTH surfaces and decrements the count once', () => {
    const store = make();
    listItems = [push('a')];
    store.onLiveNotification(push('a')); // recent has a (unread), count 1
    store.loadPage(1, false); // page.items also has a (unread)
    expect(store.unreadCount()).toBe(1);
    store.markRead('a');
    expect(store.recent()[0].isUnread).toBe(false); // dropdown surface
    expect(store.page().items[0].isUnread).toBe(false); // page surface
    expect(store.unreadCount()).toBe(0); // decremented exactly once
  });

  it('activate() marks the item read and navigates to the resolved deep-link', async () => {
    const store = make();
    store.onLiveNotification(push('a'));
    store.activate(store.recent()[0]);
    expect(store.recent()[0].isUnread).toBe(false); // read applied synchronously
    await Promise.resolve();
    await Promise.resolve();
    expect(TestBed.inject(Router).navigate).toHaveBeenCalledWith(['/projects', 'p1']);
  });

  it('raises a click-through toast on a live arrival', () => {
    const store = make();
    const toast = TestBed.inject(ToastService) as unknown as ReturnType<typeof toastMock>;
    store.onLiveNotification(push('a'));
    expect(toast.show).toHaveBeenCalledTimes(1);
    const arg = toast.show.mock.calls[0][0];
    expect(arg.title).toBe('n-a');
    expect(typeof arg.action?.run).toBe('function');
  });

  it('coalesces a burst into a single summary toast (D8)', () => {
    const store = make();
    const toast = TestBed.inject(ToastService) as unknown as ReturnType<typeof toastMock>;
    for (let i = 0; i < 5; i++) store.onLiveNotification(push(`b${i}`));
    expect(toast.show).toHaveBeenCalledTimes(4); // 3 individual + 1 summary
    expect(toast.show.mock.calls[3][0].title).toBe('New notifications');
  });
});
