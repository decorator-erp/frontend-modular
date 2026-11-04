import {
  ChangeDetectionStrategy,
  Component,
  ElementRef,
  computed,
  effect,
  inject,
  signal,
  viewChild,
} from '@angular/core';
import { HttpErrorResponse } from '@angular/common/http';
import { FormsModule } from '@angular/forms';
import { RouterLink } from '@angular/router';
import { CrmBriefService } from '../../data/crm-brief.service';
import { CatalogService } from '@platform/i18n/catalog.service';
import { ErrorHandlerService, friendly } from '@platform/http/error-handler.service';
import type { CatalogKey } from '@platform/i18n/catalog/en';
import { formatCairoDate } from '@platform/i18n/intl-locale';
import { CanDirective, PERM } from '@platform/permissions';
import { ApprovalDecision, ApprovalSubjectType } from '../../model/crm-enums';
import {
  PORTAL_APPROVAL_COMMENT_MAX,
  type BriefHeadDiff,
  type BriefSpace,
  type PortalApproval,
} from '../../model';
import {
  PeraAlertComponent,
  PeraButtonComponent,
  PeraCardComponent,
  PeraEmptyComponent,
  PeraFormFieldComponent,
  PeraSkeletonComponent,
  PeraSpinnerComponent,
  PeraStatusBadgeComponent,
  PeraTextareaComponent,
  type StatusBadgeTone,
} from '@ds';
import { ApprovalsInboxStore } from '../../stores/approvals-inbox.store';
import { formatHeadDiffValue, headDiffFieldLabel } from './head-diff-format';

const SUBJECT_NOUN_KEYS: Record<ApprovalSubjectType, CatalogKey> = {
  [ApprovalSubjectType.GateCondition]: 'appr.subjectEntry',
  [ApprovalSubjectType.DesignBrief]: 'client.tabBrief',
  [ApprovalSubjectType.RequirementItem]: 'appr.subjectItem',
  [ApprovalSubjectType.BriefSpace]: 'appr.subjectEntry',
  [ApprovalSubjectType.ProjectDocument]: 'appr.subjectDocument', // 009b #42
};

const DECISION_CHIP: Record<ApprovalDecision, { tone: StatusBadgeTone; key: CatalogKey }> = {
  [ApprovalDecision.Approved]: { tone: 'success', key: 'trust.approved' },
  [ApprovalDecision.Rejected]: { tone: 'error', key: 'trust.rejected' },
  [ApprovalDecision.ChangesRequested]: { tone: 'warning', key: 'brief.outcomeChangesRequested' },
};

/**
 * The client approvals inbox (T119, FR-029; crm-prod B1-fe). Two server-paged lists: what waits
 * for the client (each with Approve and Request changes, gated `crm.approvals.decide_own`) and the
 * decision trail, newest first. A row expands to the brief head's field diff by round, or the
 * gathering entry's current data.
 *
 * "View" links go to the portal project page (`/portal?projectId&tab`): there is no portal brief
 * route of its own and no portal items read (009b #N-3), so a brief round or an entry opens the
 * project's Brief tab and an item opens the project.
 */
