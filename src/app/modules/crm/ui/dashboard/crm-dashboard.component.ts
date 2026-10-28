import {
  ChangeDetectionStrategy,
  Component,
  OnInit,
  computed,
  inject,
  signal,
} from '@angular/core';
import { ActivatedRoute, Router, RouterLink } from '@angular/router';
import { CanDirective, PERM } from '@platform/permissions';
import { CrmItemService } from '../../data/crm-item.service';
import { ProjectService } from '@modules/projects';
import { CatalogService } from '@platform/i18n/catalog.service';
import { formatCairoDateTime } from '@platform/i18n/intl-locale';
import { ApprovalState, MeetingStatus } from '../../model/crm-enums';
import { Project } from '@modules/projects';
import type { RequirementItem } from '../../model';
import {
  ModalService,
  PeraAlertComponent,
  PeraButtonComponent,
  PeraPageHeaderComponent,
  PeraSkeletonComponent,
} from '@ds';
import { MEETING_STATUS_CHIP, MEETING_TYPE_KEYS } from '../scheduler/meeting-labels';
import { MeetingsStore } from '../../stores/meetings.store';
import { PeriodStore } from '../../stores/period.store';
import { CrmActivityEntry, CrmActivityListComponent } from './activity-list.component';
import { CrmItemFormComponent } from './forms/item-form.component';
import { CrmKpiRowComponent } from './kpi-row.component';
import { CrmMeetingsSummaryComponent, CrmMeetingSummaryRow } from './meetings-summary.component';
import { CrmPeriodCardComponent } from './period-card.component';

/**
 * `/crm/projects/:projectId` — the manager CRM dashboard (T039, US1/B1 MVP). Provides
 * `PeriodStore` (feature-scoped — nothing else wires it yet). Composes the period card,
 * KPI row, recent activity and meetings summary, and launches the four B1 forms.
 *
 * **B1 backfill (wired at B2)**: `upcomingMeetings` and the meetings-summary card now
 * read `MeetingsStore` (T046), project-filtered. `pendingApprovals` STAYS an honest zero
 * — `GET /api/approvals/pending` carries no `projectId` to filter by, and the scoped
 * inbox is B6b/T117+. `unconfirmed` was always wired, from the open period's items.
 */
