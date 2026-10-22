import { signal } from '@angular/core';
import { TestBed } from '@angular/core/testing';
import { provideRouter } from '@angular/router';
import { NotificationBellComponent } from './notification-bell.component';
import { NotificationStore } from './notification.store';

function setup(count: number) {
  const store = {
    hasUnread: signal(count > 0),
    badgeText: signal(count > 99 ? '99+' : String(count)),
    srCountLabel: signal(`${count} unread notification${count === 1 ? '' : 's'}`),
    recent: signal([]),
    loadingRecent: signal(false),
    loadRecent: vi.fn(),
    activate: vi.fn(),
  };
  TestBed.configureTestingModule({
    imports: [NotificationBellComponent],
    providers: [{ provide: NotificationStore, useValue: store }, provideRouter([])],
  });
  const fixture = TestBed.createComponent(NotificationBellComponent);
  fixture.detectChanges();
  return { fixture, store, el: fixture.nativeElement as HTMLElement };
}

describe('NotificationBellComponent', () => {
  it('renders the exact count below the cap (99 → "99")', () => {
    expect(setup(99).el.querySelector('pera-badge')?.textContent?.trim()).toBe('99');
  });

  it('renders the capped value (100 → "99+")', () => {
    expect(setup(100).el.querySelector('pera-badge')?.textContent?.trim()).toBe('99+');
  });

  it('hides the badge when there are no unread notifications', () => {
    expect(setup(0).el.querySelector('pera-badge')).toBeNull();
  });

  it('exposes the exact unread count to assistive tech via a polite live region', () => {
    const live = setup(3).el.querySelector('[aria-live="polite"]');
    expect(live?.getAttribute('role')).toBe('status');
    expect(live?.textContent?.trim()).toBe('3 unread notifications');
  });

  it('the bell control is named and shows a visible focus ring', () => {
    const btn = setup(0).el.querySelector('button')!;
    expect(btn.getAttribute('aria-label')).toBe('Notifications');
    expect(btn.getAttribute('aria-haspopup')).toBe('menu');
    expect(btn.className).toContain('focus-visible:outline');
  });

  it('lazily loads recent notifications when the dropdown opens (only on open)', () => {
    const { fixture, store } = setup(0);
    fixture.componentInstance.onOpenChange(true);
    expect(store.loadRecent).toHaveBeenCalledTimes(1);
    fixture.componentInstance.onOpenChange(false);
    expect(store.loadRecent).toHaveBeenCalledTimes(1);
  });
});
