import { ChangeDetectionStrategy, Component, inject } from '@angular/core';
import { Router, RouterLink, RouterLinkActive, RouterOutlet } from '@angular/router';
import { AuthStore } from '@platform/auth/auth.store';
import { CatalogService } from '@platform/i18n/catalog.service';
import { LocaleService } from '@platform/i18n/locale.service';
import { ThemeService } from '@platform/theme';
import { PeraIconComponent, PeraTooltipDirective } from '@ds';

interface ClientNavItem {
  path: string;
  icon: string;
  labelKey: 'nav.cProfile' | 'nav.cSched' | 'nav.cAdd' | 'nav.appr';
}

const NAV_ITEMS: ClientNavItem[] = [
  { path: '/portal', icon: 'user', labelKey: 'nav.cProfile' },
  { path: '/portal/schedule', icon: 'calendar', labelKey: 'nav.cSched' },
  { path: '/portal/add-requirement', icon: 'plus', labelKey: 'nav.cAdd' },
  { path: '/portal/approvals', icon: 'inbox', labelKey: 'nav.appr' },
];

/**
 * The client shell (T104, FR-038) — the lightweight layout a Client-role user gets
 * instead of `AppShellComponent`. Mobile-first: a minimal top bar (theme/language,
 * sign out) and a fixed bottom tab bar carrying exactly the four items FR-038 names.
 * **None of the office chrome** — no sidebar, no command palette, no breadcrumbs, no
 * notification bell; those are all `app-shell`-specific and imported nowhere here.
 */
@Component({
  selector: 'app-client-shell',
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [RouterLink, RouterLinkActive, RouterOutlet, PeraIconComponent, PeraTooltipDirective],
  host: { class: 'block min-h-screen h-screen bg-bg text-text-primary font-sans' },
  template: `
    <div class="flex flex-col h-full" [attr.dir]="locale.direction()">
      <header
        class="shrink-0 flex items-center justify-between gap-2 px-4 py-2.5 border-b border-border bg-surface"
      >
        <span class="font-semibold fs-body-sm text-text-primary">PERA</span>
        <div class="flex items-center gap-1">
          <button
            type="button"
            class="inline-flex items-center justify-center w-icon-lg h-icon-lg text-text-secondary hover:bg-surface-muted cursor-pointer outline-none focus-visible:outline-2 focus-visible:outline-accent"
            [peraTooltip]="catalog.t('common.toggleTheme')"
            [attr.aria-label]="catalog.t('common.toggleTheme')"
            (click)="theme.toggle()"
          >
            <pera-icon [name]="theme.theme() === 'dark' ? 'sun' : 'moon'" [size]="15" />
          </button>
          <button
            type="button"
            class="inline-flex items-center justify-center w-icon-lg h-icon-lg font-mono fs-label font-medium text-text-secondary hover:bg-surface-muted cursor-pointer outline-none focus-visible:outline-2 focus-visible:outline-accent"
            [peraTooltip]="catalog.t('common.toggleLanguage')"
            [attr.aria-label]="catalog.t('common.toggleLanguage')"
            (click)="locale.toggle()"
          >
            {{ locale.locale() === 'en' ? 'ع' : 'EN' }}
          </button>
          <button
            type="button"
            class="inline-flex items-center justify-center w-icon-lg h-icon-lg text-text-secondary hover:bg-surface-muted cursor-pointer outline-none focus-visible:outline-2 focus-visible:outline-accent"
            [peraTooltip]="catalog.t('common.logout')"
            [attr.aria-label]="catalog.t('common.logout')"
            (click)="logout()"
          >
            <pera-icon name="log-out" [size]="15" />
          </button>
        </div>
      </header>

      <main class="flex-1 overflow-auto pb-16">
        <div class="mx-auto p-4" [style.max-width.px]="420">
          <router-outlet />
        </div>
      </main>

      <nav
        class="shrink-0 fixed inset-x-0 bottom-0 border-t border-border bg-surface grid grid-cols-4"
      >
        @for (item of navItems; track item.path) {
          <a
            [routerLink]="item.path"
            routerLinkActive="text-accent"
            [routerLinkActiveOptions]="{ exact: item.path === '/portal' }"
            class="flex flex-col items-center gap-1 py-2 fs-label text-text-secondary outline-none focus-visible:outline-2 focus-visible:outline-accent"
          >
            <pera-icon [name]="item.icon" [size]="18" />
            <span>{{ catalog.t(item.labelKey) }}</span>
          </a>
        }
      </nav>
    </div>
  `,
})
export class ClientShellComponent {
  private readonly auth = inject(AuthStore);
  private readonly router = inject(Router);
  protected readonly catalog = inject(CatalogService);
  protected readonly locale = inject(LocaleService);
  protected readonly theme = inject(ThemeService);
  protected readonly navItems = NAV_ITEMS;

  protected async logout(): Promise<void> {
    await this.auth.logout();
    await this.router.navigate(['/login']);
  }
}
