import { ChangeDetectionStrategy, Component, inject } from '@angular/core';
import { FormsModule } from '@angular/forms';
import {
  PeraButtonComponent,
  PeraEmptyComponent,
  PeraPaginationComponent,
  PeraSegmentedComponent,
  PeraSkeletonComponent,
  SegmentedOption,
} from '@ds';
import { NotificationItemComponent } from './notification-item.component';
import { NotificationStore } from './notification.store';

/**
 * Full notifications page (feature 002, US3): paginated newest-first list, unread-only filter,
 * per-row mark-read (via activate) and mark-all-read, loading skeleton, and empty states.
 * Composes DS primitives; the store is the single source of truth (consistent with bell/dropdown).
 */
@Component({
  selector: 'app-notifications-page',
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [
    FormsModule,
    PeraButtonComponent,
    PeraEmptyComponent,
    PeraPaginationComponent,
    PeraSegmentedComponent,
    PeraSkeletonComponent,
    NotificationItemComponent,
  ],
  templateUrl: './notifications-page.component.html',
})
export class NotificationsPageComponent {
  protected readonly store = inject(NotificationStore);
  protected readonly pageSize = 20;
  protected readonly skeletonRows = [1, 2, 3, 4, 5, 6];
  protected readonly filterOptions: SegmentedOption[] = [
    { value: false, label: 'All' },
    { value: true, label: 'Unread only' },
  ];

  constructor() {
    this.store.loadPage(1, false);
  }

  onFilterChange(unreadOnly: unknown): void {
    this.store.loadPage(1, unreadOnly === true);
  }

  onPageChange(pageIndex: number): void {
    this.store.loadPage(pageIndex);
  }
}