@Component({
  selector: 'app-crm-approvals-inbox',
  changeDetection: ChangeDetectionStrategy.OnPush,
  providers: [ApprovalsInboxStore],
  imports: [
    CanDirective,
    FormsModule,
    PeraAlertComponent,
    PeraButtonComponent,
    PeraCardComponent,
    PeraEmptyComponent,
    PeraFormFieldComponent,
    PeraSkeletonComponent,
    PeraSpinnerComponent,
    PeraStatusBadgeComponent,
    PeraTextareaComponent,
    RouterLink,
  ],
  host: { class: 'flex flex-col gap-4', '(keydown.escape)': 'onEscape()' },
  template: `
    <p class="fs-caption text-text-secondary m-0">{{ catalog.t('appr.apSub') }}</p>

    <section aria-labelledby="appr-pending-h">
      <h2 id="appr-pending-h" class="font-semibold fs-body-sm text-text-primary m-0">
        {{ catalog.t('appr.yourApprovals') }}
        @if (store.pending().page > 0) {
          ({{ store.pending().totalCount }})
        }
      </h2>

      @if (store.pending().loading && !store.pending().rows.length) {
        <div class="flex flex-col gap-2 mt-2" aria-busy="true" data-testid="pending-skeleton">
          <pera-skeleton [height]="64" />
          <pera-skeleton [height]="64" />
        </div>
      } @else if (store.pending().error; as message) {
        <div class="flex flex-col gap-2 mt-2" data-testid="pending-error">
          <pera-alert tone="warning">{{ message }}</pera-alert>
          <div>
            <pera-button variant="secondary" size="sm" (click)="store.reload('pending')">{{
              catalog.t('common.retry')
            }}</pera-button>
          </div>
        </div>
      } @else if (store.pending().rows.length) {
        <ul class="flex flex-col gap-2 mt-2 m-0 p-0 list-none">
          @for (row of store.pending().rows; track row.trackKey) {
            <li [attr.data-approval]="row.id">
              <pera-card>
                <div class="flex flex-col gap-2 p-1">
                  <button
                    type="button"
                    (click)="toggleExpand(row)"
                    [attr.aria-expanded]="expandedId() === row.id"
                    class="flex items-center justify-between gap-2 text-start cursor-pointer bg-transparent border-0 p-0
                           outline-none focus-visible:outline-2 focus-visible:outline-accent"
                  >
                    <span class="fs-body-sm">
                      <span class="font-medium text-text-primary" dir="auto">{{
                        subjectLabel(row)
                      }}</span>
                      <span class="text-text-secondary" dir="auto"> · {{ row.projectName }}</span>
                    </span>
                    <span class="fs-caption text-text-muted">{{
                      catalog.t('appr.requestedOn', { date: whenLabel(row.requestedAtUtc) })
                    }}</span>
                  </button>

                  <div
                    class="flex flex-wrap items-center gap-x-3 gap-y-1 fs-caption text-text-secondary"
                  >
                    @if (row.stageName) {
                      <span dir="auto">{{ row.stageName }}</span>
                    }
                    @if (row.round !== null && row.subjectType !== SUBJECT_TYPE.DesignBrief) {
                      <span>{{ catalog.t('appr.roundLabel', { round: row.round }) }}</span>
                    }
                    @if (row.dueAtUtc) {
                      <span>{{ catalog.t('appr.dueOn', { date: whenLabel(row.dueAtUtc) }) }}</span>
                    }
                    <a
                      class="text-accent underline outline-none focus-visible:outline-2 focus-visible:outline-accent"
                      routerLink="/portal"
                      [queryParams]="viewParams(row)"
                      >{{ catalog.t(viewKey(row)) }}</a
                    >
                  </div>

                  @if (expandedId() === row.id) {
                    <div class="border-t border-border pt-2">
                      @if (detailLoading()) {
                        <div class="flex justify-center py-4"><pera-spinner /></div>
                      } @else {
                        @switch (row.subjectType) {
                          @case (SUBJECT_TYPE.DesignBrief) {
                            @if (headDiff(); as diff) {
                              @if (diff.previousRound === null && diff.changes.length) {
                                <!-- Round 1 (009b #16): every field with a value, no "before". -->
                                <p class="fs-caption text-text-secondary m-0">
                                  {{ catalog.t('appr.initialValues') }}
                                </p>
                                <ul class="flex flex-col gap-1 m-0 p-0 list-none">
                                  @for (c of diff.changes; track c.field) {
                                    <li class="fs-body-sm">
                                      <span class="text-text-secondary"
                                        >{{ fieldLabel(c.field) }}:</span
                                      >
                                      <span class="text-text-primary" dir="ltr">{{
                                        fieldValue(c.field, c.currentValue)
                                      }}</span>
                                    </li>
                                  }
                                </ul>
                              } @else if (diff.changes.length) {
                                <ul class="flex flex-col gap-1 m-0 p-0 list-none">
                                  @for (c of diff.changes; track c.field) {
                                    <li class="fs-body-sm">
                                      <span class="text-text-secondary"
                                        >{{ fieldLabel(c.field) }}:</span
                                      >
                                      <span class="text-text-muted" dir="ltr">{{
                                        fieldValue(c.field, c.previousValue)
                                      }}</span>
                                      <span class="inline-block rtl:rotate-180" aria-hidden="true"
                                        >→</span
                                      >
                                      <span class="text-text-primary" dir="ltr">{{
                                        fieldValue(c.field, c.currentValue)
                                      }}</span>
                                    </li>
                                  }
                                </ul>
                              } @else {
                                <pera-empty [title]="catalog.t('client.tabBrief')" />
                              }
                            } @else if (diffError(); as message) {
                              <pera-alert tone="warning">{{ message }}</pera-alert>
                            } @else {
                              <pera-empty [title]="catalog.t('client.tabBrief')" />
                            }
                          }
                          @case (SUBJECT_TYPE.BriefSpace) {
                            @if (spaceDetail(); as space) {
                              <p class="fs-body-sm text-text-primary m-0" dir="auto">
                                {{ space.space?.name || catalog.t('brief.general') }}
                              </p>
                              @if (space.requirements) {
                                <p class="fs-body-sm text-text-secondary m-0" dir="auto">
                                  {{ space.requirements }}
                                </p>
                              }
                            } @else {
                              <pera-empty [title]="catalog.t('appr.subjectEntry')" />
                            }
                          }
                          @case (SUBJECT_TYPE.RequirementItem) {
                            <!-- 009b #N-3: no portal items read exists on the backend. -->
                            <pera-empty [title]="catalog.t('appr.labelNotAvailable')" />
                          }
                        }
                      }
                    </div>
                  }

                  <div *peraCan="PERM.crm.approvals.decideOwn" class="flex flex-col gap-2">
                    @if (changesFor() === row.id) {
                      <div #changesBox class="flex flex-col gap-2" data-testid="changes-form">
                        <pera-form-field
                          [label]="catalog.t('appr.changesComment')"
                          [required]="true"
                          [error]="commentError()"
                        >
                          <pera-textarea
                            [rows]="3"
                            [ngModel]="comment()"
                            (ngModelChange)="comment.set($event)"
                            (focusout)="commentTouched.set(true)"
                            [error]="commentError()"
                          />
                        </pera-form-field>
                        @if (serverError(); as message) {
                          <pera-alert tone="warning">{{ message }}</pera-alert>
                        }
                        <div class="flex items-center justify-end gap-2">
                          <pera-button variant="ghost" size="sm" (click)="closeChanges(row.id)">{{
                            catalog.t('common.cancel')
                          }}</pera-button>
                          <pera-button
                            variant="primary"
                            size="sm"
                            data-testid="send-changes"
                            [disabled]="!commentValid() || store.isDeciding(row.id)"
                            [loading]="store.isDeciding(row.id)"
                            (click)="sendChanges(row)"
                            >{{ catalog.t('appr.sendChanges') }}</pera-button
                          >
                        </div>
                      </div>
                    } @else {
                      <div class="flex items-center justify-end gap-2">
                        <pera-button
                          variant="secondary"
                          size="sm"
                          data-testid="request-changes"
                          [attr.data-changes-for]="row.id"
                          [disabled]="store.isDeciding(row.id)"
                          (click)="openChanges(row)"
                          >{{ catalog.t('appr.requestChanges') }}</pera-button
                        >
                        <pera-button
                          variant="primary"
                          size="sm"
                          data-testid="approve"
                          [disabled]="store.isDeciding(row.id)"
                          [loading]="store.isDeciding(row.id)"
                          (click)="approve(row)"
                          >{{ catalog.t('appr.approve') }}</pera-button
                        >
                      </div>
                    }
                  </div>
                </div>
              </pera-card>
            </li>
          }
        </ul>
        @if (store.pending().page < store.pending().totalPages) {
          <div class="flex justify-center mt-2">
            <pera-button
              variant="secondary"
              size="sm"
              [loading]="store.pending().loading"
              (click)="store.loadMore('pending')"
              >{{ catalog.t('appr.loadMore') }}</pera-button
            >
          </div>
        }
      } @else {
        <pera-empty [title]="catalog.t('appr.pendingEmpty')" class="mt-2" />
      }
    </section>

    <section aria-labelledby="appr-trail-h">
      <h2 id="appr-trail-h" class="font-semibold fs-body-sm text-text-primary m-0">
        {{ catalog.t('appr.apTrail') }}
      </h2>
      @if (store.decided().loading && !store.decided().rows.length) {
        <div class="flex flex-col gap-2 mt-2" aria-busy="true" data-testid="decided-skeleton">
          <pera-skeleton [height]="48" />
          <pera-skeleton [height]="48" />
        </div>
      } @else if (store.decided().error; as message) {
        <div class="flex flex-col gap-2 mt-2" data-testid="decided-error">
          <pera-alert tone="warning">{{ message }}</pera-alert>
          <div>
            <pera-button variant="secondary" size="sm" (click)="store.reload('decided')">{{
              catalog.t('common.retry')
            }}</pera-button>
          </div>
        </div>
      } @else if (store.decided().rows.length) {
        <ul class="flex flex-col gap-2 mt-2 m-0 p-0 list-none">
          @for (row of store.decided().rows; track row.trackKey) {
            <li
              class="flex items-center justify-between gap-2 p-2 border border-border fs-body-sm"
              [attr.data-decided]="row.id"
            >
              <div class="min-w-0">
                <div class="text-text-primary" dir="auto">
                  {{ subjectLabel(row) }} · {{ row.projectName }}
                </div>
                @if (row.decidedAtUtc) {
                  <div class="fs-caption text-text-muted">
                    {{ catalog.t('appr.decidedOn', { date: whenLabel(row.decidedAtUtc) }) }}
                  </div>
                }
                @if (row.comment) {
                  <div class="fs-caption text-text-secondary" dir="auto">{{ row.comment }}</div>
                }
              </div>
              @if (row.decision !== null) {
                <pera-status-badge
                  [tone]="DECISION_CHIP[row.decision].tone"
                  [label]="catalog.t(DECISION_CHIP[row.decision].key)"
                />
              }
            </li>
          }
        </ul>
        @if (store.decided().page < store.decided().totalPages) {
          <div class="flex justify-center mt-2">
            <pera-button
              variant="secondary"
              size="sm"
              [loading]="store.decided().loading"
              (click)="store.loadMore('decided')"
              >{{ catalog.t('appr.loadMore') }}</pera-button
            >
          </div>
        }
      } @else {
        <pera-empty [title]="catalog.t('appr.decidedEmpty')" class="mt-2" />
      }
    </section>
  `,
})
export class CrmApprovalsInboxComponent {
  private readonly briefApi = inject(CrmBriefService);
  private readonly errors = inject(ErrorHandlerService);
  private readonly host = inject<ElementRef<HTMLElement>>(ElementRef);
  protected readonly catalog = inject(CatalogService);
  protected readonly store = inject(ApprovalsInboxStore);
  protected readonly PERM = PERM;
  protected readonly SUBJECT_TYPE = ApprovalSubjectType;
  protected readonly DECISION_CHIP = DECISION_CHIP;

