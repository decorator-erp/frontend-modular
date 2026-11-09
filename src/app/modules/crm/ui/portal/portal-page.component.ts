import { ChangeDetectionStrategy, Component, computed, inject, signal } from '@angular/core';
import { ActivatedRoute, RouterLink } from '@angular/router';
import { catchError, of } from 'rxjs';
import { ProjectService, type Project } from '@modules/projects';
import { CatalogService } from '@platform/i18n/catalog.service';
import { PERM, PermissionsService } from '@platform/permissions';
import { PeraAlertComponent, PeraPageHeaderComponent, PeraTabsComponent, type TabDef } from '@ds';
import { PortalSharesStore } from '../../stores/portal-shares.store';
import { CrmPortalPreviewPanelComponent } from './portal-preview-panel.component';
import { CrmPortalSettingsPanelComponent } from './portal-settings-panel.component';
import { CrmPortalSharesPanelComponent } from './portal-shares-panel.component';
import { CrmPortalUpdatesPanelComponent } from './portal-updates-panel.component';

type PortalTab = 'sections' | 'shared' | 'updates' | 'preview';

/**
 * crmp P2-B: `/crm/projects/:projectId/portal` — what the client sees of this project. Four tabs:
 * the section switches, "Shared with client", the client updates and "Preview as client". Reads
 * need `crm.portal.manage` or `clients.read`; every write needs `crm.portal.manage` (gated with
 * `@if`, and a read-only notice without it). An unknown or foreign project (404) shows the 404 state.
 */
@Component({
  selector: 'app-crm-portal-page',
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [
    RouterLink,
    PeraAlertComponent,
    PeraPageHeaderComponent,
    PeraTabsComponent,
    CrmPortalPreviewPanelComponent,
    CrmPortalSettingsPanelComponent,
    CrmPortalSharesPanelComponent,
    CrmPortalUpdatesPanelComponent,
  ],
  host: { class: 'block bg-bg min-h-full' },
  template: `
    <pera-page-header [title]="catalog.t('pportal.title')">
      <div toolbar class="fs-caption text-text-secondary">
        @if (project(); as p) {
          <span dir="auto">{{ p.name }}</span> ·
        }
        <a class="text-accent hover:underline" [routerLink]="['/crm/projects', projectId]">{{
          catalog.t('route.requirementGathering')
        }}</a>
      </div>
    </pera-page-header>

    <div class="p-6 flex flex-col gap-4">
      @if (!canRead()) {
        <pera-alert tone="warning">{{ catalog.t('pportal.pickNoAccess') }}</pera-alert>
      } @else if (notFound()) {
        <pera-alert tone="warning" data-testid="portal-not-found">{{
          catalog.t('pportal.notFound')
        }}</pera-alert>
      } @else {
        <p class="m-0 fs-body-sm text-text-secondary">{{ catalog.t('pportal.subtitle') }}</p>
        @if (!canManage()) {
          <pera-alert tone="info" data-testid="read-only">{{
            catalog.t('pportal.readOnly')
          }}</pera-alert>
        }
        <pera-tabs [tabs]="tabs()" [activeId]="tab()" (activeChange)="select($event)" />
        <div class="bg-surface border border-border rounded-card p-4">
          @switch (tab()) {
            @case ('sections') {
              <app-crm-portal-settings-panel
                [projectId]="projectId"
                [canManage]="canManage()"
                (notFound)="settingsNotFound.set(true)"
                (saved)="bump()"
              />
            }
            @case ('shared') {
              <app-crm-portal-shares-panel
                [projectId]="projectId"
                [canManage]="canManage()"
                (changed)="bump()"
              />
            }
            @case ('updates') {
              <app-crm-portal-updates-panel
                [projectId]="projectId"
                [canManage]="canManage()"
                (changed)="bump()"
              />
            }
            @case ('preview') {
              <app-crm-portal-preview-panel [projectId]="projectId" [version]="version()" />
            }
          }
        </div>
      }
    </div>
  `,
})
export class CrmPortalPageComponent {
  private readonly permissions = inject(PermissionsService);
  private readonly projects = inject(ProjectService);
  private readonly shares = inject(PortalSharesStore);
  protected readonly catalog = inject(CatalogService);

  protected readonly projectId = inject(ActivatedRoute).snapshot.paramMap.get('projectId') ?? '';

  protected readonly canManage = computed(() =>
    this.permissions.can(PERM.crm.portalVisibility.manage),
  );
  protected readonly canRead = computed(() =>
    this.permissions.can([PERM.crm.portalVisibility.manage, PERM.clients.read]),
  );

  readonly tab = signal<PortalTab>('sections');
  readonly settingsNotFound = signal(false);
  readonly version = signal(0);
  readonly project = signal<Project | null>(null);

  protected readonly notFound = computed(
    () => this.settingsNotFound() || this.shares.state(this.projectId) === 'notFound',
  );

  protected readonly tabs = computed<TabDef[]>(() => [
    { id: 'sections', label: this.catalog.t('pportal.tab.sections') },
    { id: 'shared', label: this.catalog.t('pportal.tab.shared') },
    { id: 'updates', label: this.catalog.t('pportal.tab.updates') },
    { id: 'preview', label: this.catalog.t('pportal.tab.preview') },
  ]);

  constructor() {
    // The header names the project; a failure leaves the name out (the panels show their own states).
    this.projects
      .getById(this.projectId)
      .pipe(catchError(() => of(null)))
      .subscribe((p) => this.project.set(p));
  }

  select(id: string): void {
    this.tab.set(id as PortalTab);
  }

  bump(): void {
    this.version.update((v) => v + 1);
  }
}
