import {
  ChangeDetectionStrategy,
  Component,
  computed,
  effect,
  inject,
  signal,
} from '@angular/core';
import { Router } from '@angular/router';
import { BriefStore } from '../../stores/brief.store';
import { ClientProfileStore } from '../../stores/client-profile.store';
import { ItemsStore } from '../../stores/items.store';
import { MeetingsStore } from '../../stores/meetings.store';
import { CatalogService } from '@platform/i18n/catalog.service';
import type { CatalogKey } from '@platform/i18n/catalog/en';
import { formatCairoDateTime } from '@platform/i18n/intl-locale';
import { ApprovalState, RequirementCategory, RequirementPriority } from '../../model/crm-enums';
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

type ProfileTab = 'overview' | 'brief' | 'requirements' | 'meetings';

const CATEGORY_LABEL_KEYS: Record<RequirementCategory, CatalogKey> = {
  [RequirementCategory.SpaceLayout]: 'item.catLayout',
  [RequirementCategory.Style]: 'item.catSelStyle',
  [RequirementCategory.ColorPalette]: 'item.catSelColorPalette',
  [RequirementCategory.Materials]: 'item.catSelMaterials',
  [RequirementCategory.Furniture]: 'item.catFurn1',
  [RequirementCategory.Lighting]: 'item.catLighting',
  [RequirementCategory.Budget]: 'item.catSelBudget',
  [RequirementCategory.Timeline]: 'item.catSelTimeline',
  [RequirementCategory.Technical]: 'item.catSelTechnical',
  [RequirementCategory.Other]: 'common.other',
};
const PRIORITY_LABEL_KEYS: Record<RequirementPriority, CatalogKey> = {
  [RequirementPriority.Low]: 'item.prLow',
  [RequirementPriority.Medium]: 'item.prMed',
  [RequirementPriority.High]: 'item.prHigh',
  [RequirementPriority.Urgent]: 'item.prUrgent',
};

/**
 * The client profile (T109–T112, FR-028) — identity card, organized contacts (the
 * primary badge), and **adaptive projects**: one project renders flat, several render
 * as cards with the selected one's data beneath. Per project: overview / brief /
 * requirements / meetings tabs, plus quick actions.
 *
 * ⚠️ Depends on `ClientProfileStore`, which targets **Dependency 13** — not yet
 * shipped on the backend (see that store's docblock). Until it ships, this screen
 * shows the store's friendly `error()` alert instead of a broken layout; every piece
 * below is built against the real, documented contract so it activates the moment
 * the route lands, with zero further frontend change.
 */