@Component({
  selector: 'app-crm-dashboard',
  changeDetection: ChangeDetectionStrategy.OnPush,
  providers: [PeriodStore, MeetingsStore],
  imports: [
    RouterLink,
    CanDirective,
    PeraAlertComponent,
    PeraButtonComponent,
    PeraPageHeaderComponent,
    PeraSkeletonComponent,
    CrmPeriodCardComponent,
    CrmKpiRowComponent,
    CrmActivityListComponent,
    CrmMeetingsSummaryComponent,
  ],
  host: { class: 'block bg-bg min-h-full' },
  template: `
    @if (project(); as p) {
      <pera-page-header [title]="p.name">
        <div toolbar class="fs-caption text-text-secondary">
          {{ p.code }} · {{ catalog.t('brief.fClient') }}:
          <!--
            The client appears as a LINK, never an editor. Contacts and client master data
            are keyed by client_id and are managed on the client page.
          -->
          <a
            class="text-accent hover:underline"
            [routerLink]="['/crm/clients', p.clientId]"
            dir="auto"
            >{{ p.clientName }}</a
          >
          · {{ catalog.t('sched.coordLbl') }}: {{ p.productOwnerName }} ·
          <!--
            The way back. The PM project page is a LINK too, never an embedded surface —
            project management and requirement gathering are separate workspaces.
          -->
          <a class="text-accent hover:underline" [routerLink]="['/projects', p.id]">{{
            catalog.t('nav.projectPage')
          }}</a>
        </div>
        <div actions class="flex items-center gap-2">
          @if (store.isOpen()) {
            <pera-button
              variant="secondary"
              *peraCan="PERM.crm.items.create"
              (click)="openItemForm()"
              >{{ catalog.t('nav.itemForm') }}</pera-button
            >
          }
          <pera-button
            variant="secondary"
            *peraCan="PERM.crm.meetings.read"
            (click)="openScheduler()"
            >{{ catalog.t('sched.scheduler') }}</pera-button
          >
          <pera-button variant="secondary" *peraCan="PERM.crm.briefs.read" (click)="openBrief()">{{
            catalog.t('nav.brief')
          }}</pera-button>
          <pera-button variant="secondary" *peraCan="PERM.crm.items.read" (click)="openItems()">{{
            catalog.t('nav.items')
          }}</pera-button>
          <!-- Spaces and provisioning were unreachable from here — the project hub should
               link to every one of its work surfaces. -->
          <pera-button variant="secondary" *peraCan="PERM.crm.spaces.read" (click)="openSpaces()">{{
            catalog.t('space.title')
          }}</pera-button>
          <pera-button
            variant="secondary"
            *peraCan="PERM.crm.spaces.read"
            (click)="openProvisioning()"
            >{{ catalog.t('space.provTitle') }}</pera-button
          >
          <pera-button
            variant="secondary"
            *peraCan="PERM.crm.designProfile.read"
            (click)="openDesignProfile()"
            >{{ catalog.t('nav.dProfile') }}</pera-button
          >
        </div>
      </pera-page-header>
    } @else {
      <div class="p-6"><pera-skeleton [height]="28" [width]="256" /></div>
    }

    <div class="p-6 flex flex-col gap-4">
      @if (justClosed()) {
        <pera-alert tone="success">
          <div class="flex items-center gap-3">
            <span class="flex-1">{{ catalog.t('period.closeBan') }}</span>
            <pera-button variant="ghost" size="xs" (click)="justClosed.set(false)">{{
              catalog.t('common.dismiss')
            }}</pera-button>
          </div>
        </pera-alert>
      }

      <app-crm-period-card (closed)="justClosed.set(true)" />
      <app-crm-kpi-row
        [pendingApprovals]="0"
        [upcomingMeetings]="upcomingMeetingsCount()"
        [unconfirmedDraft]="unconfirmedDraft()"
        [unconfirmedPending]="unconfirmedPending()"
      />

      <div class="grid grid-cols-1 lg:grid-cols-2 gap-4">
        <app-crm-activity-list [entries]="activity()" />
        <app-crm-meetings-summary [rows]="meetingsSummaryRows()" />
      </div>
    </div>
  `,
})
export class CrmDashboardComponent implements OnInit {
  private readonly route = inject(ActivatedRoute);
  private readonly router = inject(Router);
  private readonly projects = inject(ProjectService);
  private readonly itemService = inject(CrmItemService);
  private readonly modal = inject(ModalService);
  protected readonly catalog = inject(CatalogService);
  protected readonly store = inject(PeriodStore);
  protected readonly meetings = inject(MeetingsStore);
  protected readonly PERM = PERM;

  protected readonly projectId = signal('');
  protected readonly project = signal<Project | null>(null);
  protected readonly justClosed = signal(false);
  private readonly allItems = signal<RequirementItem[]>([]);

  protected readonly unconfirmedDraft = computed(() =>
    this.itemsInOpenPeriodByStatus(ApprovalState.Draft),
  );
  protected readonly unconfirmedPending = computed(() =>
    this.itemsInOpenPeriodByStatus(ApprovalState.PendingApproval),
  );

  /** B1 backfill (wired now that B2/`MeetingsStore` exists) — upcoming, project-filtered. */
  protected readonly upcomingMeetingsCount = computed(
    () =>
      this.meetings
        .agenda()
        .filter(
          (m) =>
            (m.status === MeetingStatus.Scheduled || m.status === MeetingStatus.Rescheduled) &&
            !!m.scheduledAtUtc &&
            new Date(m.scheduledAtUtc).getTime() > Date.now(),
        ).length,
  );

