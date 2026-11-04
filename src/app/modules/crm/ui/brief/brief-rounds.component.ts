import { ChangeDetectionStrategy, Component, computed, inject } from '@angular/core';
import { CatalogService } from '@platform/i18n/catalog.service';
import type { CatalogKey } from '@platform/i18n/catalog/en';
import { formatCairoDateTime } from '@platform/i18n/intl-locale';
import {
  PeraAlertComponent,
  PeraSkeletonComponent,
  PeraStatusBadgeComponent,
  StatusBadgeTone,
} from '@ds';
import type { BriefRound } from '../../model';
import { BriefStore } from '../../stores/brief.store';
import { formatHeadDiffValue, headDiffFieldLabel } from '../head-diff';

/** `CrmBriefRoundOutcome` (`BriefContracts.cs:149`): 1 Pending, 2 Approved, 3 ChangesRequested, 4 Voided, 5 Unknown. */
export const ROUND_OUTCOME = {
  Pending: 1,
  Approved: 2,
  ChangesRequested: 3,
  Voided: 4,
  Unknown: 5,
} as const;

const OUTCOME_CHIP: Record<number, { tone: StatusBadgeTone; key: CatalogKey }> = {
  [ROUND_OUTCOME.Pending]: { tone: 'pending', key: 'brief.outcomePending' },
  [ROUND_OUTCOME.Approved]: { tone: 'success', key: 'brief.outcomeApproved' },
  [ROUND_OUTCOME.ChangesRequested]: { tone: 'warning', key: 'brief.outcomeChangesRequested' },
  [ROUND_OUTCOME.Voided]: { tone: 'neutral', key: 'brief.outcomeVoided' },
};
const UNKNOWN_CHIP = {
  tone: 'neutral' as StatusBadgeTone,
  key: 'brief.outcomeUnknown' as CatalogKey,
};

/**
 * The office brief's Rounds section (crm-prod M5): every sent round of the head with its outcome,
 * a "what changed" diff per round (`GET /briefs/{id}/rounds/{round}/diff`), and a banner for the
 * latest round's decision (approved / changes requested).
 */
@Component({
  selector: 'app-crm-brief-rounds',
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [PeraAlertComponent, PeraSkeletonComponent, PeraStatusBadgeComponent],
  host: { class: 'block' },
  template: `
    @if (banner(); as b) {
      <pera-alert class="block mb-4" [tone]="b.tone" data-testid="brief-round-banner">{{
        b.text
      }}</pera-alert>
    }
    <div class="bg-surface border border-border rounded-card">
      <div class="px-4 py-3 border-b border-border font-semibold text-text-primary">
        {{ catalog.t('brief.roundsT') }}
      </div>
      @if (store.rounds().length) {
        <ul class="flex flex-col divide-y divide-border m-0 p-0 list-none">
          @for (r of store.rounds(); track r.round) {
            <li class="px-4 py-3 flex flex-col gap-2" data-testid="brief-round">
              <div class="flex items-center gap-3 flex-wrap">
                <span class="font-medium text-text-primary">{{
                  catalog.t('brief.roundN', { round: r.round })
                }}</span>
                <span class="fs-caption text-text-secondary" dir="ltr">{{ sentLabel(r) }}</span>
                <pera-status-badge [tone]="chip(r).tone" [label]="catalog.t(chip(r).key)" />
                <span class="flex-1"></span>
                <button
                  type="button"
                  class="fs-caption text-accent cursor-pointer underline outline-none focus-visible:outline-2 focus-visible:outline-accent"
                  [attr.aria-expanded]="store.diffRound() === r.round"
                  (click)="store.toggleRoundDiff(r.round)"
                >
                  {{
                    catalog.t(
                      store.diffRound() === r.round ? 'brief.hideChanges' : 'brief.showChanges'
                    )
                  }}
                </button>
              </div>
              @if (store.diffRound() === r.round) {
                <div data-testid="brief-round-diff">
                  @if (store.loadingDiff()) {
                    <pera-skeleton [height]="48" rounded="sm" />
                  } @else if (store.diffError(); as message) {
                    <pera-alert tone="warning">{{ message }}</pera-alert>
                  } @else if (store.roundDiff(); as diff) {
                    @if (diff.changes.length) {
                      @if (diff.previousRound === null) {
                        <p class="fs-caption text-text-secondary m-0 mb-1">
                          {{ catalog.t('appr.initialValues') }}
                        </p>
                      }
                      <ul class="flex flex-col gap-1 m-0 p-0 list-none">
                        @for (c of diff.changes; track c.field) {
                          <li class="fs-body-sm">
                            <span class="text-text-secondary">{{ fieldLabel(c.field) }}:</span>
                            @if (diff.previousRound !== null) {
                              <span class="text-text-muted" dir="auto">{{
                                fieldValue(c.field, c.previousValue)
                              }}</span>
                              →
                            }
                            <span class="text-text-primary" dir="auto">{{
                              fieldValue(c.field, c.currentValue)
                            }}</span>
                          </li>
                        }
                      </ul>
                    } @else {
                      <p class="fs-caption text-text-muted m-0">
                        {{ catalog.t('brief.noChanges') }}
                      </p>
                    }
                  }
                </div>
              }
            </li>
          }
        </ul>
      } @else {
        <p class="px-4 py-6 m-0 text-center fs-body-sm text-text-muted">
          {{ catalog.t('brief.roundsNone') }}
        </p>
      }
    </div>
  `,
})
export class CrmBriefRoundsComponent {
  protected readonly catalog = inject(CatalogService);
  protected readonly store = inject(BriefStore);

  /** The latest round's decision, as a banner — nothing while it is pending, voided or unsent. */
  protected readonly banner = computed<{ tone: 'success' | 'warning'; text: string } | null>(() => {
    const latest = this.store.latestRound();
    if (!latest) return null;
    if (latest.outcome === ROUND_OUTCOME.Approved)
      return {
        tone: 'success',
        text: this.catalog.t('brief.approvedBanner', { round: latest.round }),
      };
    if (latest.outcome === ROUND_OUTCOME.ChangesRequested)
      return {
        tone: 'warning',
        text: this.catalog.t('brief.changesRequestedBanner', { round: latest.round }),
      };
    return null;
  });

  protected chip(r: BriefRound): { tone: StatusBadgeTone; key: CatalogKey } {
    return OUTCOME_CHIP[r.outcome] ?? UNKNOWN_CHIP;
  }

  protected sentLabel(r: BriefRound): string {
    return r.sentAtUtc
      ? this.catalog.t('brief.roundSent', {
          date: formatCairoDateTime(r.sentAtUtc, this.catalog.locale()),
        })
      : '';
  }

  protected fieldLabel(field: string): string {
    return headDiffFieldLabel(field, this.catalog);
  }

  protected fieldValue(field: string, raw: string | null): string {
    return formatHeadDiffValue(field, raw, this.catalog);
  }
}
