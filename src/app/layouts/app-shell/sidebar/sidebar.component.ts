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
import { PermissionsService } from '@platform/permissions';
import {
  CommandPaletteService,
  PeraAvatarComponent,
  PeraIconComponent,
  PeraKbdComponent,
  PeraTooltipDirective,
} from '@ds';
import { MyAccessGrantsStore } from '@modules/projects';
import { NAV_SECTIONS, NavItem } from '../nav-config';

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
  private readonly permissions = inject(PermissionsService);
  private readonly myGrants = inject(MyAccessGrantsStore);
  readonly palette = inject(CommandPaletteService);

  /**
   * Labelled mode. The desktop rail is permanently icon-only at 56px (v2 DS
   * migration 002, clarification Q3 — no user-facing expand toggle). The mobile
   * off-canvas drawer passes `expanded=true` so touch users still get nav labels
   * (research R3); the desktop `--sidebar-w` token never changes.
   */
  readonly expanded = input(false);

  /** Emitted after a nav link is clicked (lets the mobile drawer close). */
  readonly navigate = output<void>();

  readonly sections = NAV_SECTIONS;
  readonly menuOpen = signal(false);

  readonly userName = computed(() => this.auth.user()?.userName ?? '');
  readonly userEmail = computed(() => this.auth.user()?.email ?? '');

  constructor() {
    // crmp P1-B: "Shared with me" shows only when the caller has grants (one read per user).
    this.myGrants.ensure();
  }

  canAccess(item: NavItem): boolean {
    if (item.when === 'accessGrants' && !this.myGrants.hasAny()) return false;
    if (!item.capability || this.permissions.can(item.capability)) return true;
    return !!item.grantArea && this.myGrants.opensArea(item.grantArea);
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