  protected readonly expandedId = signal<string | null>(null);
  protected readonly detailLoading = signal(false);
  protected readonly headDiff = signal<BriefHeadDiff | null>(null);
  /** A failed diff read: 404 `crm.briefs.RoundNotFound` / `crm.portal.NotFound` (009b #16). */
  protected readonly diffError = signal<string | null>(null);
  protected readonly spaceDetail = signal<BriefSpace | null>(null);

  /** The approval whose Request-changes comment field is open, if any. */
  protected readonly changesFor = signal<string | null>(null);
  protected readonly comment = signal('');
  protected readonly commentTouched = signal(false);
  /** A 400 from the server on the changes request, already through the catalog. */
  protected readonly serverError = signal<string | null>(null);

  private readonly changesBox = viewChild<ElementRef<HTMLElement>>('changesBox');

  protected readonly commentValid = computed(() => {
    const text = this.comment().trim();
    return text.length > 0 && text.length <= PORTAL_APPROVAL_COMMENT_MAX;
  });

  protected readonly commentError = computed<string | undefined>(() => {
    const text = this.comment().trim();
    if (text.length > PORTAL_APPROVAL_COMMENT_MAX) {
      return this.catalog.t('appr.commentTooLong', { max: PORTAL_APPROVAL_COMMENT_MAX });
    }
    return this.commentTouched() && !text ? this.catalog.t('appr.commentRequired') : undefined;
  });

