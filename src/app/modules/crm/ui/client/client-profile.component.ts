import {
  ChangeDetectionStrategy,
  Component,
  computed,
  effect,
  inject,
  signal,
} from '@angular/core';
import { ActivatedRoute, Router } from '@angular/router';
import { BriefStore } from '../../stores/brief.store';
import { CrmBriefRoundsComponent } from '../brief/brief-rounds.component';
import { PortalItemsComponent } from './portal-items.component';
import { ClientProfileStore } from '../../stores/client-profile.store';
import { MeetingsStore } from '../../stores/meetings.store';
import { CatalogService } from '@platform/i18n/catalog.service';
import type { CatalogKey } from '@platform/i18n/catalog/en';
import { formatCairoDateTime } from '@platform/i18n/intl-locale';
import { CanDirective, PERM } from '@platform/permissions';
import { ApprovalState } from '../../model/crm-enums';
import type { ClientProfileProject } from '../../model';
import { isUnconfirmed, trustChip } from '../trust/trust-chip';
import {
  PeraAlertComponent,
  PeraBadgeComponent,
  PeraButtonComponent,
  PeraCardComponent,
  PeraEmptyComponent,
  PeraProgressBarComponent,
  PeraSpinnerComponent,
  PeraStatusBadgeComponent,
} from '@ds';
import { MEETING_STATUS_CHIP, MEETING_TYPE_KEYS } from '../scheduler/meeting-labels';
import { CrmIdentityCardComponent } from './identity-card.component';
import { CrmSelectionsViewComponent } from '../spaces/selections-view.component';
import { PortalOverviewStore, type PortalClientTab } from '../../stores/portal-overview.store';
import { CrmPortalProgressComponent } from './portal/portal-progress.component';
import { CrmPortalSectionTabComponent } from './portal/portal-section-tab.component';

const PROJECT_STATUS_KEYS: Readonly<Record<string, CatalogKey>> = {
  Draft: 'projects.status.Draft',
  InProgress: 'projects.status.InProgress',
  OnHold: 'projects.status.OnHold',
  Completed: 'projects.status.Completed',
  Cancelled: 'projects.status.Cancelled',
};

type BaseTab = 'overview' | 'brief' | 'requirements' | 'meetings';
/** crmp P2-B: the portal section tabs join the four base tabs when their section is on. */
type ProfileTab = BaseTab | PortalClientTab;
const BASE_TABS: BaseTab[] = ['overview', 'brief', 'requirements', 'meetings'];
const PORTAL_TABS: PortalClientTab[] = ['progress', 'files', 'gallery', 'tasks', 'updates'];

/**
 * The client profile (T109–T112, FR-028) — identity card, organized contacts (the
 * primary badge), and **adaptive projects**: one project renders flat, several render
 * as cards with the selected one's data beneath. Per project: overview / brief /
 * requirements / meetings tabs, plus quick actions.
 *
 * crmp C-2: backed by `GET /api/crm/portal/profile` through `ClientProfileStore`. A 404
 * (no linked client) / 403 (not a client) shows its catalog message; any other failure
 * shows a retry. Read-only — the backend maps no profile edit route (DEVIATION-12).
 */
