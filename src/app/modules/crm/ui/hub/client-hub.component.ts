import { ChangeDetectionStrategy, Component, effect, inject, signal } from '@angular/core';
import { ActivatedRoute, Router, RouterLink } from '@angular/router';
import { CanDirective, PERM, PermissionsService } from '@platform/permissions';
import { CatalogService } from '@platform/i18n/catalog.service';
import { ApprovalState } from '../../model/crm-enums';
import {
  ModalService,
  PeraButtonComponent,
  PeraEmptyComponent,
  PeraPageHeaderComponent,
  PeraSkeletonComponent,
  PeraStatusBadgeComponent,
  PeraTabsComponent,
  TabDef,
} from '@ds';
import { ClientHubStore } from '../../stores/client-hub.store';
import { PeriodStore } from '../../stores/period.store';
import { BriefStore } from '../../stores/brief.store';
import { ItemsStore } from '../../stores/items.store';
import { MeetingsStore } from '../../stores/meetings.store';
import { CrmProjectQuickCreateComponent } from './project-quick-create.component';
import { ClientHubOverviewTabComponent } from './overview-tab.component';
import { ClientHubGatheringTabComponent } from './gathering-tab.component';
import { ClientHubMeetingsTabComponent } from './meetings-tab.component';
import { ClientHubApprovalsTabComponent } from './approvals-tab.component';

type HubTab = 'overview' | 'gathering' | 'meetings' | 'approvals';

/**
 * `/crm/clients/:clientId` — the Client Hub. The client RELATIONSHIP surface: identity,
 * contacts and notes are managed here (they are keyed by `client_id`), while project work
 * — brief, periods, requirement items, spaces, meetings, approvals — is only summarised
 * and linked out to `/crm/projects/:projectId/*`, where its aggregate root lives.
 *
 * The four project stores are still provided here: the tabs read them to render those
 * summaries for the selected project, so the reports cost no extra requests. An `effect()`
 * reloads them whenever `ClientHubStore.selectedProjectId` changes.
 */
@Component({
  selector: 'app-client-hub',
  changeDetection: ChangeDetectionStrategy.OnPush,
  providers: [ClientHubStore, PeriodStore, BriefStore, ItemsStore, MeetingsStore],
  imports: [
    CanDirective,
    RouterLink,
    PeraButtonComponent,
    PeraEmptyComponent,
    PeraPageHeaderComponent,
    PeraSkeletonComponent,
    PeraStatusBadgeComponent,
    PeraTabsComponent,
    ClientHubOverviewTabComponent,
    ClientHubGatheringTabComponent,
    ClientHubMeetingsTabComponent,
    ClientHubApprovalsTabComponent,
  ],
  host: { class: 'block bg-bg min-h-full' },
  template: `
    @if (store.client(); as client) {
      <pera-page-header [title]="store.clientName()">
        <div toolbar class="fs-caption text-text-secondary flex items-center gap-2">
          @if (store.primaryContact(); as pc) {
            <span>{{ catalog.t('hub.primaryContact') }}: {{ pc.firstName }} {{ pc.lastName }}</span>
            @if (pc.phone) {
              <span dir="ltr">· {{ pc.phone }}</span>
            }
          }
          <pera-status-badge
            [tone]="client.isActive ? 'success' : 'neutral'"
            [label]="catalog.t(client.isActive ? 'hub.active' : 'hub.inactive')"
          />
        </div>
        <!--
          These act on project-keyed work, so they LEAVE for the project surface rather
          than jumping to a tab that can no longer do the thing.
        -->
        @if (store.selectedProjectId(); as projectId) {
          <div actions class="flex flex-wrap items-center gap-2">
            <!-- UI-1: each link needs its target's permission. -->
            <pera-button
              *peraCan="PERM.crm.meetings.read"
              variant="secondary"
              [routerLink]="['/crm/projects', projectId, 'scheduler']"
              >{{ catalog.t('hub.scheduleMeeting') }}</pera-button
            >
            <pera-button
              *peraCan="PERM.crm.items.create"
              variant="primary"
              [routerLink]="['/crm/projects', projectId, 'items']"
              >{{ catalog.t('hub.addRequirement') }}</pera-button
            >
          </div>
        }
      </pera-page-header>

      <div class="px-6 pt-4 flex items-center gap-2 flex-wrap">
        <span class="fs-label uppercase tracking-wide text-text-muted">{{
          catalog.t('hub.projectContext')
        }}</span>
        @for (project of store.projects(); track project.trackKey) {
          <button
            type="button"
            class="rounded-full border px-3 py-1 fs-caption cursor-pointer"
            [class.bg-accent]="store.selectedProjectId() === project.id"
            [class.text-on-accent]="store.selectedProjectId() === project.id"
            [class.border-accent]="store.selectedProjectId() === project.id"
            [class.border-border]="store.selectedProjectId() !== project.id"
            (click)="store.selectProject(project.id)"
          >
            {{ project.name }}
          </button>
        }
        <button
          *peraCan="PERM.projects.create"
          type="button"
          class="rounded-full border border-dashed border-border px-3 py-1 fs-caption text-text-muted cursor-pointer"
          (click)="newProject()"
        >
          {{ catalog.t('hub.newProject') }}
        </button>
        @if (store.selectedProject(); as p) {
          @if (p.workflowType === 'FreeStyle') {
            <span class="fs-label text-text-muted ms-auto">{{
              catalog.t('hub.noStageLinked')
            }}</span>
          }
        }
      </div>

      <div class="px-6 pt-3">
        <pera-tabs [tabs]="tabs" [activeId]="activeTab()" (activeChange)="onTabChange($event)" />
      </div>

      @switch (activeTab()) {
        @case ('overview') {
          <div class="p-6"><app-client-hub-overview-tab /></div>
        }
        @case ('gathering') {
          <app-client-hub-gathering-tab />
        }
        @case ('meetings') {
          <app-client-hub-meetings-tab />
        }
        @case ('approvals') {
          <app-client-hub-approvals-tab />
        }
      }
    } @else if (store.error(); as error) {
      <div class="p-6"><pera-empty [title]="catalog.t(error)" /></div>
    } @else {
      <div class="p-6"><pera-skeleton [height]="28" [width]="256" /></div>
    }
  `,
})
export class ClientHubComponent {
  private readonly route = inject(ActivatedRoute);
  private readonly router = inject(Router);
  private readonly modal = inject(ModalService);
  protected readonly catalog = inject(CatalogService);
  protected readonly store = inject(ClientHubStore);
  private readonly period = inject(PeriodStore);
  private readonly brief = inject(BriefStore);
  private readonly items = inject(ItemsStore);
  private readonly meetings = inject(MeetingsStore);
  protected readonly PERM = PERM;
  protected readonly APPROVAL_STATE = ApprovalState;