  constructor() {
    this.store.load();

    // Focus management: the comment field takes focus when it opens, with its accessible name
    // on the native textarea (`pera-textarea` takes no id or aria-label of its own).
    effect(() => {
      const box = this.changesBox();
      if (!box) return;
      const textarea = box.nativeElement.querySelector('textarea');
      textarea?.setAttribute('aria-label', this.catalog.t('appr.changesComment'));
      textarea?.focus();
    });
  }

  protected subjectLabel(row: PortalApproval): string {
    if (row.subjectType === ApprovalSubjectType.DesignBrief) {
      return row.round !== null
        ? this.catalog.t('appr.briefRound', { round: row.round })
        : this.catalog.t('client.tabBrief');
    }
    const noun = this.catalog.t(SUBJECT_NOUN_KEYS[row.subjectType] ?? 'appr.subjectEntry');
    if (row.title) return `${noun} · ${row.title}`;
    return row.subjectType === ApprovalSubjectType.BriefSpace
      ? `${noun} · ${this.catalog.t('brief.general')}`
      : noun;
  }

  protected viewKey(row: PortalApproval): CatalogKey {
    switch (row.subjectType) {
      case ApprovalSubjectType.DesignBrief:
        return 'appr.viewBrief';
      case ApprovalSubjectType.BriefSpace:
        return 'appr.viewEntry';
      default:
        return 'appr.viewProject';
    }
  }

