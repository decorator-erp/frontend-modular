import {
  ChangeDetectionStrategy,
  Component,
  computed,
  inject,
  input,
  output,
  signal,
} from '@angular/core';
import { Router, RouterLink, RouterLinkActive } from '@angular/router';
import { CdkConnectedOverlay, CdkOverlayOrigin } from '@angular/cdk/overlay';
import { AuthStore } from '@platform/auth/auth.store';
import {
  CommandPaletteService,
  PeraAvatarComponent,
  PeraIconComponent,
  PeraKbdComponent,
  PeraTooltipDirective,
} from '@ds';
import { NAV_SECTIONS, NavItem } from '../nav-config';
import { NavAccessService } from '../nav-access.service';

@Component({
  selector: 'app-sidebar',
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [
    RouterLink,
    RouterLinkActive,
    CdkConnectedOverlay,
    CdkOverlayOrigin,
    PeraAvatarComponent,
    PeraIconComponent,
    PeraKbdComponent,
    PeraTooltipDirective,
  ],
  templateUrl: './sidebar.component.html',
})
export class SidebarComponent {
  private readonly auth = inject(AuthStore);
  private readonly router = inject(Router);
  private readonly access = inject(NavAccessService);
  readonly palette = inject(CommandPaletteService);

  /**
   * RD-1: `full` is the labelled dark sidebar (desktop, and inside the tablet/phone drawer);
   * `rail` is the 64px icon rail (desktop collapsed by the owner's toggle, and always on tablet).
   */
  readonly mode = input<'full' | 'rail'>('full');
  /** Rendered inside the tablet/phone drawer: drawer width, a close button, no collapse toggle. */
  readonly drawer = input(false);
  /** Shows the "Collapse menu" toggle at the foot of the sidebar (desktop only). */
  readonly collapsible = input(false);

  /** Emitted after a nav link is clicked (lets the drawer close). */
  readonly navigate = output<void>();
  /** The foot toggle was pressed. */
  readonly toggleCollapse = output<void>();
  /** The drawer's close button was pressed. */
  readonly closed = output<void>();

  readonly full = computed(() => this.mode() === 'full');
  readonly width = computed(() =>
    this.drawer()
      ? 'var(--sidebar-drawer-w)'
      : this.full()
        ? 'var(--sidebar-w)'
        : 'var(--sidebar-rail-w)',
  );

  readonly sections = NAV_SECTIONS;
  readonly menuOpen = signal(false);

  readonly userName = computed(() => this.auth.user()?.userName ?? '');
  readonly userEmail = computed(() => this.auth.user()?.email ?? '');

  canAccess(item: NavItem): boolean {
    return this.access.canAccess(item);
  }

  onNavigate(): void {
    this.navigate.emit();
  }

  async logout(): Promise<void> {
    this.menuOpen.set(false);
    await this.auth.logout();
    await this.router.navigate(['/login']);
  }

  goToProfile(): void {
    this.menuOpen.set(false);
    void this.router.navigate(['/profile']);
    this.navigate.emit();
  }
}
