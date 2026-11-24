import { NgTemplateOutlet } from '@angular/common';
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
  imports: [NgTemplateOutlet, RouterLink, RouterLinkActive, PeraIconComponent],
  host: { class: 'block' },
  template: `
    <nav
      class="relative grid border-t border-border bg-surface pb-[var(--safe-bottom)]"
      [style.gridTemplateColumns]="'repeat(' + columns() + ', minmax(0, 1fr))'"
      aria-label="Main"
    >
      @for (tab of leadingTabs(); track tab.route) {
        <ng-container *ngTemplateOutlet="tabLink; context: { $implicit: tab }" />
      }

      <!-- OS-2: the create action sits raised in the middle of the bar — New project, or New
           lead while on Leads — for whoever may create one, except on the New project page. -->
      @if (create(); as c) {
        <div class="h-[var(--tabbar-h)] grid place-items-center">
          <a
            [routerLink]="c.route"
            [queryParams]="c.query"
            [attr.data-fab-new-project]="c.kind === 'project' ? '' : null"
            [attr.data-fab-new-lead]="c.kind === 'lead' ? '' : null"
            class="-mt-[var(--space-6)] size-[var(--space-12)] rounded-[var(--radius-card)] bg-accent text-on-accent shadow-lg ring-4 ring-surface grid place-items-center outline-none focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-accent"
            [attr.aria-label]="c.label"
          >
            <pera-icon name="plus" [size]="22" />
          </a>
        </div>
      }

      @for (tab of trailingTabs(); track tab.route) {
        <ng-container *ngTemplateOutlet="tabLink; context: { $implicit: tab }" />
      }
      <button
        type="button"
        data-tab-more
        class="h-[var(--tabbar-h)] flex flex-col items-center justify-center gap-1 fs-label cursor-pointer outline-none focus-visible:outline-2 focus-visible:outline-accent"
        [class.text-accent]="moreOpen()"
        [class.font-bold]="moreOpen()"
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

    <ng-template #tabLink let-tab>
      <a
        [routerLink]="tab.route"
        routerLinkActive="text-accent font-bold"
        #rla="routerLinkActive"
        data-tab
        class="h-[var(--tabbar-h)] flex flex-col items-center justify-center gap-1 fs-label font-semibold text-text-muted outline-none focus-visible:outline-2 focus-visible:outline-accent"
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
    </ng-template>
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

  /**
   * OS-2: the centre create action. On Leads it creates a lead (the list opens its form from
   * `?new=1`); everywhere else it creates a project. Hidden on the New project page itself.
   */
  readonly create = computed<CreateAction | null>(() => {
    const url = this.url();
    if (url.startsWith('/crm/leads') && !url.startsWith('/crm/leads/')) {
      return this.permissions.can(PERM.crm.leads.create)
        ? { kind: 'lead', route: '/crm/leads', query: { new: 1 }, label: 'New lead' }
        : null;
    }
    if (url.startsWith('/projects/new') || !this.permissions.can(PERM.projects.create)) return null;
    return { kind: 'project', route: '/projects/new', query: null, label: 'New project' };
  });

  /** Kept for callers and specs that only ask "is New project offered?". */
  readonly showNewProject = computed(() => this.create()?.kind === 'project');

  readonly tabs = computed(() =>
    TAB_ROUTES.map((route) => NAV_ITEMS.find((i) => i.route === route))
      .filter((i): i is NavItem => !!i && this.access.canAccess(i))
      .map((i) => ({ ...i, short: SHORT_LABEL[i.route as (typeof TAB_ROUTES)[number]] })),
  );

  /** Tabs before the centre action (half of tabs-plus-More, rounded down), and after it. */
  readonly leadingTabs = computed(() => {
    const t = this.tabs();
    return this.create() ? t.slice(0, Math.floor((t.length + 1) / 2)) : t;
  });
  readonly trailingTabs = computed(() => {
    const t = this.tabs();
    return this.create() ? t.slice(Math.floor((t.length + 1) / 2)) : [];
  });
  /** Tabs, the optional centre action, and More. */
  readonly columns = computed(() => this.tabs().length + 1 + (this.create() ? 1 : 0));
}

interface CreateAction {
  kind: 'project' | 'lead';
  route: string;
  query: Record<string, number> | null;
  label: string;
}