  protected viewParams(row: PortalApproval): Record<string, string> {
    return row.subjectType === ApprovalSubjectType.DesignBrief ||
      row.subjectType === ApprovalSubjectType.BriefSpace
      ? { projectId: row.projectId, tab: 'brief' }
      : { projectId: row.projectId };
  }

  protected fieldLabel(field: string): string {
    return headDiffFieldLabel(field, this.catalog);
  }

  protected fieldValue(field: string, raw: string | null): string {
    return formatHeadDiffValue(field, raw, this.catalog);
  }

  protected whenLabel(iso: string): string {
    return formatCairoDate(iso, this.catalog.locale());
  }

  protected approve(row: PortalApproval): void {
    this.store.decide(row.id, ApprovalDecision.Approved, null);
  }

  protected openChanges(row: PortalApproval): void {
    this.changesFor.set(row.id);
    this.comment.set('');
    this.commentTouched.set(false);
    this.serverError.set(null);
  }

  /** Escape closes an open comment field, returning focus to its opener. */
  protected onEscape(): void {
    const id = this.changesFor();
    if (id) this.closeChanges(id);
  }

  protected closeChanges(approvalId: string): void {
    this.changesFor.set(null);
    this.serverError.set(null);
    // Focus returns to the control that opened the field.
    setTimeout(() => {
      const opener = this.host.nativeElement.querySelector<HTMLButtonElement>(
        `[data-changes-for="${approvalId}"] button`,
      );
      opener?.focus();
    });
  }

  protected sendChanges(row: PortalApproval): void {
    this.commentTouched.set(true);
    if (!this.commentValid()) return;
    this.serverError.set(null);
    this.store.decide(row.id, ApprovalDecision.ChangesRequested, this.comment(), {
      onDone: () => this.changesFor.set(null),
      onError: (message) => this.serverError.set(message),
    });
  }

  protected toggleExpand(row: PortalApproval): void {
    if (this.expandedId() === row.id) {
      this.expandedId.set(null);
      return;
    }
    this.expandedId.set(row.id);
    this.headDiff.set(null);
    this.diffError.set(null);
    this.spaceDetail.set(null);
    this.detailLoading.set(true);

    if (row.subjectType === ApprovalSubjectType.DesignBrief && row.round !== null) {
      this.briefApi.getHeadDiff(row.briefId ?? row.subjectId, row.round).subscribe({
        next: (diff) => {
          this.headDiff.set(diff);
          this.detailLoading.set(false);
        },
        error: (err: unknown) => {
          this.diffError.set(
            err instanceof HttpErrorResponse ? friendly(this.errors.parse(err)) : null,
          );
          this.detailLoading.set(false);
        },
      });
    } else if (row.subjectType === ApprovalSubjectType.BriefSpace) {
      this.briefApi.getMyBrief(row.projectId).subscribe({
        next: (view) => {
          this.spaceDetail.set(view.spaces.find((s) => s.id === row.subjectId) ?? null);
          this.detailLoading.set(false);
        },
        error: () => this.detailLoading.set(false),
      });
    } else {
      this.detailLoading.set(false);
    }
  }
}
