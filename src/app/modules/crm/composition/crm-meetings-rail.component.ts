import { ChangeDetectionStrategy, Component, effect, inject, input } from '@angular/core';
import { CatalogService } from '@platform/i18n/catalog.service';
import type { WorkspaceHost } from '@platform/composition/task-workspace.token';
import { ModalService, PeraButtonComponent, PeraEmptyComponent } from '@ds';
import { CrmProposeSlotsComponent } from '../ui/scheduler/propose-slots.component';
import { MeetingsStore } from '../stores/meetings.store';
import { PeriodStore } from '../stores/period.store';

/**
 * The linked-meetings rail card (T091/T092, FR-026 amended) — registered at BOTH
 * `stage-rail` and `task-rail`. The organize-meeting composer is the SAME
 * `CrmProposeSlotsComponent` the B2 scheduler uses, reused here rather than forked.
 */
@Component({
  selector: 'app-crm-meetings-rail',
  changeDetection: ChangeDetectionStrategy.OnPush,
  providers: [MeetingsStore, PeriodStore],
  imports: [PeraButtonComponent, PeraEmptyComponent],
  host: { class: 'block' },
  template: `
    <div class="bg-surface border border-border">
      <div class="px-4 py-3 border-b border-border flex items-center justify-between gap-2">
        <span class="font-semibold fs-body-sm text-text-primary">{{
          catalog.t('sched.emLinked')
        }}</span>
        <pera-button variant="secondary" size="xs" (click)="openPropose()">{{
          catalog.t('sched.emBtn')
        }}</pera-button>
      </div>
      <div class="p-4">
        @if (meetings.agenda().length) {
          <ul class="flex flex-col gap-2">
            @for (m of meetings.agenda(); track m.id) {
              <li class="fs-body-sm text-text-primary">{{ m.title }}</li>
            }
          </ul>
        } @else {
          <pera-empty [title]="catalog.t('sched.meetings')" />
        }
      </div>
    </div>
  `,
})
export class CrmMeetingsRailComponent {
  private readonly modal = inject(ModalService);
  protected readonly catalog = inject(CatalogService);
  protected readonly meetings = inject(MeetingsStore);
  private readonly period = inject(PeriodStore);

  readonly host = input.required<WorkspaceHost>();

  constructor() {
    let loaded = false;
    effect(() => {
      const h = this.host();
      if (loaded || !h.projectId) return;
      loaded = true;
      this.meetings.load(h.projectId);
      this.period.load(h.projectId);
    });
  }

  protected async openPropose(): Promise<void> {
    const h = this.host();
    const ok = await this.modal
      .open<boolean>(CrmProposeSlotsComponent, {
        size: 'lg',
        data: {
          projectId: h.projectId,
          periodId: this.period.openPeriod()?.id ?? null,
        },
      })
      .afterClosed();
    if (ok) this.meetings.load(h.projectId);
  }
}
