import { ChangeDetectionStrategy, Component, computed, inject, signal } from '@angular/core';
import { HttpErrorResponse } from '@angular/common/http';
import { RouterLink } from '@angular/router';
import { CatalogService } from '@platform/i18n/catalog.service';
import type { CatalogKey } from '@platform/i18n/catalog/en';
import { formatCairoDateTime } from '@platform/i18n/intl-locale';
import { ErrorHandlerService, friendly } from '@platform/http/error-handler.service';
import {
  PeraAlertComponent,
  PeraButtonComponent,
  PeraEmptyComponent,
  PeraPageHeaderComponent,
  PeraSkeletonComponent,
} from '@ds';
import {
  CrmMyGatheringWorkService,
  MY_GATHERING_WORK_CAP,
  type MyGatheringWorkItem,
} from '../../data/crm-my-gathering-work.service';
import { ApprovalState } from '../../model/crm-enums';

/** One thing waiting on a row, with the screen that resolves it. */
export interface WorkKind {
  kind: 'brief' | 'entries' | 'approvals' | 'period' | 'meeting';
  label: string;
  link: string[];
  urgent: boolean;
}

/** A period closing within this window reads as urgent. */
const SOON_MS = 3 * 24 * 60 * 60 * 1000;

/**
 * crmp C-3: the employee's gathering work (`GET /api/crm/my-gathering-work`, contract §2.18).
 * Each row is one open task assigned to the caller; it lists every kind of work the backend
 * reports on it — a Draft/Rejected brief, entries to send, items awaiting the client, the open
 * period's close date, upcoming meetings — each linking to the CRM screen that resolves it.
 * A non-employee's 403 (`crm.mywork.NotAnEmployee`) shows its catalog message. The server caps
 * the list at 200, so a full 200 says "there may be more".
 */
@Component({
  selector: 'app-crm-my-work',
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [
    RouterLink,
    PeraAlertComponent,
    PeraButtonComponent,
    PeraEmptyComponent,
    PeraPageHeaderComponent,
    PeraSkeletonComponent,
  ],
  host: { class: 'block' },
  template: `
    <pera-page-header [title]="catalog.t('dash.wTasksTitle')" />
    <div class="p-4 flex flex-col gap-3">
      <p class="fs-body-sm text-text-secondary m-0">{{ catalog.t('mywork.sub') }}</p>
      @if (loading() && !loaded()) {
        <div class="flex flex-col gap-2" data-testid="mywork-loading">
          <pera-skeleton [height]="56" />
          <pera-skeleton [height]="56" />
          <pera-skeleton [height]="56" />
        </div>
      } @else if (error(); as message) {
        <pera-alert tone="warning">{{ message }}</pera-alert>
        @if (retryable()) {
          <div>
            <pera-button variant="secondary" size="sm" [disabled]="loading()" (click)="load()">{{
              catalog.t('common.retry')
            }}</pera-button>
          </div>
        }
      } @else if (rows().length === 0) {
        <pera-empty
          [title]="catalog.t('mywork.empty')"
          [description]="catalog.t('mywork.emptyBody')"
        />
      } @else {
        @if (capped()) {
          <pera-alert tone="info">{{ catalog.t('mywork.capped', { n: cap }) }}</pera-alert>
        }
        <ul class="flex flex-col gap-2 m-0 p-0 list-none">
          @for (row of rows(); track row.trackKey) {
            <li
              class="flex flex-col gap-2 p-3 border border-border bg-surface"
              data-testid="mywork-row"
            >
              <div class="flex items-center justify-between gap-3">
                <div class="min-w-0">
                  <div class="font-medium text-text-primary fs-body-sm" dir="auto">
                    {{ row.taskName }}
                  </div>
                  <div class="fs-caption text-text-secondary" dir="auto">
                    {{ row.projectName }}
                    @if (row.stageName) {
                      · {{ row.stageName }}
                    }
                  </div>
                </div>
                <a
                  class="text-accent hover:underline fs-body-sm shrink-0"
                  [routerLink]="['/projects', row.projectId, 'tasks', row.projectTaskId]"
                  >{{ catalog.t('mywork.openTask') }}</a
                >
              </div>
              <div class="flex flex-wrap gap-2">
                @for (k of kinds(row); track k.kind) {
                  <a
                    class="px-2 py-1 fs-caption border hover:underline"
                    [class.border-warning]="k.urgent"
                    [class.text-warning]="k.urgent"
                    [class.border-border]="!k.urgent"
                    [class.text-text-primary]="!k.urgent"
                    [attr.data-kind]="k.kind"
                    [routerLink]="k.link"
                    >{{ k.label }}</a
                  >
                }
              </div>
            </li>
          }
        </ul>
      }
    </div>
  `,
})
export class CrmMyWorkComponent {
  protected readonly catalog = inject(CatalogService);
  private readonly api = inject(CrmMyGatheringWorkService);
  private readonly errors = inject(ErrorHandlerService);

