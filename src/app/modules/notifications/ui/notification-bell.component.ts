import { ChangeDetectionStrategy, Component, inject, signal } from '@angular/core';
import { RouterLink } from '@angular/router';
import {
  PeraBadgeComponent,
  PeraDropdownComponent,
  PeraEmptyComponent,
  PeraIconComponent,
  PeraTooltipDirective,
} from '@ds';
import { NotificationItemComponent } from './notification-item.component';
import { NotificationStore } from './notification.store';

/**
 * Topbar notification bell: live unread badge (US1) + recent-notifications dropdown (US2).
 * Composes `pera-dropdown` (CDK overlay, backdrop/Escape close, focus return) with
 * `app-notification-item` rows and `pera-empty`. Recent items load lazily when the panel opens.
 * The badge is capped/hidden and the exact count is exposed to AT via a polite live region.
 */
@Component({
  selector: 'app-notification-bell',
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [
    RouterLink,
    PeraIconComponent,
    PeraBadgeComponent,
    PeraTooltipDirective,
    PeraDropdownComponent,
    PeraEmptyComponent,
    NotificationItemComponent,
  ],
  template: `
    <pera-dropdown [minWidth]="320" (openChange)="onOpenChange($event)">
      <button
        trigger
        type="button"
        class="relative inline-flex items-center justify-center w-7 h-7 text-text-secondary hover:bg-surface-muted cursor-pointer outline-none focus-visible:outline-2 focus-visible:outline-accent"
        peraTooltip="Notifications"
        aria-label="Notifications"
        aria-haspopup="menu"
        [attr.aria-expanded]="open()"
      >
        <pera-icon name="bell" [size]="15" />
        @if (store.hasUnread()) {
          <span class="absolute -top-1 -end-1 pointer-events-none">
            <pera-badge tone="danger" size="micro">{{ store.badgeText() }}</pera-badge>
          </span>
        }
      </button>

      <!--
        Single scroll owner: the panel (pera-dropdown, max-h-80) must NOT scroll, so this column is
        capped below its usable height (max-h-72) and only the list scrolls. Header + footer are
        pinned (shrink-0); the list flexes and is the sole overflow container.
      -->
      <div class="font-sans w-[min(20rem,calc(100vw-1rem))] flex flex-col max-h-72">
        <div class="shrink-0 flex items-center justify-between px-3 py-2 border-b border-border">
          <span class="text-sm font-medium text-text-primary">Notifications</span>
          @if (store.hasUnread()) {
            <span class="text-xs text-text-muted">{{ store.srCountLabel() }}</span>
          }
        </div>

        @if (store.loadingRecent()) {
          <div class="shrink-0 px-3 py-6 text-center text-xs text-text-muted">Loading…</div>
        } @else if (store.recent().length) {
          <ul class="flex-1 min-h-0 overflow-y-auto m-0 p-0 list-none">
            @for (n of store.recent(); track n.id) {
              <li>
                <app-notification-item [notification]="n" (activated)="store.activate(n)" />
              </li>
            }
          </ul>
        } @else {
          <div class="shrink-0">
            <pera-empty title="No notifications" description="You're all caught up." />
          </div>
        }

        <a
          routerLink="/notifications"
          class="shrink-0 block px-3 py-2 border-t border-border text-center text-xs font-medium text-accent hover:bg-surface-muted"
          >View all</a
        >
      </div>
    </pera-dropdown>

    <span class="sr-only" role="status" aria-live="polite">{{ store.srCountLabel() }}</span>
  `,
})
export class NotificationBellComponent {
  protected readonly store = inject(NotificationStore);
  /** Mirrors the dropdown's open state for the trigger's aria-expanded. */
  protected readonly open = signal(false);

  onOpenChange(isOpen: boolean): void {
    this.open.set(isOpen);
    if (isOpen) {
      this.store.loadRecent();
    }
  }
}
