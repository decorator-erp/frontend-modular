import {
  ChangeDetectionStrategy,
  Component,
  computed,
  inject,
  output,
  signal,
} from '@angular/core';
import { NavigationEnd, Router } from '@angular/router';
import { toSignal } from '@angular/core/rxjs-interop';
import { filter, map, startWith } from 'rxjs/operators';
import { CdkConnectedOverlay, CdkOverlayOrigin } from '@angular/cdk/overlay';
import { AuthStore } from '@platform/auth/auth.store';
import { BreadcrumbService } from '@platform/navigation/breadcrumb.service';
import { ThemeService } from '@platform/theme';
import { LocaleService } from '@platform/i18n';
import { CatalogService } from '@platform/i18n/catalog.service';
import {
  BreadcrumbItem,
  CommandPaletteService,
  PeraAvatarComponent,
  PeraBreadcrumbsComponent,
  PeraIconComponent,
  PeraKbdComponent,
  PeraTooltipDirective,
} from '@ds';
import { NotificationBellComponent } from '@modules/notifications';

@Component({
  selector: 'app-topbar',
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [
    CdkConnectedOverlay,
    CdkOverlayOrigin,
    PeraAvatarComponent,
    PeraBreadcrumbsComponent,
    PeraIconComponent,
    PeraKbdComponent,
    PeraTooltipDirective,
    NotificationBellComponent,
  ],
  templateUrl: './topbar.component.html',
})
export class TopbarComponent {
  private readonly router = inject(Router);
  private readonly auth = inject(AuthStore);
  private readonly breadcrumb = inject(BreadcrumbService);
  private readonly catalog = inject(CatalogService);
  readonly theme = inject(ThemeService);
  readonly locale = inject(LocaleService);
  readonly palette = inject(CommandPaletteService);

  readonly menuToggle = output<void>();

  readonly menuOpen = signal(false);

  private readonly currentBreadcrumb = toSignal(
    this.router.events.pipe(
      filter((e) => e instanceof NavigationEnd),
      startWith(null),
      map(() => this.resolveBreadcrumb()),
    ),
    { initialValue: 'Dashboard' },
  );

  readonly breadcrumbs = computed<BreadcrumbItem[]>(() => {
    const trail = this.breadcrumb.trail();
    // crm-prod L-fe-3: a catalogued crumb follows the ع toggle.
    return trail && trail.length
      ? trail
      : [{ label: this.catalog.label(this.currentBreadcrumb()) }];
  });

  readonly userName = computed(() => this.auth.user()?.userName ?? '');

  private resolveBreadcrumb(): string {
    let route = this.router.routerState.snapshot.root;
    let crumb = '';
    while (route) {
      if (route.data['breadcrumb']) crumb = route.data['breadcrumb'];
      if (!route.firstChild) break;
      route = route.firstChild;
    }
    return crumb || 'PERA';
  }

  async logout(): Promise<void> {
    this.menuOpen.set(false);
    await this.auth.logout();
    await this.router.navigate(['/login']);
  }

  goToProfile(): void {
    this.menuOpen.set(false);
    void this.router.navigate(['/profile']);
  }
}
