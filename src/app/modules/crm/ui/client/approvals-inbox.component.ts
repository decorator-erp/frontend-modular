import { ChangeDetectionStrategy, Component, inject, signal } from '@angular/core';
import { HttpErrorResponse } from '@angular/common/http';
import { FormsModule } from '@angular/forms';
import { CrmBriefService } from '../../data/crm-brief.service';
import { APPROVAL_COMMENT_MAX } from '../../data/crm-approvals.service';
import { CrmItemService } from '../../data/crm-item.service';
import { CatalogService } from '@platform/i18n/catalog.service';
import { ErrorHandlerService, friendly } from '@platform/http/error-handler.service';
import type { CatalogKey } from '@platform/i18n/catalog/en';
import { formatCairoDate } from '@platform/i18n/intl-locale';
import { ApprovalDecision, ApprovalSubjectType } from '../../model/crm-enums';
import type {
  BriefHeadDiff,
  BriefSpace,
  ClientApprovalTrailRow,
  RequirementItem,
} from '../../model';
import {
  PeraAlertComponent,
  PeraButtonComponent,
  PeraCardComponent,
  PeraEmptyComponent,
  PeraSpinnerComponent,
  PeraStatusBadgeComponent,
  PeraTextareaComponent,
} from '@ds';
import { ApprovalsInboxStore } from '../../stores/approvals-inbox.store';
import { formatHeadDiffValue, headDiffFieldLabel } from './head-diff-format';

const SUBJECT_NOUN_KEYS: Record<ApprovalSubjectType, CatalogKey> = {
  [ApprovalSubjectType.GateCondition]: 'appr.subjectEntry',
  [ApprovalSubjectType.DesignBrief]: 'client.tabBrief',
  [ApprovalSubjectType.RequirementItem]: 'appr.subjectItem',
  [ApprovalSubjectType.BriefSpace]: 'appr.subjectEntry',
};

/**
 * The client approvals inbox (T119, FR-029) — the brief head by round with a field
 * diff, gathering entries, and requirement items, in one list. Approve and reject
 * are both offered; reject refuses to submit without a comment. A decided row
 * stays in the trail forever (append-only — never overwritten, never removed).
 *
 * A `BriefSpace` row shows its CURRENT data only, no per-round entry diff.
 */
@Component({
  selector: 'app-crm-approvals-inbox',
  changeDetection: ChangeDetectionStrategy.OnPush,
  providers: [ApprovalsInboxStore],
  imports: [
    FormsModule,
    PeraAlertComponent,
    PeraButtonComponent,
    PeraCardComponent,
    PeraEmptyComponent,
    PeraSpinnerComponent,
    PeraStatusBadgeComponent,
    PeraTextareaComponent,
  ],
  host: { class: 'flex flex-col gap-4' },
  template: `
    @if (store.loading() && !store.rows().length) {
      <div class="flex justify-center py-8"><pera-spinner /></div>
    } @else if (store.error()) {
      <pera-alert tone="warning">{{ catalog.t(store.error()!) }}</pera-alert>
    } @else {
      <p class="fs-caption text-text-secondary m-0">{{ catalog.t('appr.apSub') }}</p>

      <div>
        <span class="font-semibold fs-body-sm text-text-primary"
          >{{ catalog.t('appr.yourApprovals') }} ({{ store.pending().length }})</span
        >
        @if (store.pending().length) {
          <ul class="flex flex-col gap-2 mt-2 m-0 p-0 list-none">
            @for (row of store.pending(); track row.trackKey) {
              <li>
                <pera-card>
                  <div class="flex flex-col gap-2 p-1">
                    <button
                      type="button"
                      (click)="toggleExpand(row)"
                      class="flex items-center justify-between gap-2 text-start cursor-pointer bg-transparent border-0 p-0
                             outline-none focus-visible:outline-2 focus-visible:outline-accent"
                    >
                      <span class="fs-body-sm">
                        <span class="font-medium text-text-primary">{{
                          catalog.t(subjectNoun(row.subjectType))
                        }}</span>
                        <span class="text-text-secondary">
                          · {{ catalog.t('appr.roundLabel', { round: row.round }) }} ·
                          {{ row.projectName }}</span
                        >
                      </span>
                      <span class="fs-caption text-text-muted" dir="ltr">{{
                        whenLabel(row.createdAtUtc)
                      }}</span>
                    </button>

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
                                        →
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
                              }
                            }
                            @case (SUBJECT_TYPE.BriefSpace) {
                              @if (spaceDetail(); as space) {
                                <p class="fs-body-sm text-text-primary m-0" dir="auto">
                                  {{ space.space?.name || catalog.t('brief.general') }}
                                </p>
                                @if (space.requirements) {
                                  <p class="fs-body-sm text-text-secondary m-0">
                                    {{ space.requirements }}
                                  </p>
                                }
                              } @else {
                                <pera-empty [title]="catalog.t('appr.subjectEntry')" />
                              }
                            }
                            @case (SUBJECT_TYPE.RequirementItem) {
                              @if (itemDetail(); as item) {
                                <p class="fs-body-sm text-text-primary m-0">{{ item.title }}</p>
                                @if (item.details) {
                                  <p class="fs-body-sm text-text-secondary m-0">
                                    {{ item.details }}
                                  </p>
                                }
                              } @else {
                                <pera-empty [title]="catalog.t('appr.subjectItem')" />
                              }
                            }
                          }
                        }

                        <div class="flex items-center gap-2 pt-3">
                          @if (rejectingId() === row.id) {
                            <div class="flex flex-col gap-2 w-full">
                              <pera-textarea
                                [ngModel]="rejectComment()"
                                (ngModelChange)="rejectComment.set($event)"
                                [placeholder]="catalog.t('appr.apRejC')"
                              />
                              <span class="fs-label text-text-muted" dir="ltr"
                                >{{ rejectComment().length }}/{{ APPROVAL_COMMENT_MAX }}</span
                              >
                              <div class="flex items-center gap-2">
                                <pera-button
                                  variant="secondary"
                                  size="sm"
                                  (click)="cancelReject()"
                                  >{{ catalog.t('common.dismiss') }}</pera-button
                                >
                                <pera-button
                                  variant="primary"
                                  size="sm"
                                  [disabled]="!rejectComment().trim()"
                                  [loading]="store.decidingId() === row.id"
                                  (click)="submitReject(row.id)"
                                  >{{ catalog.t('appr.apSendRej') }}</pera-button
                                >
                              </div>
                            </div>
                          } @else {
                            <pera-button
                              variant="primary"
                              size="sm"
                              [loading]="store.decidingId() === row.id"
                              (click)="approve(row.id)"
                              >{{ catalog.t('appr.approve') }}</pera-button
                            >
                            <pera-button
                              variant="secondary"
                              size="sm"
                              (click)="startReject(row.id)"
                              >{{ catalog.t('appr.rejectDots') }}</pera-button
                            >
                          }
                        </div>
                      </div>
                    }
                  </div>
                </pera-card>
              </li>
            }
          </ul>
        } @else {
          <pera-empty [title]="catalog.t('appr.yourApprovals')" class="mt-2" />
        }
      </div>

      <div>
        <span class="font-semibold fs-body-sm text-text-primary">{{
          catalog.t('appr.apTrail')
        }}</span>
        @if (store.decided().length) {
          <ul class="flex flex-col gap-2 mt-2 m-0 p-0 list-none">
            @for (row of store.decided(); track row.trackKey) {
              <li
                class="flex items-center justify-between gap-2 p-2 border border-border fs-body-sm"
              >
                <div class="min-w-0">
                  <div class="text-text-primary">
                    {{ catalog.t(subjectNoun(row.subjectType)) }} ·
                    {{ catalog.t('appr.roundLabel', { round: row.round }) }} · {{ row.projectName }}
                  </div>
                  @if (row.comment) {
                    <div class="fs-caption text-text-secondary">{{ row.comment }}</div>
                  }
                </div>
                <pera-status-badge
                  [tone]="row.decision === DECISION.Approved ? 'success' : 'error'"
                  [label]="
                    catalog.t(
                      row.decision === DECISION.Approved ? 'trust.approved' : 'trust.rejected'
                    )
                  "
                />
              </li>
            }
          </ul>
        } @else {
          <pera-empty [title]="catalog.t('appr.apTrail')" class="mt-2" />
        }
      </div>
    }
  `,
})
export class CrmApprovalsInboxComponent {
  private readonly briefApi = inject(CrmBriefService);
  private readonly itemsApi = inject(CrmItemService);
  private readonly errors = inject(ErrorHandlerService);
  protected readonly catalog = inject(CatalogService);
  protected readonly store = inject(ApprovalsInboxStore);
  protected readonly SUBJECT_TYPE = ApprovalSubjectType;
  protected readonly DECISION = ApprovalDecision;
  protected readonly APPROVAL_COMMENT_MAX = APPROVAL_COMMENT_MAX;

