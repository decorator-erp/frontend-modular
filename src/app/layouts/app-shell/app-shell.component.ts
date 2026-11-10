import { ChangeDetectionStrategy, Component, inject } from '@angular/core';
import { RouterOutlet } from '@angular/router';
import { LocaleService } from '@platform/i18n';
import { PeraCommandPaletteComponent, PeraToastContainerComponent } from '@ds';
import { GlobalActionsSource, ProjectsCommandSource } from './palette-sources';
import { RouteHistoryService } from '@platform/navigation/route-history.service';
import { NotificationStore } from '@modules/notifications';
import { SidebarComponent } from './sidebar/sidebar.component';
import { TopbarComponent } from './topbar/topbar.component';
import { BottomTabsComponent } from './bottom-tabs/bottom-tabs.component';
import { ShellLayoutService } from './shell-layout.service';

@Component({
  selector: 'app-shell',
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [
    RouterOutlet,
    PeraCommandPaletteComponent,
    PeraToastContainerComponent,
    SidebarComponent,
    TopbarComponent,
    BottomTabsComponent,
  ],
  host: { '(document:keydown)': 'onKeydown($event)' },
  templateUrl: './app-shell.component.html',
})
export class AppShellComponent {
  readonly locale = inject(LocaleService);
  /** RD-1: sidebar collapse, the tablet/phone drawer, the breakpoint and Ctrl+B. */
  readonly layout = inject(ShellLayoutService);
  // Starts recording visited routes for the 404 page's "Recent screens".
  private readonly routeHistory = inject(RouteHistoryService);
  // Bootstrap palette sources — constructors register against CommandPaletteService.
  private readonly globalActions = inject(GlobalActionsSource);
  private readonly projectsSource = inject(ProjectsCommandSource);
  // Instantiate the notification store app-wide so its onInit wires the real-time connection
  // lifecycle (start on auth, resync on reconnect, teardown on logout) before any bell UI exists.
  private readonly notifications = inject(NotificationStore);

  /**
   * Ctrl/⌘+B and Escape for the navbar. Deliberately returns nothing: an Angular event binding whose
   * handler returns `false` calls preventDefault, which blocked typing in every form of the app.
   * `handleKey` calls preventDefault itself, only for the keys it uses.
   */
  onKeydown(event: KeyboardEvent): void {
    this.layout.handleKey(event);
  }
}
