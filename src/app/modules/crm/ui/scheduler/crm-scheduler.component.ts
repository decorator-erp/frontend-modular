import { ChangeDetectionStrategy, Component, OnInit, inject, signal } from '@angular/core';
import { ActivatedRoute } from '@angular/router';
import { CanDirective, PERM } from '@platform/permissions';
import { ProjectService } from '@modules/projects';
import { CatalogService } from '@platform/i18n/catalog.service';
import { Project } from '@modules/projects';
import {
  ModalService,
  PeraAlertComponent,
  PeraButtonComponent,
  PeraPageHeaderComponent,
  PeraSkeletonComponent,
} from '@ds';
import { MeetingsStore } from '../../stores/meetings.store';
import { PeriodStore } from '../../stores/period.store';
import { CrmAgendaComponent } from './agenda.component';
import { CrmCancelMeetingComponent } from './cancel-meeting.component';
import { CrmIncomingRequestsComponent } from './incoming-requests.component';
import { CrmProposeSlotsComponent } from './propose-slots.component';
import { CrmRescheduleMeetingComponent } from './reschedule-meeting.component';
import { CrmSlotGridComponent } from './slot-grid.component';

/**
 * `/crm/projects/:projectId/scheduler` — the employee meeting scheduler (B2/US2).
 * Provides its own `MeetingsStore` (feature-scoped, fresh per visit) and a second
 * `PeriodStore` instance purely to resolve the open period id for `propose()`'s
 * optional `periodId` — the dashboard's instance is a different page's DI subtree.
 */
@Component({
  selector: 'app-crm-scheduler',
  changeDetection: ChangeDetectionStrategy.OnPush,
  providers: [MeetingsStore, PeriodStore],
  imports: [
    CanDirective,
    PeraAlertComponent,
    PeraButtonComponent,
    PeraPageHeaderComponent,
    PeraSkeletonComponent,
    CrmIncomingRequestsComponent,
    CrmAgendaComponent,
    CrmSlotGridComponent,
  ],
  host: { class: 'block bg-bg min-h-full' },
  template: `
    @if (project(); as p) {
      <pera-page-header [title]="catalog.t('sched.scheduler')">
        <div toolbar class="fs-caption text-text-secondary">{{ p.name }}</div>
        <div actions>
          <pera-button
            variant="primary"
            *peraCan="PERM.crm.meetings.schedule"
            (click)="openPropose()"
            >{{ catalog.t('sched.emBtn') }}</pera-button
          >
        </div>
      </pera-page-header>
    } @else {
      <div class="p-6"><pera-skeleton [height]="28" [width]="256" /></div>
    }

    <div class="p-6 flex flex-col gap-4">
      @if (meetings.notFound()) {
        <!-- 009b #18 (X-5): the project's meetings are outside the caller's scope (404). -->
        <pera-alert tone="warning">{{ catalog.t('sched.notFound') }}</pera-alert>
      }
      @if (meetings.error(); as error) {
        <!-- 009b #21: a refused slot action (e.g. 403 NotCounterparty) shows its message. -->
        <pera-alert tone="danger">{{ error }}</pera-alert>
      }
      <app-crm-incoming-requests
        [requests]="meetings.incomingRequests()"
        (accept)="meetings.acceptSlot($event)"
        (decline)="meetings.declineSlot($event)"
      />
      <app-crm-agenda
        [rows]="meetings.agenda()"
        (complete)="meetings.complete($event)"
        (noShow)="meetings.noShow($event)"
        (reschedule)="openReschedule($event)"
        (cancelMeeting)="openCancel($event)"
      />
      <div class="bg-surface border border-border rounded-card p-4">
        <p class="fs-caption text-text-secondary mb-2" dir="ltr">{{ catalog.t('sched.sub') }}</p>
        <app-crm-slot-grid [freeSlots]="meetings.freeSlots()" />
      </div>
    </div>
  `,
})
export class CrmSchedulerComponent implements OnInit {
  private readonly route = inject(ActivatedRoute);
  private readonly projects = inject(ProjectService);
  private readonly modal = inject(ModalService);
  protected readonly catalog = inject(CatalogService);
  protected readonly meetings = inject(MeetingsStore);
  private readonly period = inject(PeriodStore);
  protected readonly PERM = PERM;

  protected readonly projectId = signal('');
  protected readonly project = signal<Project | null>(null);

  ngOnInit(): void {
    const id = this.route.snapshot.paramMap.get('projectId') ?? '';
    this.projectId.set(id);
    this.meetings.load(id);
    this.period.load(id);
    this.projects.getById(id).subscribe((p) => {
      this.project.set(p);
      const fromUtc = new Date().toISOString();
      const toUtc = new Date(Date.now() + 30 * 86_400_000).toISOString();
      this.meetings.loadFreeSlots(id, fromUtc, toUtc);
    });
  }

  protected async openPropose(): Promise<void> {
    if (!this.project()) return;
    const ok = await this.modal
      .open<boolean>(CrmProposeSlotsComponent, {
        size: 'lg',
        data: {
          projectId: this.projectId(),
          periodId: this.period.openPeriod()?.id ?? null,
        },
      })
      .afterClosed();
    if (ok) this.meetings.load(this.projectId());
  }

  protected async openReschedule(meetingId: string): Promise<void> {
    const ok = await this.modal
      .open<boolean>(CrmRescheduleMeetingComponent, {
        size: 'md',
        data: { meetingId, projectId: this.projectId() },
      })
      .afterClosed();
    if (ok) this.meetings.load(this.projectId());
  }

  protected async openCancel(meetingId: string): Promise<void> {
    const ok = await this.modal
      .open<boolean>(CrmCancelMeetingComponent, { size: 'md', data: { meetingId } })
      .afterClosed();
    if (ok) this.meetings.load(this.projectId());
  }
}