  /** B1 backfill — the dashboard's meetings-summary card, wired to real data. */
  protected readonly meetingsSummaryRows = computed<CrmMeetingSummaryRow[]>(() => {
    const locale = this.catalog.locale();
    return this.meetings.agenda().map((m) => ({
      id: m.id,
      title: m.title,
      whenLabel: m.scheduledAtUtc ? formatCairoDateTime(m.scheduledAtUtc, locale) : '—',
      typeLabel: this.catalog.t(MEETING_TYPE_KEYS[m.type]),
      statusLabel: this.catalog.t(MEETING_STATUS_CHIP[m.status].key),
      statusTone: MEETING_STATUS_CHIP[m.status].tone,
    }));
  });

  protected readonly activity = computed<CrmActivityEntry[]>(() => {
    const locale = this.catalog.locale();
    const periodEvents: CrmActivityEntry[] = this.store.periods().flatMap((p) => {
      const events: CrmActivityEntry[] = [
        {
          id: `${p.id}-opened`,
          // 009b #25: the response has no createdAtUtc; the entry is ordered by closesAtUtc.
          timestampUtc: p.closesAtUtc,
          label: this.catalog.t('activity.periodOpened', {
            closesAt: formatCairoDateTime(p.closesAtUtc, locale),
          }),
        },
      ];
      if (p.closedAtUtc) {
        events.push({
          id: `${p.id}-closed`,
          timestampUtc: p.closedAtUtc,
          label: this.catalog.t('activity.periodClosed'),
        });
      }
      return events;
    });
    const itemEvents: CrmActivityEntry[] = this.allItems().map((i) => ({
      id: i.id,
      timestampUtc: i.createdAtUtc,
      label: this.catalog.t('activity.itemAdded', { title: i.title }),
    }));
    return [...periodEvents, ...itemEvents]
      .sort((a, b) => b.timestampUtc.localeCompare(a.timestampUtc))
      .slice(0, 8);
  });

  ngOnInit(): void {
    const id = this.route.snapshot.paramMap.get('projectId') ?? '';
    this.projectId.set(id);
    this.store.load(id);
    this.projects.getById(id).subscribe((p) => this.project.set(p));
    this.itemService.search(id, { take: 100 }).subscribe((items) => this.allItems.set(items));
    this.meetings.load(id);
  }

  protected openScheduler(): void {
    void this.router.navigate(['/crm/projects', this.projectId(), 'scheduler']);
  }

  protected openBrief(): void {
    void this.router.navigate(['/crm/projects', this.projectId(), 'brief']);
  }

  protected openItems(): void {
    void this.router.navigate(['/crm/projects', this.projectId(), 'items']);
  }

  protected openSpaces(): void {
    void this.router.navigate(['/crm/projects', this.projectId(), 'spaces']);
  }

  protected openProvisioning(): void {
    void this.router.navigate(['/crm/projects', this.projectId(), 'spaces', 'provisioning']);
  }

  protected openDesignProfile(): void {
    void this.router.navigate(['/crm/designer/projects', this.projectId()]);
  }

  private itemsInOpenPeriodByStatus(status: ApprovalState): number {
    const period = this.store.openPeriod();
    if (!period) return 0;
    return this.allItems().filter((i) => i.periodId === period.id && i.approvalStatus === status)
      .length;
  }

  // Contact and lead creation deliberately do NOT live here.
  //
  // A contact is keyed by `client_id` — creating one from a project page reaches across
  // aggregates by borrowing `clientId` off the loaded project. It belongs on the client
  // page, which already offers it (`hub/overview-tab.component.ts`).
  //
  // A lead is keyed by neither: it precedes both client and project, so a project page is
  // an orphaned home for it. `/crm/leads` is its canonical entry.

  protected async openItemForm(): Promise<void> {
    const period = this.store.openPeriod();
    if (!period) return;
    const ok = await this.modal
      .open<boolean>(CrmItemFormComponent, {
        size: 'md',
        data: { projectId: this.projectId(), periodId: period.id },
      })
      .afterClosed();
    if (ok)
      this.itemService
        .search(this.projectId(), { take: 100 })
        .subscribe((items) => this.allItems.set(items));
  }
}