  protected readonly cap = MY_GATHERING_WORK_CAP;
  protected readonly rows = signal<MyGatheringWorkItem[]>([]);
  protected readonly loading = signal(false);
  protected readonly loaded = signal(false);
  protected readonly error = signal<string | null>(null);
  protected readonly retryable = signal(false);
  protected readonly capped = computed(() => this.rows().length >= MY_GATHERING_WORK_CAP);

  constructor() {
    this.load();
  }

  protected load(): void {
    if (this.loading()) return;
    this.loading.set(true);
    this.error.set(null);
    this.api.list().subscribe({
      next: (rows) => {
        this.rows.set(rows);
        this.loading.set(false);
        this.loaded.set(true);
      },
      error: (err: unknown) => {
        const http = err instanceof HttpErrorResponse ? err : new HttpErrorResponse({ status: 0 });
        this.error.set(friendly(this.errors.parse(http)));
        this.retryable.set(http.status !== 403);
        this.loading.set(false);
        this.loaded.set(true);
      },
    });
  }

  /** Every kind of work the backend reports on this row, in a fixed order. */
  protected kinds(row: MyGatheringWorkItem): WorkKind[] {
    const crm = (...tail: string[]) => ['/crm/projects', row.projectId, ...tail];
    const t = (key: CatalogKey, params?: Record<string, string | number>) =>
      this.catalog.t(key, params);
    const block = row.taskBlock;
    const out: WorkKind[] = [];
    if (block.briefStatus === ApprovalState.Draft || block.briefStatus === ApprovalState.Rejected) {
      const rejected = block.briefStatus === ApprovalState.Rejected;
      out.push({
        kind: 'brief',
        label: t(rejected ? 'mywork.briefRejected' : 'mywork.briefDraft'),
        link: crm('brief'),
        urgent: rejected,
      });
    }
    if (block.entryPending > 0) {
      out.push({
        kind: 'entries',
        label: t('mywork.entriesToSend', { n: block.entryPending }),
        link: crm('brief'),
        urgent: false,
      });
    }
    if (block.itemPending > 0) {
      out.push({
        kind: 'approvals',
        label: t('mywork.itemsPending', { n: block.itemPending }),
        link: crm('items'),
        urgent: false,
      });
    }
    if (row.openPeriodClosesAtUtc) {
      const closes = Date.parse(row.openPeriodClosesAtUtc);
      out.push({
        kind: 'period',
        label: t('mywork.periodCloses', { date: this.when(row.openPeriodClosesAtUtc) }),
        link: crm('items'),
        urgent: Number.isFinite(closes) && closes - Date.now() <= SOON_MS,
      });
    }
    if (row.nextMeetingAtUtc || block.meetingsUpcoming > 0) {
      out.push({
        kind: 'meeting',
        label: row.nextMeetingAtUtc
          ? t('mywork.nextMeeting', { date: this.when(row.nextMeetingAtUtc) })
          : t('mywork.meetingsUpcoming', { n: block.meetingsUpcoming }),
        link: crm('scheduler'),
        urgent: false,
      });
    }
    return out;
  }

  private when(iso: string): string {
    return formatCairoDateTime(iso, this.catalog.locale());
  }
}
