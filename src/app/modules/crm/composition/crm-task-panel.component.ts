import { ChangeDetectionStrategy, Component, computed, effect, inject, input } from '@angular/core';
import { CatalogService } from '@platform/i18n/catalog.service';
import type { BriefSpace } from '../model';
import type { WorkspaceHost } from '@platform/composition/task-workspace.token';
import { isLocked, isUnconfirmed, trustChip } from '../ui/trust/trust-chip';
import {
  ModalService,
  PeraAlertComponent,
  PeraButtonComponent,
  PeraEmptyComponent,
  PeraStatusBadgeComponent,
} from '@ds';
import { CrmAddEntryFormComponent } from '../ui/brief/add-entry-form.component';
import { CrmBriefHeadComponent } from '../ui/brief/brief-head.component';
import { blockingReason } from './blocking-reason';
import { BriefStore } from '../stores/brief.store';

/**
 * The CRM task workspace (T092, T093, T094) — registered at `task-main`. **REPLACES
 * the generic subtasks checklist** (FR-027) — the host renders its own only when no
 * `task-main` panel claims it. Composes the STAGE's brief head (one brief per
 * project — there is no per-stage brief to distinguish) with THIS TASK's own entries
 * and an add-entry flow. The organize-meeting composer lives at `task-rail`
 * (`CrmMeetingsRailComponent`, shared with `stage-rail`).
 */
@Component({
  selector: 'app-crm-task-panel',
  changeDetection: ChangeDetectionStrategy.OnPush,
  providers: [BriefStore],
  imports: [
    PeraAlertComponent,
    PeraButtonComponent,
    PeraEmptyComponent,
    PeraStatusBadgeComponent,
    CrmBriefHeadComponent,
  ],
  host: { class: 'flex flex-col gap-3.5' },
  template: `
    @if (blockedReason(); as reason) {
      <pera-alert tone="warning">{{ reason }}</pera-alert>
    }

    <app-crm-brief-head />

    <div class="bg-surface border border-border">
      <div class="px-4 py-3 border-b border-border flex items-center justify-between gap-2">
        <span class="font-semibold fs-body-sm text-text-primary">{{
          catalog.t('ws.taskEntries')
        }}</span>
        <div class="flex items-center gap-2">
          <pera-button variant="secondary" size="xs" (click)="openAddEntry()">{{
            catalog.t('brief.addEntry')
          }}</pera-button>
        </div>
      </div>
      <div class="p-4">
        @if (taskEntries().length) {
          <ul class="flex flex-col gap-2">
            @for (entry of taskEntries(); track entry.id) {
              <li
                [class.pera-unconfirmed]="isUnconfirmedEntry(entry)"
                [class.pera-locked]="isLockedEntry(entry)"
                [attr.data-wm]="isUnconfirmedEntry(entry) ? catalog.t('trust.unconfirmed') : null"
              >
                <div
                  [class.pera-unconfirmed-content]="isUnconfirmedEntry(entry)"
                  class="flex items-center justify-between gap-3 p-2 border border-border rounded-sm fs-body-sm"
                >
                  <div class="min-w-0 flex-1">
                    <div class="flex items-center gap-2 flex-wrap">
                      <pera-status-badge
                        [tone]="chipFor(entry).tone"
                        [label]="catalog.t(chipFor(entry).key)"
                      />
                    </div>
                    <div class="fs-caption text-text-secondary" dir="auto">
                      {{ entry.requirements || entryTitle(entry) }}
                    </div>
                  </div>
                </div>
              </li>
            }
          </ul>
        } @else {
          <pera-empty [title]="catalog.t('ws.taskEntries')" />
        }
      </div>
    </div>
  `,
})
export class CrmTaskPanelComponent {
  private readonly modal = inject(ModalService);
  protected readonly catalog = inject(CatalogService);
  protected readonly brief = inject(BriefStore);

  readonly host = input.required<WorkspaceHost>();

  protected readonly taskEntries = computed(() =>
    this.brief.spaces().filter((s) => s.projectTaskId === this.host().id),
  );

  protected readonly blockedReason = computed(() => {
    const crm = this.host().crm;
    if (!crm || !('entryTotal' in crm)) return null;
    return blockingReason(crm, this.catalog);
  });

  protected entryTitle(entry: BriefSpace): string {
    return entry.space ? entry.space.name : this.catalog.t('brief.general');
  }

  protected chipFor(entry: BriefSpace) {
    return trustChip(entry.approvalStatus, false);
  }
  protected isLockedEntry(entry: BriefSpace): boolean {
    return isLocked(entry.approvalStatus, false);
  }
  protected isUnconfirmedEntry(entry: BriefSpace): boolean {
    return isUnconfirmed(entry.approvalStatus, false);
  }

  constructor() {
    let loaded = false;
    effect(() => {
      const h = this.host();
      if (loaded || !h.projectId) return;
      loaded = true;
      this.brief.load(h.projectId);
    });
  }

  protected async openAddEntry(): Promise<void> {
    const head = this.brief.head();
    if (!head) return;
    const ok = await this.modal
      .open<boolean>(CrmAddEntryFormComponent, {
        size: 'md',
        data: {
          projectId: head.projectId,
          briefId: head.id,
          projectTaskId: this.host().id,
        },
      })
      .afterClosed();
    if (ok) this.brief.load(head.projectId);
  }
}
