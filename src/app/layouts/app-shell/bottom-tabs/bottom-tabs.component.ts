import { ChangeDetectionStrategy, Component, computed, inject, input, output } from '@angular/core';
import { NavigationEnd, Router, RouterLink, RouterLinkActive } from '@angular/router';
import { toSignal } from '@angular/core/rxjs-interop';
import { filter, map, startWith } from 'rxjs/operators';
import { PERM, PermissionsService } from '@platform/permissions';
import { PeraIconComponent } from '@ds';
import { NAV_ITEMS, type NavItem } from '../nav-config';
import { NavAccessService } from '../nav-access.service';

/** The four daily pages that get a tab, in order; everything else is under "More". */
export const TAB_ROUTES = ['/dashboard', '/projects', '/crm/leads', '/sites'] as const;

/** Short tab labels — the sidebar's full labels do not fit a fifth of a phone. */
const SHORT_LABEL: Record<(typeof TAB_ROUTES)[number], string> = {
  '/dashboard': 'Home',
  '/projects': 'Projects',
  '/crm/leads': 'Leads',
  '/sites': 'Surveys',
};

/**
 * RD-1: the phone's bottom tab bar (the owner's pick for phones). Each tab follows the same
 * permission check as the sidebar, so a page the caller cannot open has no tab; "More" opens
 * the full menu as a drawer.
 */
@Component({
  selector: 'app-bottom-tabs',
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [RouterLink, RouterLinkActive, PeraIconComponent],
  host: { class: 'block' },
  template: `
    <nav
      class="grid border-t border-border bg-surface pb-[var(--safe-bottom)]"
      [style.gridTemplateColumns]="'repeat(' + (tabs().length + 1) + ', minmax(0, 1fr))'"
      aria-label="Main"
    >
      @for (tab of tabs(); track tab.route) {
        <a
          [routerLink]="tab.route"
          routerLinkActive="text-accent font-semibold"
          #rla="routerLinkActive"
          data-tab
          class="h-[var(--tabbar-h)] flex flex-col items-center justify-center gap-1 fs-label text-text-muted outline-none focus-visible:outline-2 focus-visible:outline-accent"
          [attr.aria-current]="rla.isActive ? 'page' : null"
        >
          <span
            class="w-11 h-7 rounded-full grid place-items-center"
            [class.bg-accent-soft]="rla.isActive"
          >
            <pera-icon [name]="tab.icon" [size]="18" />
          </span>
          {{ tab.short }}
        </a>
      }
      <button
        type="button"
        data-tab-more
        class="h-[var(--tabbar-h)] flex flex-col items-center justify-center gap-1 fs-label cursor-pointer outline-none focus-visible:outline-2 focus-visible:outline-accent"
        [class.text-accent]="moreOpen()"
        [class.font-semibold]="moreOpen()"
        [class.text-text-muted]="!moreOpen()"
        [attr.aria-expanded]="moreOpen()"
        aria-label="More — open the full menu"
        (click)="more.emit()"
      >
        <span
          class="w-11 h-7 rounded-full grid place-items-center"
          [class.bg-accent-soft]="moreOpen()"
        >
          <pera-icon name="menu" [size]="18" />
        </span>
        More
      </button>
    </nav>

    <!-- The floating "New project" button, for whoever may create one, except on that page itself. -->
    @if (showNewProject()) {
      <a
        routerLink="/projects/new"
        data-fab-new-project
        class="fixed z-30 end-4 bottom-[calc(var(--tabbar-h)+var(--safe-bottom)+var(--space-4))] w-14 h-14 rounded-2xl bg-accent text-on-accent shadow-lg grid place-items-center outline-none focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-accent"
        aria-label="New project"
      >
        <pera-icon name="plus" [size]="22" />
      </a>
    }
  `,
})
export class BottomTabsComponent {
  private readonly access = inject(NavAccessService);
  private readonly permissions = inject(PermissionsService);
  private readonly url = toSignal(
    inject(Router).events.pipe(
      filter((e) => e instanceof NavigationEnd),
      map((e) => (e as NavigationEnd).urlAfterRedirects),
      startWith(inject(Router).url),
    ),
    { initialValue: '' },
  );

  /** Whether the full-menu drawer is open (highlights "More"). */
  readonly moreOpen = input(false);
  readonly more = output<void>();

  readonly showNewProject = computed(
    () => this.permissions.can(PERM.projects.create) && !this.url().startsWith('/projects/new'),
  );

  readonly tabs = computed(() =>
    TAB_ROUTES.map((route) => NAV_ITEMS.find((i) => i.route === route))
      .filter((i): i is NavItem => !!i && this.access.canAccess(i))
      .map((i) => ({ ...i, short: SHORT_LABEL[i.route as (typeof TAB_ROUTES)[number]] })),
  );
}
