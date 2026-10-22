import { signal } from '@angular/core';
import { TestBed } from '@angular/core/testing';
import { provideRouter } from '@angular/router';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { AuthStore } from '@platform/auth/auth.store';
import { NotificationStore } from '@modules/notifications';
import { TopbarComponent } from './topbar.component';

/** Spec 005 follow-up (review F3): the restored topbar renders the notification bell. */
describe('TopbarComponent — the notification bell (005)', () => {
  beforeEach(() => {
    // jsdom has no matchMedia; ThemeService reads it for the system colour scheme.
    vi.stubGlobal(
      'matchMedia',
      vi.fn(() => ({
        matches: false,
        addEventListener: vi.fn(),
        removeEventListener: vi.fn(),
        addListener: vi.fn(),
        removeListener: vi.fn(),
      })),
    );
    TestBed.configureTestingModule({
      imports: [TopbarComponent],
      providers: [
        provideRouter([]),
        { provide: AuthStore, useValue: { user: () => ({ userName: 'Mona' }), logout: vi.fn() } },
        {
          provide: NotificationStore,
          useValue: {
            hasUnread: signal(false),
            badgeText: signal('0'),
            srCountLabel: signal('0 unread notifications'),
            recent: signal([]),
            loadingRecent: signal(false),
            loadRecent: vi.fn(),
            activate: vi.fn(),
          },
        },
      ],
    });
  });

  afterEach(() => vi.unstubAllGlobals());

  it('renders <app-notification-bell> in the topbar', () => {
    const fixture = TestBed.createComponent(TopbarComponent);
    fixture.detectChanges();
    const el = fixture.nativeElement as HTMLElement;
    expect(el.querySelector('app-notification-bell')).not.toBeNull();
  });
});