@Component({
  selector: 'app-crm-client-profile',
  changeDetection: ChangeDetectionStrategy.OnPush,
  providers: [ClientProfileStore, BriefStore, MeetingsStore, PortalOverviewStore],
  imports: [
    PortalItemsComponent,
    PeraAlertComponent,
    PeraBadgeComponent,
    PeraButtonComponent,
    PeraCardComponent,
    PeraEmptyComponent,
    PeraProgressBarComponent,
    PeraSpinnerComponent,
    PeraStatusBadgeComponent,
    CrmIdentityCardComponent,
    CanDirective,
    CrmSelectionsViewComponent,
    CrmBriefRoundsComponent,
    CrmPortalProgressComponent,
    CrmPortalSectionTabComponent,
  ],
  host: { class: 'flex flex-col gap-4' },
  template: `
    @if (profile.loading() && !profile.loaded()) {
      <div class="flex justify-center py-8"><pera-spinner /></div>
    } @else if (profile.error(); as errorKey) {
      <pera-alert tone="warning">{{ catalog.t(errorKey) }}</pera-alert>
      @if (errorKey === 'client.profileUnavailable') {
        <div>
          <pera-button variant="secondary" size="sm" (click)="profile.load()">{{
            catalog.t('client.profileRetry')
          }}</pera-button>
        </div>
      }
    } @else {
      @if (profile.client(); as identity) {
        <app-crm-identity-card [identity]="identity" />
      }

      <pera-card>
        <div class="flex flex-col gap-3 p-1">
          <span class="font-semibold fs-body-sm text-text-primary">{{
            catalog.t('client.contacts')
          }}</span>
          @if (profile.contacts().length) {
            <ul class="flex flex-col gap-2 m-0 p-0 list-none">
              @for (c of profile.contacts(); track c.id) {
                <li class="flex items-center justify-between gap-2 fs-body-sm">
                  <span class="text-text-primary">{{ c.firstName }} {{ c.lastName }}</span>
                  @if (c.isPrimary) {
                    <pera-badge tone="accent" size="micro">{{
                      catalog.t('client.primaryChip')
                    }}</pera-badge>
                  }
                </li>
              }
            </ul>
          } @else {
            <pera-empty [title]="catalog.t('client.contacts')" />
          }
        </div>
      </pera-card>

      @if (profile.projects().length === 0) {
        <pera-card>
          <pera-empty [title]="catalog.t('client.myProjects')" />
        </pera-card>
      } @else {
        @if (profile.isSingleProject()) {
          <p class="fs-caption text-text-secondary m-0">{{ catalog.t('client.singleProjBan') }}</p>
        } @else {
          <div>
            <span class="font-semibold fs-body-sm text-text-primary">{{
              catalog.t('client.myProjects')
            }}</span>
            <p class="fs-caption text-text-secondary mt-1 mb-2">
              {{ catalog.t('client.myProjectsSub') }}
            </p>
            <div class="grid grid-cols-1 gap-2">
              @for (p of profile.projects(); track p.id) {
                <button
                  type="button"
                  (click)="selectedProjectId.set(p.id)"
                  class="text-start p-3 border cursor-pointer transition-colors fs-body-sm
                         outline-none focus-visible:outline-2 focus-visible:outline-accent"
                  [class.border-accent]="selectedProjectId() === p.id"
                  [class.bg-accent-soft]="selectedProjectId() === p.id"
                  [class.border-border]="selectedProjectId() !== p.id"
                  [class.bg-surface]="selectedProjectId() !== p.id"
                >
                  <span class="font-medium text-text-primary">{{ p.name }}</span>
                  <span class="block fs-caption text-text-secondary">{{ p.code }}</span>
                </button>
              }
            </div>
          </div>
        }

        @if (selectedProject(); as project) {
          <pera-card>
            <div class="flex flex-col gap-3 p-1">
              <div class="flex flex-wrap gap-2 border-b border-border">
                @for (tab of tabs(); track tab) {
                  <button
                    type="button"
                    [attr.aria-current]="activeTab() === tab ? 'true' : null"
                    [attr.data-tab]="tab"
                    (click)="selectedTab.set(tab)"
                    class="px-2 py-2 fs-body-sm cursor-pointer border-b-2 -mb-px
                           outline-none focus-visible:outline-2 focus-visible:outline-accent"
                    [class.border-accent]="activeTab() === tab"
                    [class.text-text-primary]="activeTab() === tab"
                    [class.border-transparent]="activeTab() !== tab"
                    [class.text-text-secondary]="activeTab() !== tab"
                  >
                    {{ catalog.t(tabLabel(tab)) }}
                  </button>
                }
              </div>

              @switch (activeTab()) {
                @case ('overview') {
                  <dl class="flex flex-col gap-2 fs-body-sm m-0">
                    <div class="flex items-center justify-between gap-3">
                      <dt class="text-text-secondary">{{ catalog.t('common.status') }}</dt>
                      <dd class="text-text-primary m-0" data-testid="project-status">
                        {{ statusLabel(project.status) }}
                      </dd>
                    </div>
                    @if (project.activeStageName) {
                      <div class="flex items-center justify-between gap-3">
                        <dt class="text-text-secondary">{{ catalog.t('client.activeStage') }}</dt>
                        <dd class="text-text-primary m-0" dir="auto">
                          {{ project.activeStageName }}
                        </dd>
                      </div>
                    }
                    <div class="flex flex-col gap-1">
                      <dt class="text-text-secondary">{{ catalog.t('client.progress') }}</dt>
                      <dd class="m-0">
                        <pera-progress-bar [value]="project.progressPercentage" />
                      </dd>
                    </div>
                  </dl>

                  <div class="flex items-center gap-2 pt-2">
                    <pera-button variant="secondary" size="sm" (click)="requestMeeting(project)">{{
                      catalog.t('nav.cSched')
                    }}</pera-button>
                    <!-- 009b #46: the portal item route needs requirements.submit_own. -->
                    <pera-button
                      *peraCan="PERM.requirements.submitOwn"
                      variant="secondary"
                      size="sm"
                      (click)="addRequirement(project)"
                      >{{ catalog.t('nav.cAdd') }}</pera-button
                    >
                  </div>
                }
                @case ('brief') {
                  @if (brief.error(); as message) {
                    <pera-alert tone="warning">{{ message }}</pera-alert>
                  } @else if (brief.nothingSent()) {
                    <pera-empty [title]="catalog.t('client.briefNotSent')" />
                  } @else if (brief.head(); as head) {
                    <div class="flex items-center gap-2">
                      <span
                        [class.pera-unconfirmed]="isUnconfirmedHead()"
                        [attr.data-wm]="isUnconfirmedHead() ? catalog.t('trust.unconfirmed') : null"
                      >
                        <span [class.pera-unconfirmed-content]="isUnconfirmedHead()">
                          {{ catalog.t(headChip().key) }}
                        </span>
                      </span>
                    </div>
                    <!-- crmp C-6: the storefront picks each current entry was sent with (read-only, no notes). -->
                    @for (entry of entriesWithPicks(); track entry.id) {
                      <div class="flex flex-col gap-1 pt-2" data-portal-picks>
                        <span class="fs-body-sm font-medium text-text-primary" dir="auto">{{
                          entry.space?.name || catalog.t('brief.general')
                        }}</span>
                        <span class="fs-caption text-text-muted">{{
                          catalog.t('storefront.snapshotTitle')
                        }}</span>
                        <app-crm-selections-view [selections]="entry.selections" />
                      </div>
                    }
                    <!-- Sync F4d: the client's own rounds (GET /crm/portal/briefs/{id}/rounds). -->
                    @if (brief.rounds().length) {
                      <app-crm-brief-rounds class="pt-2" audience="client" />
                    }
                  } @else {
                    <pera-empty [title]="catalog.t('client.tabBrief')" />
                  }
                }
                @case ('requirements') {
                  <!-- crmp C-1: the portal items read (contract §2.14 #105). -->
                  <app-crm-portal-items [projects]="profile.projects()" />
                }
                @case ('meetings') {
                  @if (meetings.error(); as message) {
                    <!-- FINDING-5-7: a handled 403 on the portal meetings read shows its message. -->
                    <pera-alert tone="warning">{{ message }}</pera-alert>
                  } @else if (meetings.agenda().length) {
                    <ul class="flex flex-col gap-2 m-0 p-0 list-none">
                      @for (m of meetings.agenda(); track m.id) {
                        <li
                          class="flex items-center justify-between gap-2 p-2 border border-border fs-body-sm"
                        >
                          <div class="min-w-0">
                            <div class="text-text-primary">{{ m.title }}</div>
                            <div class="fs-caption text-text-secondary" dir="ltr">
                              {{ catalog.t(MEETING_TYPE_KEYS[m.type]) }} ·
                              {{ m.scheduledAtUtc ? whenLabel(m.scheduledAtUtc) : '—' }}
                            </div>
                          </div>
                          <pera-status-badge
                            [tone]="MEETING_STATUS_CHIP[m.status].tone"
                            [label]="catalog.t(MEETING_STATUS_CHIP[m.status].key)"
                          />
                        </li>
                      }
                    </ul>
                  } @else {
                    <pera-empty [title]="catalog.t('client.tabMeetings')" />
                  }
                }
                <!-- crmp P2-B: the portal sections the office switched on (GET …/overview). -->
                @case ('progress') {
                  @if (portal.loading()) {
                    <pera-spinner />
                  } @else {
                    <app-crm-portal-progress [progress]="portal.overview()?.progress ?? null" />
                  }
                }
                @case ('files') {
                  <app-crm-portal-section-tab [projectId]="project.id" section="files" />
                }
                @case ('gallery') {
                  <app-crm-portal-section-tab [projectId]="project.id" section="gallery" />
                }
                @case ('tasks') {
                  <app-crm-portal-section-tab [projectId]="project.id" section="tasks" />
                }
                @case ('updates') {
                  <app-crm-portal-section-tab [projectId]="project.id" section="updates" />
                }
              }
            </div>
          </pera-card>
        }
      }
    }
  `,
})
export class CrmClientProfileComponent {
  private readonly router = inject(Router);
  private readonly route = inject(ActivatedRoute);
  protected readonly catalog = inject(CatalogService);
  protected readonly profile = inject(ClientProfileStore);
  protected readonly brief = inject(BriefStore);
  protected readonly meetings = inject(MeetingsStore);
  protected readonly MEETING_TYPE_KEYS = MEETING_TYPE_KEYS;
  protected readonly MEETING_STATUS_CHIP = MEETING_STATUS_CHIP;
  protected readonly PERM = PERM;

