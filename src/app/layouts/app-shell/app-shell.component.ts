import { ChangeDetectionStrategy, Component, inject, signal } from '@angular/core';
import { RouterOutlet } from '@angular/router';
import { LocaleService } from '@platform/i18n';
import { PeraCommandPaletteComponent, PeraToastContainerComponent } from '@ds';
import {
  GlobalActionsSource,
  // TODO(008): ProjectsCommandSource depends on @shared/api/project-search.service,
  // which lands in modules/projects/data/ at spec 008. Restore this import then.
  // ProjectsCommandSource,
} from './palette-sources';
import { RouteHistoryService } from '@platform/navigation/route-history.service';
import { NotificationStore } from '@modules/notifications';
import { SidebarComponent } from './sidebar/sidebar.component';
import { TopbarComponent } from './topbar/topbar.component';

@Component({
  selector: 'app-shell',
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [
    RouterOutlet,
    PeraCommandPaletteComponent,
    PeraToastContainerComponent,
    SidebarComponent,
    TopbarComponent,
  ],
  templateUrl: './app-shell.component.html',
})
export class AppShellComponent {
  readonly locale = inject(LocaleService);
  readonly mobileDrawerOpen = signal(false);
  // Starts recording visited routes for the 404 page's "Recent screens".
  private readonly routeHistory = inject(RouteHistoryService);
  // Bootstrap palette sources — constructors register against CommandPaletteService.
  private readonly globalActions = inject(GlobalActionsSource);
  // TODO(008): ProjectsCommandSource — see import above.
  // private readonly projectsSource = inject(ProjectsCommandSource);
  // Instantiate the notification store app-wide so its onInit wires the real-time connection
  // lifecycle (start on auth, resync on reconnect, teardown on logout) before any bell UI exists.
  private readonly notifications = inject(NotificationStore);

  toggleMobileDrawer(): void {
    this.mobileDrawerOpen.update((v) => !v);
  }

  closeMobileDrawer(): void {
    this.mobileDrawerOpen.set(false);
  }
}
