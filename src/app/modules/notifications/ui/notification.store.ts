import { computed, effect, inject } from '@angular/core';
import { Router } from '@angular/router';
import {
  patchState,
  signalStore,
  withComputed,
  withHooks,
  withMethods,
  withState,
} from '@ngrx/signals';
import { AuthStore } from '@platform/auth/auth.store';
import { ToastService } from '@platform/feedback/toast.service';
import { NotificationService } from '../data/notification.service';
import {
  mapNotification,
  NotificationResponse,
  NotificationView,
} from '../model/notification.model';
import { RealtimeService, RealtimeStatus } from '@platform/realtime/realtime.service';
import { NotificationDeepLink } from './notification-deep-link';

/**
 * Root notification store — the single source of truth shared by the topbar bell/badge, the
 * dropdown, the `/notifications` page, and the live toasts (feature 002).
 *
 * Layers: the **connection layer** (Phase 3) owns the unread count, recent buffer, and real-time
 * lifecycle + resync; the **data layer** (Phase 4) adds the paged list, optimistic mark-read /
 * mark-all-read (with rollback), and a minimal `activate()` (upgraded to precise deep-linking in
 * US4/Phase 8). `activate` and every mark are cross-surface by construction — one store instance.
 *
 * C1 (analyze finding): the SignalR callback + reconnect handlers are registered in `onInit`
 * BEFORE the auth-bound lifecycle effect calls `start()`, so no push can slip through unhandled.
 */
interface NotificationPageState {
  items: NotificationView[];
  /** 1-based (app convention; the api service converts the wire's 0-based page). */
  pageIndex: number;
  totalPages: number;
  totalCount: number;
  unreadOnly: boolean;
  loading: boolean;
}

interface NotificationState {
  unreadCount: number;
  /** Most-recent notifications buffered for the dropdown; grows via live pushes. */
  recent: NotificationView[];
  loadingRecent: boolean;
  page: NotificationPageState;
  connection: RealtimeStatus;
  error: string | null;
}

const INITIAL_PAGE: NotificationPageState = {
  items: [],
  pageIndex: 1,
  totalPages: 0,
  totalCount: 0,
  unreadOnly: false,
  loading: false,
};

const INITIAL: NotificationState = {
  unreadCount: 0,
  recent: [],
  loadingRecent: false,
  page: INITIAL_PAGE,
  connection: 'disconnected',
  error: null,
};

/** Dropdown shows a bounded recent subset; full history is on the page. */
const RECENT_SIZE = 10;
const PAGE_SIZE = 20;
/** SignalR server→client callback method name (verified backend contract). */
const RECEIVE_METHOD = 'ReceiveNotification';

/** Flip a single item to read across a list (immutably); no-op if absent. */
function markOne(items: NotificationView[], id: string): NotificationView[] {
  return items.map((n) => (n.id === id && n.isUnread ? { ...n, isUnread: false } : n));
}

/** Flip every item to read across a list. */
function markAll(items: NotificationView[]): NotificationView[] {
  return items.map((n) => (n.isUnread ? { ...n, isUnread: false } : n));
}

