import { signal } from '@angular/core';
import { TestBed } from '@angular/core/testing';
import { NotificationEntityType, NotificationType } from '../model/notification-enums';
import { NotificationView } from '../model/notification.model';
import { PermissionsService } from '@platform/permissions/permissions.service';
import { NotificationsPageComponent } from './notifications-page.component';
import { NotificationStore } from './notification.store';

function view(id: string, unread = true): NotificationView {
  return {
    id,
    type: NotificationType.TaskAssigned,
    typeName: 'TaskAssigned',
    title: `Notification ${id}`,
    body: null,
    entityType: NotificationEntityType.ProjectTask,
    entityId: `e-${id}`,
    createdAtUtc: new Date(Date.now() - 3_600_000).toISOString(),
    isUnread: unread,
  };
}

interface PageState {
  items: NotificationView[];
  pageIndex: number;
  totalPages: number;
  totalCount: number;
  unreadOnly: boolean;
  loading: boolean;
}

function setup(pageState: Partial<PageState> = {}, hasUnread = true) {
  const page = signal<PageState>({
    items: [view('a'), view('b')],
    pageIndex: 1,
    totalPages: 2,
    totalCount: 40,
    unreadOnly: false,
    loading: false,
    ...pageState,
  });
  const store = {
    page,
    hasUnread: signal(hasUnread),
    error: signal<string | null>(null),
    loadPage: vi.fn(),
    markAllRead: vi.fn(),
    activate: vi.fn(),
  };
  TestBed.configureTestingModule({
    imports: [NotificationsPageComponent],
    providers: [
      { provide: NotificationStore, useValue: store },
      { provide: PermissionsService, useValue: { can: () => true } },
    ],
  });
  const fixture = TestBed.createComponent(NotificationsPageComponent);
  fixture.detectChanges();
  return { fixture, store, el: fixture.nativeElement as HTMLElement };
}

describe('NotificationsPageComponent', () => {
  it('loads the first page on init', () => {
    const { store } = setup();
    expect(store.loadPage).toHaveBeenCalledWith(1, false);
  });

  it('renders the current page of notifications', () => {
    const { el } = setup();
    expect(el.querySelectorAll('app-notification-item')).toHaveLength(2);
    expect(el.textContent).toContain('Notification a');
  });

  it('shows a skeleton while loading', () => {
    const { el } = setup({ loading: true, items: [] });
    expect(el.querySelector('pera-skeleton')).not.toBeNull();
    expect(el.querySelector('app-notification-item')).toBeNull();
  });

  it('shows a filter-aware empty state when there are no items', () => {
    const { el } = setup({ items: [], totalCount: 0, unreadOnly: true });
    const empty = el.querySelector('pera-empty');
    expect(empty).not.toBeNull();
    expect(empty?.textContent).toContain('No unread notifications');
  });

  it('changing the page requests it from the store', () => {
    const { fixture, store } = setup();
    fixture.componentInstance.onPageChange(2);
    expect(store.loadPage).toHaveBeenCalledWith(2);
  });

  it('toggling the unread filter reloads page 1 with the flag', () => {
    const { fixture, store } = setup();
    fixture.componentInstance.onFilterChange(true);
    expect(store.loadPage).toHaveBeenCalledWith(1, true);
    fixture.componentInstance.onFilterChange(false);
    expect(store.loadPage).toHaveBeenCalledWith(1, false);
  });

  it('offers mark-all-read when there are unread items', () => {
    expect(setup({}, true).el.textContent).toContain('Mark all read');
  });

  it('hides mark-all-read when nothing is unread', () => {
    expect(setup({}, false).el.textContent).not.toContain('Mark all read');
  });
});
