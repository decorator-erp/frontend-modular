import { ChangeDetectionStrategy, Component, effect, inject, signal } from '@angular/core';
import { RouterLink } from '@angular/router';
import { CrmApprovalsService } from '../../data/crm-approvals.service';
import { CatalogService } from '@platform/i18n/catalog.service';
import { formatCairoDateTime } from '@platform/i18n/intl-locale';
import { ApprovalSubjectType } from '../../model/crm-enums';
import type { PendingApproval } from '../../model';
import {
  PeraCardComponent,
  PeraEmptyComponent,
  PeraSkeletonComponent,
  PeraStatusBadgeComponent,
} from '@ds';
import { ClientHubStore } from '../../stores/client-hub.store';
import { BriefStore } from '../../stores/brief.store';
import { ItemsStore } from '../../stores/items.store';

/**
 * Approvals tab (D2) — a READ-ONLY list of what is pending for the selected project.
 *
 * The office pending queue has no project filter on the wire (`GET /api/approvals/pending`
 * is global and paged), so this scopes it client-side to subjects the hub already loaded:
 * the brief head and requirement items.
 *
 * Deciding is NOT done here. Every approval subject is project-keyed, so the decision
 * belongs on the subject's own project surface; each row links there.
 */
@Component({
  selector: 'app-client-hub-approvals-tab',
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [
    RouterLink,
    PeraCardComponent,
    PeraEmptyComponent,
    PeraSkeletonComponent,
    PeraStatusBadgeComponent,
  ],
  template: `
    @if (!hub.selectedProjectId()) {
      <pera-empty
        [title]="catalog.t('hub.noProjectSelected')"
        [description]="catalog.t('hub.pickOrCreateProject')"
      />
    } @else {
      <div class="p-6">
        <pera-card>
          <div class="font-semibold fs-body-sm text-text-primary p-1">
            {{ catalog.t('appr.inbox') }}
          </div>
          @if (loading()) {
            <pera-skeleton [height]="120" />
          } @else if (scopedApprovals().length) {
            <ul class="flex flex-col gap-2 p-1 m-0 list-none">
              @for (a of scopedApprovals(); track a.trackKey) {
                <li class="flex flex-col gap-2 p-3 border border-border rounded-sm">
                  <div class="flex items-center gap-2 flex-wrap">
                    <pera-status-badge tone="info" [label]="subjectLabel(a)" />
                    <span class="fs-body-sm text-text-primary flex-1">{{ subjectTitle(a) }}</span>
                    <!-- 009b #41: dueAtUtc replaces the retired requestedAtUtc. -->
                    @if (a.dueAtUtc) {
                      <span class="fs-label text-text-muted" dir="ltr">{{
                        formatCairoDateTime(a.dueAtUtc, catalog.locale())
                      }}</span>
                    }
                  </div>
                  <!--
                    Deciding happens where the subject lives, not here. NOT linked to the
                    approvals inbox: that lists what is assigned to the CURRENT user, and a
                    client's pending row may sit in someone else's — clicking through would
                    land on an inbox that does not contain it.
                  -->
                  <div class="flex justify-end">
                    <a
                      class="fs-caption text-accent hover:underline"
                      [routerLink]="subjectRoute(a)"
                      >{{ catalog.t('hub.reviewInProject') }}</a
                    >
                  </div>
                </li>
              }
            </ul>
          } @else {
            <pera-empty [title]="catalog.t('appr.empty')" />
          }
        </pera-card>
      </div>
    }
  `,
})
export class ClientHubApprovalsTabComponent {
  private readonly approvalsApi = inject(CrmApprovalsService);
  protected readonly catalog = inject(CatalogService);
  protected readonly hub = inject(ClientHubStore);
  protected readonly brief = inject(BriefStore);
  protected readonly items = inject(ItemsStore);
  protected readonly formatCairoDateTime = formatCairoDateTime;

  protected readonly loading = signal(false);
  protected readonly allPending = signal<PendingApproval[]>([]);
  protected readonly scopedApprovals = signal<PendingApproval[]>([]);

  constructor() {
    effect(() => {
      const projectId = this.hub.selectedProjectId();
      if (!projectId) return;
      this.loading.set(true);
      this.approvalsApi.pending(1, 100).subscribe({
        next: (page) => {
          this.allPending.set(page.items);
          this.loading.set(false);
          this.recompute();
        },
        error: () => this.loading.set(false),
      });
    });

    effect(() => {
      // Recompute the scope whenever the loaded subjects change (brief head / items).
      this.brief.head();
      this.items.items();
      this.recompute();
    });
  }

  private recompute(): void {
    const headId = this.brief.head()?.id;
    const itemIds = new Set(this.items.items().map((i) => i.id));
    this.scopedApprovals.set(
      this.allPending().filter((a) => a.subjectId === headId || itemIds.has(a.subjectId)),
    );
  }

  protected subjectLabel(a: PendingApproval): string {
    return a.subjectType === ApprovalSubjectType.DesignBrief
      ? this.catalog.t('hub.approvalBrief')
      : this.catalog.t('appr.subjectItem');
  }

  protected subjectTitle(a: PendingApproval): string {
    if (a.subjectType === ApprovalSubjectType.DesignBrief) {
      return this.catalog.t('appr.apBriefT');
    }
    const item = this.items.items().find((i) => i.id === a.subjectId);
    return item?.title ?? a.subjectId;
  }

  /**
   * Where the pending thing actually lives. A brief head (or a gathering entry) is managed
   * on the brief page; a requirement item on the items board. Deliberately NOT the
   * approvals inbox — that is scoped to the current user's own assignments.
   */
  protected subjectRoute(a: PendingApproval): (string | number)[] {
    const projectId = this.hub.selectedProjectId() ?? '';
    return a.subjectType === ApprovalSubjectType.RequirementItem
      ? ['/crm/projects', projectId, 'items']
      : ['/crm/projects', projectId, 'brief'];
  }
}