  protected readonly expandedId = signal<string | null>(null);
  protected readonly detailLoading = signal(false);
  protected readonly headDiff = signal<BriefHeadDiff | null>(null);
  /** A failed diff read: 404 `crm.briefs.RoundNotFound` / `crm.portal.NotFound` (009b #16). */
  protected readonly diffError = signal<string | null>(null);
  protected readonly spaceDetail = signal<BriefSpace | null>(null);
  protected readonly itemDetail = signal<RequirementItem | null>(null);

  protected readonly rejectingId = signal<string | null>(null);
  protected readonly rejectComment = signal('');

  constructor() {
    this.store.load();
  }

  protected subjectNoun(type: ApprovalSubjectType): CatalogKey {
    return SUBJECT_NOUN_KEYS[type] ?? 'appr.subjectEntry';
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

  protected toggleExpand(row: ClientApprovalTrailRow): void {
    if (this.expandedId() === row.id) {
      this.expandedId.set(null);
      return;
    }
    this.expandedId.set(row.id);
    this.rejectingId.set(null);
    this.headDiff.set(null);
    this.diffError.set(null);
    this.spaceDetail.set(null);
    this.itemDetail.set(null);
    this.detailLoading.set(true);

    if (row.subjectType === ApprovalSubjectType.DesignBrief) {
      this.briefApi.getHeadDiff(row.subjectId, row.round).subscribe({
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
    } else if (row.subjectType === ApprovalSubjectType.RequirementItem) {
      this.itemsApi.portalSearch(row.projectId).subscribe({
        next: (items) => {
          this.itemDetail.set(items.find((i) => i.id === row.subjectId) ?? null);
          this.detailLoading.set(false);
        },
        error: () => this.detailLoading.set(false),
      });
    } else {
      this.detailLoading.set(false);
    }
  }

  protected approve(id: string): void {
    this.store.decide(id, { decision: ApprovalDecision.Approved, comment: null });
  }

  protected startReject(id: string): void {
    this.rejectingId.set(id);
    this.rejectComment.set('');
  }

  protected cancelReject(): void {
    this.rejectingId.set(null);
    this.rejectComment.set('');
  }

  protected submitReject(id: string): void {
    if (!this.rejectComment().trim()) return;
    this.store.decide(id, { decision: ApprovalDecision.Rejected, comment: this.rejectComment() });
    this.rejectingId.set(null);
  }
}
