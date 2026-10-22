import { ChangeDetectionStrategy, Component, computed, input, output } from '@angular/core';
import { NotificationView } from '../model/notification.model';
import { formatAbsolute, formatRelative } from './relative-time';

/**
 * Presentational notification row, reused by the dropdown, the page, and (US5) the toast body.
 * Unread is signalled by NON-COLOUR cues — an unread dot (presence/absence), a heavier title, and
 * an sr-only "Unread" label — so it survives grayscale/colour-blind (FR-018/SC-003). Emits
 * `activated` on click/Enter; the parent decides what that does (→ store.activate).
 */
@Component({
  selector: 'app-notification-item',
  changeDetection: ChangeDetectionStrategy.OnPush,
  host: { class: 'block' },
  template: `
    <button
      type="button"
      class="w-full text-start font-sans flex items-start gap-2.5 px-3 py-2.5 hover:bg-surface-muted cursor-pointer outline-none focus-visible:outline-2 focus-visible:outline-accent"
      (click)="activated.emit()"
    >
      <span
        class="mt-1.5 w-1.5 h-1.5 rounded-full shrink-0"
        [class.bg-accent]="notification().isUnread"
        [class.bg-transparent]="!notification().isUnread"
        aria-hidden="true"
      ></span>
      <span class="flex-1 min-w-0">
        <span class="flex items-center gap-2">
          <span
            class="flex-1 truncate text-sm text-text-primary"
            [class.font-semibold]="notification().isUnread"
            [class.font-normal]="!notification().isUnread"
            >{{ notification().title }}</span
          >
          <span class="shrink-0 text-xs text-text-muted" [title]="absolute()">{{
            relative()
          }}</span>
        </span>
        @if (notification().body) {
          <span class="block truncate text-xs text-text-muted mt-0.5">{{
            notification().body
          }}</span>
        }
      </span>
      @if (notification().isUnread) {
        <span class="sr-only">Unread</span>
      }
    </button>
  `,
})
export class NotificationItemComponent {
  readonly notification = input.required<NotificationView>();
  readonly activated = output<void>();

  protected readonly relative = computed(() => formatRelative(this.notification().createdAtUtc));
  protected readonly absolute = computed(() => formatAbsolute(this.notification().createdAtUtc));
}