  protected readonly portal = inject(PortalOverviewStore);
  /** The four base tabs, then the portal section tabs that are on for the selected project. */
  protected readonly tabs = computed<ProfileTab[]>(() => [...BASE_TABS, ...this.portal.tabs()]);
  protected readonly selectedProjectId = signal<string | null>(null);
  protected readonly selectedTab = signal<ProfileTab>('overview');
  /** A section tab that is off (or not loaded yet) falls back to the overview. */
  protected readonly activeTab = computed<ProfileTab>(() => {
    const tab = this.selectedTab();
    return this.tabs().includes(tab) ? tab : 'overview';
  });

  protected readonly selectedProject = computed<ClientProfileProject | null>(() => {
    const id = this.selectedProjectId();
    return this.profile.projects().find((p) => p.id === id) ?? null;
  });

  protected readonly isUnconfirmedHead = computed(() => {
    const head = this.brief.head();
    return head ? isUnconfirmed(head.status, false) : false;
  });
  /** crmp C-6: current entries that carry a frozen pick snapshot (#84 `selections`). */
  protected readonly entriesWithPicks = computed(() =>
    this.brief.spaces().filter((e) => e.isCurrent && e.selections.length > 0),
  );
  protected readonly headChip = computed(() => {
    const head = this.brief.head();
    return trustChip(head?.status ?? ApprovalState.Draft, false);
  });