@Component({
  selector: 'app-crm-client-profile',
  changeDetection: ChangeDetectionStrategy.OnPush,
  providers: [ClientProfileStore, BriefStore, ItemsStore, MeetingsStore],
  imports: [
    PeraAlertComponent,
    PeraBadgeComponent,
    PeraButtonComponent,
    PeraCardComponent,
    PeraEmptyComponent,
    PeraProgressBarComponent,
    PeraSpinnerComponent,
    PeraStatusBadgeComponent,
    CrmIdentityCardComponent,
  ],
  host: { class: 'flex flex-col gap-4' },
  template: `
    @if (profile.loading() && !profile.loaded()) {
      <div class="flex justify-center py-8"><pera-spinner /></div>
    } @else if (profile.error()) {
      <pera-alert tone="warning">{{ catalog.t(profile.error()!) }}</pera-alert>
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
              <div class="flex gap-2 border-b border-border">
                @for (tab of tabs; track tab) {
                  <button
                    type="button"
                    (click)="selectedTab.set(tab)"
                    class="px-2 py-2 fs-body-sm cursor-pointer border-b-2 -mb-px
                           outline-none focus-visible:outline-2 focus-visible:outline-accent"
                    [class.border-accent]="selectedTab() === tab"
                    [class.text-text-primary]="selectedTab() === tab"
                    [class.border-transparent]="selectedTab() !== tab"
                    [class.text-text-secondary]="selectedTab() !== tab"
                  >
                    {{ catalog.t(tabLabel(tab)) }}
                  </button>
                }
              </div>

              @switch (selectedTab()) {
                @case ('overview') {
                  <dl class="flex flex-col gap-2 fs-body-sm m-0">
                    <div class="flex items-center justify-between gap-3">
                      <dt class="text-text-secondary">{{ catalog.t('common.status') }}</dt>
                      <dd class="text-text-primary m-0">{{ project.status }}</dd>
                    </div>
                    @if (project.productOwnerName) {
                      <div class="flex items-center justify-between gap-3">
                        <dt class="text-text-secondary">{{ catalog.t('sched.coordLbl') }}</dt>
                        <dd class="text-text-primary m-0">{{ project.productOwnerName }}</dd>
                      </div>
                    }
                    <div class="flex flex-col gap-1">
                      <dt class="text-text-secondary">{{ catalog.t('common.inProgress') }}</dt>
                      <dd class="m-0">
                        <pera-progress-bar [value]="project.progressPercentage" />
                      </dd>
                    </div>
                  </dl>

                  <div class="flex items-center gap-2 pt-2">
                    <pera-button variant="secondary" size="sm" (click)="requestMeeting(project)">{{
                      catalog.t('nav.cSched')
                    }}</pera-button>
                    <pera-button variant="secondary" size="sm" (click)="addRequirement(project)">{{
                      catalog.t('nav.cAdd')
                    }}</pera-button>
                  </div>
                }
                @case ('brief') {
                  @if (brief.head(); as head) {
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
                  } @else {
                    <pera-empty [title]="catalog.t('client.tabBrief')" />
                  }
                }
                @case ('requirements') {
                  @if (items.items().length) {
                    <ul class="flex flex-col gap-2 m-0 p-0 list-none">
                      @for (item of items.items(); track item.id) {
                        <li
                          [class.pera-unconfirmed]="isUnconfirmedItem(item.approvalStatus)"
                          [attr.data-wm]="
                            isUnconfirmedItem(item.approvalStatus)
                              ? catalog.t('trust.unconfirmed')
                              : null
                          "
                        >
                          <div
                            [class.pera-unconfirmed-content]="
                              isUnconfirmedItem(item.approvalStatus)
                            "
                            class="flex items-center justify-between gap-2 p-2 border border-border fs-body-sm"
                          >
                            <div class="min-w-0">
                              <div class="text-text-primary">{{ item.title }}</div>
                              <div class="fs-caption text-text-secondary">
                                {{ catalog.t(categoryLabel(item.category)) }} ·
                                {{ catalog.t(priorityLabel(item.priority)) }}
                              </div>
                            </div>
                          </div>
                        </li>
                      }
                    </ul>
                  } @else {
                    <pera-empty [title]="catalog.t('client.tabReqs')" />
                  }
                }
                @case ('meetings') {
                  @if (meetings.agenda().length) {
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
  protected readonly catalog = inject(CatalogService);
  protected readonly profile = inject(ClientProfileStore);
  protected readonly brief = inject(BriefStore);
  protected readonly items = inject(ItemsStore);
  protected readonly meetings = inject(MeetingsStore);
  protected readonly MEETING_TYPE_KEYS = MEETING_TYPE_KEYS;
  protected readonly MEETING_STATUS_CHIP = MEETING_STATUS_CHIP;

  protected readonly tabs: ProfileTab[] = ['overview', 'brief', 'requirements', 'meetings'];
  protected readonly selectedProjectId = signal<string | null>(null);
  protected readonly selectedTab = signal<ProfileTab>('overview');

  protected readonly selectedProject = computed<ClientProfileProject | null>(() => {
    const id = this.selectedProjectId();
    return this.profile.projects().find((p) => p.id === id) ?? null;
  });

  protected readonly isUnconfirmedHead = computed(() => {
    const head = this.brief.head();
    return head ? isUnconfirmed(head.status, false) : false;
  });
  protected readonly headChip = computed(() => {
    const head = this.brief.head();
    return trustChip(head?.status ?? ApprovalState.Draft, false);
  });

  constructor() {
    effect(() => {
      this.profile.load();
    });

    // Default to the single project, or the first card, once the profile lands.
    effect(() => {
      const projects = this.profile.projects();
      if (!this.selectedProjectId() && projects.length) {
        this.selectedProjectId.set(projects[0].id);
      }
    });

    let loadedFor: string | null = null;
    effect(() => {
      const id = this.selectedProjectId();
      if (!id || loadedFor === id) return;
      loadedFor = id;
      this.brief.loadAsClient(id);
      this.items.loadPortal(id);
      this.meetings.loadPortal(id);
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
    }
  }

  protected categoryLabel(c: RequirementCategory): CatalogKey {
    return CATEGORY_LABEL_KEYS[c];
  }
  protected priorityLabel(p: RequirementPriority): CatalogKey {
    return PRIORITY_LABEL_KEYS[p];
  }
  protected isUnconfirmedItem(status: number): boolean {
    return isUnconfirmed(status, false);
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
