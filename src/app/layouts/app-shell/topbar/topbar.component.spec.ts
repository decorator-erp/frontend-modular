import { Component, signal } from '@angular/core';
import { TestBed } from '@angular/core/testing';
import { Router, provideRouter } from '@angular/router';
import { LocaleService } from '@platform/i18n';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { AuthStore } from '@platform/auth/auth.store';
import { NotificationStore } from '@modules/notifications';
import { TopbarComponent } from './topbar.component';

@Component({ template: '' })
class BlankComponent {}

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
        provideRouter([
          { path: 'projects', component: BlankComponent, data: { breadcrumb: 'route.projects' } },
          { path: 'legacy', component: BlankComponent, data: { breadcrumb: 'Audit log' } },
        ]),
        {
          provide: AuthStore,
          useValue: { user: () => ({ userName: 'Mona' }), logout: vi.fn(), can: () => true },
        },
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

  it('crm-prod L-fe-3: a catalog-key breadcrumb follows the locale; a literal one stays as is', async () => {
    const fixture = TestBed.createComponent(TopbarComponent);
    const router = TestBed.inject(Router);
    const locale = TestBed.inject(LocaleService);
    locale.locale.set('en');
    await router.navigateByUrl('/projects');
    fixture.detectChanges();
    expect(fixture.componentInstance.breadcrumbs().map((b) => b.label)).toEqual(['Projects']);
    locale.locale.set('ar');
    expect(fixture.componentInstance.breadcrumbs().map((b) => b.label)).toEqual(['المشاريع']);
    await router.navigateByUrl('/legacy');
    expect(fixture.componentInstance.breadcrumbs().map((b) => b.label)).toEqual(['Audit log']);
    locale.locale.set('en');
  });
});