  constructor() {
    effect(() => {
      this.profile.load();
    });

    // crm-prod B1-fe: the approvals inbox's "View" link lands here as `?projectId&tab`.
    const query = this.route.snapshot.queryParamMap;
    const tab = query.get('tab') as ProfileTab | null;
    if (tab && [...BASE_TABS, ...PORTAL_TABS].includes(tab)) this.selectedTab.set(tab);
    const requestedProjectId = query.get('projectId');

    // Default to the single project, or the first card, once the profile lands — or to the
    // project the link named, when it is one of the client's own.
    effect(() => {
      const projects = this.profile.projects();
      if (!this.selectedProjectId() && projects.length) {
        const requested = projects.find((p) => p.id === requestedProjectId);
        this.selectedProjectId.set((requested ?? projects[0]).id);
      }
    });

    let loadedFor: string | null = null;
    effect(() => {
      const id = this.selectedProjectId();
      if (!id || loadedFor === id) return;
      loadedFor = id;
      this.brief.loadAsClient(id);
      this.meetings.loadPortal(id);
      this.portal.load(id);
    });
  }

  protected tabLabel(tab: ProfileTab): CatalogKey {
    switch (tab) {
      case 'overview':
        return 'client.tabOverview';
      case 'brief':
        return 'client.tabBrief';
      case 'requirements':
        return 'client.tabReqs';
      case 'meetings':
        return 'client.tabMeetings';
      default:
        return `cportal.tab.${tab}`;
    }
  }

  /** crmp C-2: `status` is a `ProjectStatus` NAME on the wire; unknown names render as sent. */
  protected statusLabel(status: string): string {
    const key = PROJECT_STATUS_KEYS[status];
    return key ? this.catalog.t(key) : status;
  }

  protected whenLabel(iso: string): string {
    return formatCairoDateTime(iso, this.catalog.locale());
  }

  protected requestMeeting(project: ClientProfileProject): void {
    void this.router.navigate(['/portal/schedule'], { queryParams: { projectId: project.id } });
  }

  protected addRequirement(project: ClientProfileProject): void {
    void this.router.navigate(['/portal/add-requirement'], {
      queryParams: { projectId: project.id },
    });
  }
}