export const NotificationStore = signalStore(
  { providedIn: 'root' },
  withState<NotificationState>(INITIAL),
  withComputed((store) => ({
    /** Capped display value (FR-003); render is gated by `hasUnread`. */
    badgeText: computed(() => (store.unreadCount() > 99 ? '99+' : String(store.unreadCount()))),
    /** Whether to render the badge at all (FR-004). */
    hasUnread: computed(() => store.unreadCount() > 0),
    /** Exact count for assistive tech, independent of the capped visual (FR-026). */
    srCountLabel: computed(() => {
      const n = store.unreadCount();
      return `${n} unread notification${n === 1 ? '' : 's'}`;
    }),
  })),
  withMethods(
    (
      store,
      api = inject(NotificationService),
      router = inject(Router),
      deepLink = inject(NotificationDeepLink),
      toast = inject(ToastService),
    ) => {
      const TOAST_CAP = 3;
      const raised = new Set<number>();
      let summaryId: number | null = null;
      // Prune ids for toasts that have since auto-dismissed, so the cap tracks what's visible.
      const pruneRaised = (): void => {
        const visible = new Set(toast.items().map((t) => t.id));
        for (const id of raised) {
          if (!visible.has(id)) {
            raised.delete(id);
          }
        }
        if (summaryId !== null && !visible.has(summaryId)) {
          summaryId = null;
        }
      };
      return {
        // ── Connection layer (Phase 3) ──
        /** Fetch the authoritative unread total (initial paint + reconnect resync). */
        loadUnreadCount(): void {
          api.unreadCount().subscribe({
            next: (count) => patchState(store, { unreadCount: count, error: null }),
            error: () => patchState(store, { error: 'Could not load the unread count.' }),
          });
        },
        /** Handle a live push: dedupe by id, prepend to recent, bump the count when unread. */
        onLiveNotification(dto: NotificationResponse): void {
          const view = mapNotification(dto);
          if (store.recent().some((n) => n.id === view.id)) {
            return; // already have it (push overlaps a fetched item) — no double count
          }
          patchState(store, (s) => ({
            recent: [view, ...s.recent],
            unreadCount: view.isUnread ? s.unreadCount + 1 : s.unreadCount,
          }));
          // Alert with a click-through toast; coalesce a burst into a single summary (D8, FR-024).
          pruneRaised();
          if (raised.size < TOAST_CAP) {
            raised.add(
              toast.show({
                tone: 'info',
                title: view.title,
                message: view.body ?? view.typeName,
                action: { run: () => this.activate(view) },
              }),
            );
          } else if (summaryId === null) {
            summaryId = toast.show({
              tone: 'info',
              title: 'New notifications',
              message: 'You have several new notifications.',
              action: { run: () => void router.navigate(['/notifications']) },
            });
          }
        },
        /** After an automatic reconnect, trust the server total (SC-001). */
        onReconnected(): void {
          this.loadUnreadCount();
        },
        /** Clear per-user state on logout (no cross-user leakage). Connection owned by the mirror. */
        reset(): void {
          patchState(store, {
            unreadCount: 0,
            recent: [],
            loadingRecent: false,
            page: INITIAL_PAGE,
            error: null,
          });
        },

        // ── Data layer (Phase 4) ──
        /** Load the bounded recent subset for the dropdown. */
        loadRecent(): void {
          patchState(store, { loadingRecent: true });
          api.list(1, RECENT_SIZE).subscribe({
            next: (res) =>
              patchState(store, { recent: res.items.map(mapNotification), loadingRecent: false }),
            error: () =>
              patchState(store, {
                loadingRecent: false,
                error: 'Could not load recent notifications.',
              }),
          });
        },
        /** Load a page of the full history (1-based). */
        loadPage(pageIndex: number, unreadOnly = store.page().unreadOnly): void {
          patchState(store, (s) => ({ page: { ...s.page, loading: true, unreadOnly } }));
          api.list(pageIndex, PAGE_SIZE, unreadOnly).subscribe({
            next: (res) =>
              patchState(store, {
                page: {
                  items: res.items.map(mapNotification),
                  pageIndex: res.page,
                  totalPages: res.totalPages,
                  totalCount: res.totalCount,
                  unreadOnly,
                  loading: false,
                },
              }),
            error: () =>
              patchState(store, (s) => ({
                page: { ...s.page, loading: false },
                error: 'Could not load notifications.',
              })),
          });
        },
        /** Mark one read — optimistic across every surface, rollback on failure (D9). */
        markRead(id: string): void {
          const snapshot = {
            recent: store.recent(),
            pageItems: store.page().items,
            unreadCount: store.unreadCount(),
          };
          const target =
            snapshot.recent.find((n) => n.id === id) ?? snapshot.pageItems.find((n) => n.id === id);
          const wasUnread = target?.isUnread ?? false;
          patchState(store, (s) => ({
            recent: markOne(s.recent, id),
            page: { ...s.page, items: markOne(s.page.items, id) },
            unreadCount: wasUnread ? Math.max(0, s.unreadCount - 1) : s.unreadCount,
          }));
          if (!wasUnread) {
            return; // already read (FR-022) — nothing to persist
          }
          api.markRead(id).subscribe({
            error: () =>
              patchState(store, {
                recent: snapshot.recent,
                page: { ...store.page(), items: snapshot.pageItems },
                unreadCount: snapshot.unreadCount,
                error: 'Could not mark the notification as read.',
              }),
          });
        },
        /** Mark all read — optimistic, rollback on failure (D9). */
        markAllRead(): void {
          const snapshot = {
            recent: store.recent(),
            pageItems: store.page().items,
            unreadCount: store.unreadCount(),
          };
          patchState(store, (s) => ({
            recent: markAll(s.recent),
            page: { ...s.page, items: markAll(s.page.items) },
            unreadCount: 0,
          }));
          api.markAllRead().subscribe({
            error: () =>
              patchState(store, {
                recent: snapshot.recent,
                page: { ...store.page(), items: snapshot.pageItems },
                unreadCount: snapshot.unreadCount,
                error: 'Could not mark all notifications as read.',
              }),
          });
        },
        /**
         * Activate a notification: mark it read, then deep-link to the referenced entity via
         * fetch-on-click resolution (US4). Any failure resolves to the notifications page — never a
         * dead link (SC-002). Marking read happens regardless of navigation (FR-019/022).
         */
        activate(view: NotificationView): void {
          this.markRead(view.id);
          void deepLink.resolve(view).then((commands) => router.navigate(commands));
        },
      };
    },
  ),
  withHooks({
    onInit(store) {
      const realtime = inject(RealtimeService);
      const auth = inject(AuthStore);

      // C1: register handlers FIRST — before any start() — so no push is missed.
      realtime.on<NotificationResponse>(RECEIVE_METHOD, (dto) => store.onLiveNotification(dto));
      realtime.onReconnected(() => store.onReconnected());

      // Mirror transport status into state (sole owner of `connection`).
      effect(() => patchState(store, { connection: realtime.status() }));

      // Lifecycle bound to auth: login, app-init-with-session (initFromStorage), and logout.
      effect(() => {
        if (auth.isAuthenticated()) {
          void realtime.start();
          store.loadUnreadCount();
        } else {
          void realtime.stop();
          store.reset();
        }
      });
    },
  }),
);