  private readonly perms = inject(PermissionsService);

  /**
   * UI-1: a tab is offered only when the caller may read what it shows — Gathering: the period, brief
   * and items; Meetings: crm.meetings.read; Approvals: approvals.read. Overview needs only the page.
   */
  protected readonly tabs: TabDef[] = (
    [
      { id: 'overview', label: this.catalog.t('hub.tOverview'), perm: null },
      { id: 'gathering', label: this.catalog.t('hub.tGathering'), perm: PERM.crm.periods.read },
      { id: 'meetings', label: this.catalog.t('hub.tMeetings'), perm: PERM.crm.meetings.read },
      { id: 'approvals', label: this.catalog.t('hub.tApprovals'), perm: PERM.approvals.read },
    ] as (TabDef & { perm: string | null })[]
  )
    .filter((t) => !t.perm || this.perms.can(t.perm))
    .map(({ id, label }) => ({ id, label }));

  protected readonly activeTab = signal<HubTab>(
    (this.tabs.some((t) => t.id === 'gathering') ? 'gathering' : 'overview') as HubTab,
  );

  constructor() {
    const clientId = this.route.snapshot.paramMap.get('clientId') ?? '';
    this.store.load(clientId);

    effect(() => {
      const projectId = this.store.selectedProjectId();
      if (!projectId) return;
      // UI-1: each project-scoped read only with its permission (no 403 toast otherwise).
      if (this.perms.can(PERM.crm.periods.read)) this.period.load(projectId);
      if (this.perms.can(PERM.crm.briefs.read)) this.brief.load(projectId);
      if (this.perms.can(PERM.crm.items.read)) this.items.load(projectId);
      if (this.perms.can(PERM.crm.meetings.read)) this.meetings.load(projectId);
    });
  }

  protected onTabChange(id: string): void {
    this.activeTab.set(id as HubTab);
  }

  protected async newProject(): Promise<void> {
    const client = this.store.client();
    if (!client) return;
    const result = await this.modal
      .open<string | false>(CrmProjectQuickCreateComponent, {
        size: 'md',
        data: { clientId: client.id },
      })
      .afterClosed();
    if (result) {
      // Creating a project FOR a client is legitimately launched from the client page —
      // it spawns the aggregate rather than managing it. But the work then lives on the
      // project, so land there instead of selecting it in a tab that cannot edit it.
      this.store.reloadProjects(true);
      void this.router.navigate(['/crm/projects', result]);
    }
  }
}
