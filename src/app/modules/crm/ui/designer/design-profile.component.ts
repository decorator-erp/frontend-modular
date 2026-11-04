import { ChangeDetectionStrategy, Component, computed, inject, signal } from '@angular/core';
import { HttpErrorResponse } from '@angular/common/http';
import { ActivatedRoute } from '@angular/router';
import { catchError, of } from 'rxjs';
import { CrmDesignProfileService } from '../../data/crm-design-profile.service';
import { CrmPeriodService } from '../../data/crm-period.service';
import { ErrorHandlerService } from '@platform/http/error-handler.service';
import { CatalogService } from '@platform/i18n/catalog.service';
import type { CatalogKey } from '@platform/i18n/catalog/en';
import { formatCairoDateTime } from '@platform/i18n/intl-locale';
import { RequirementPeriodStatus } from '../../model/crm-enums';
import type { ClientDesignProfile } from '../../model';
import {
  PeraAlertComponent,
  PeraBreadcrumbsComponent,
  PeraCardComponent,
  PeraEmptyComponent,
  PeraPageHeaderComponent,
  PeraSpinnerComponent,
} from '@ds';
import { formatHeadDiffValue, headDiffFieldLabel } from '../client/head-diff-format';

/** The fields `ClientDesignProfileResponse` carries (009b #17) — NO `ExpectedBudget`, ever (FR-018). */
const PREFERENCE_FIELD_ORDER: Array<[string, keyof ClientDesignProfile]> = [
  ['PreferredStyle', 'preferredStyle'],
  ['PreferredColors', 'preferredColors'],
  ['FurnitureStatus', 'furnitureStatus'],
  ['HiringReasons', 'hiringReasons'],
  ['ArchitecturalRequests', 'architecturalRequests'],
  ['OtherNeeds', 'otherNeeds'],
];

/**
 * Sections the old profile carried that `ClientDesignProfileResponse` no longer serves (009b #17):
 * each keeps its card and renders "not available".
 */
const UNAVAILABLE_SECTION_KEYS: CatalogKey[] = [
  'client.identityData',
  'client.primaryChip',
  'dp.briefT',
  'brief.secSpaces',
  'dp.itemsT',
  'common.attachments',
];

interface PreferenceRow {
  label: string;
  value: string;
}

/**
 * The designer profile (T120–T127, FR-030) — the latest brief's design preferences, read-only.
 * **No write affordance anywhere on this screen.**
 *
 * `ClientDesignProfileResponse` carries seven fields only (009b #17), so the client card, the
 * primary contact, the rest of the brief head, spaces, items and attachments render "not
 * available". A 404 `crm.briefs.NotFound` is "no brief yet". Zero money (FR-018) is enforced
 * SERVER-SIDE; this component renders exactly what arrives. Field labels/values reuse
 * `head-diff-format.ts` rather than another copy of the enum-translation table.
 *
 * The open-period banner (T123) is the one thing this screen fetches separately
 * (`CrmPeriodService.list`, gated `crm.periods.read`) — a pure `crm.design_profile.read` grant
 * without `crm.periods.read` simply won't show it; that failure is swallowed.
 */
@Component({
  selector: 'app-crm-design-profile',
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [
    PeraAlertComponent,
    PeraBreadcrumbsComponent,
    PeraCardComponent,
    PeraEmptyComponent,
    PeraPageHeaderComponent,
    PeraSpinnerComponent,
  ],
  host: { class: 'block bg-bg min-h-full' },
  template: `
    <pera-page-header [title]="catalog.t('nav.dProfile')">
      <div toolbar>
        <pera-breadcrumbs
          [items]="[
            { label: catalog.t('crumb.dash'), route: '/crm/projects/' + projectId },
            { label: catalog.t('crumb.dProfile') },
          ]"
        />
      </div>
      <div actions class="fs-caption text-text-secondary">{{ catalog.t('dp.sub') }}</div>
    </pera-page-header>

    <div class="p-6 flex flex-col gap-4">
      @if (loading() && !profile()) {
        <div class="flex justify-center py-8"><pera-spinner /></div>
      } @else if (noBrief()) {
        <pera-empty [title]="catalog.t('brief.noBrief')" />
      } @else if (error()) {
        <pera-alert tone="warning">{{ error() }}</pera-alert>
      } @else if (profile()) {
        @if (openPeriodClosesAtUtc(); as closesAtUtc) {
          <pera-alert tone="info">
            <span class="font-medium">{{ catalog.t('dp.openT') }}</span>
            {{ catalog.t('dp.openBanner', { date: whenLabel(closesAtUtc) }) }}
          </pera-alert>
        }

        <pera-card>
          <div class="flex flex-col gap-2 p-1">
            <span class="font-semibold fs-body-sm text-text-primary">{{
              catalog.t('brief.secPrefs')
            }}</span>
            @if (preferenceRows().length) {
              <dl class="flex flex-col gap-1 fs-body-sm m-0">
                @for (row of preferenceRows(); track row.label) {
                  <div class="flex justify-between gap-3">
                    <dt class="text-text-secondary">{{ row.label }}</dt>
                    <dd class="text-text-primary m-0 text-end">{{ row.value }}</dd>
                  </div>
                }
              </dl>
            } @else {
              <pera-empty [title]="catalog.t('brief.secPrefs')" />
            }
          </div>
        </pera-card>

        @for (key of unavailableSections; track key) {
          <pera-card>
            <div class="flex flex-col gap-1 p-1" data-testid="dp-unavailable">
              <span class="font-semibold fs-body-sm text-text-primary">{{ catalog.t(key) }}</span>
              <p class="fs-caption text-text-secondary m-0">{{ catalog.t('dp.notAvailable') }}</p>
            </div>
          </pera-card>
        }

        <pera-card>
          <div class="flex flex-col gap-1 p-1">
            <span class="font-semibold fs-body-sm text-text-primary">{{
              catalog.t('dp.hiddenT')
            }}</span>
            <p class="fs-caption text-text-secondary m-0">{{ catalog.t('dp.hiddenBGeneric') }}</p>
          </div>
        </pera-card>
      }
    </div>
  `,
})
export class CrmDesignProfileComponent {
  private readonly route = inject(ActivatedRoute);
  private readonly api = inject(CrmDesignProfileService);
  private readonly periodApi = inject(CrmPeriodService);
  private readonly errors = inject(ErrorHandlerService);
  protected readonly catalog = inject(CatalogService);

  protected projectId = '';
  protected readonly unavailableSections = UNAVAILABLE_SECTION_KEYS;

  protected readonly loading = signal(false);
  protected readonly error = signal<string | null>(null);
  /** 404 `crm.briefs.NotFound`: the project has no brief yet (009b #17). */
  protected readonly noBrief = signal(false);
  protected readonly profile = signal<ClientDesignProfile | null>(null);
  protected readonly openPeriodClosesAtUtc = signal<string | null>(null);

  protected readonly preferenceRows = computed<PreferenceRow[]>(() => {
    const p = this.profile();
    if (!p) return [];
    return PREFERENCE_FIELD_ORDER.map(([field, prop]) => {
      const raw = p[prop];
      return {
        field,
        raw: raw === null || raw === undefined ? null : String(raw),
      };
    })
      .filter((r) => r.raw !== null)
      .map((r) => ({
        label: headDiffFieldLabel(r.field, this.catalog),
        value: formatHeadDiffValue(r.field, r.raw, this.catalog),
      }));
  });

  constructor() {
    this.projectId = this.route.snapshot.paramMap.get('projectId') ?? '';
    this.load();
  }

  private load(): void {
    this.loading.set(true);
    this.api.getFor(this.projectId).subscribe({
      next: (profile) => {
        this.profile.set(profile);
        this.loading.set(false);
      },
      error: (err: unknown) => {
        const noBrief =
          err instanceof HttpErrorResponse &&
          err.status === 404 &&
          this.errors.parse(err).code === 'crm.briefs.NotFound';
        this.noBrief.set(noBrief);
        if (!noBrief) this.error.set(this.catalog.t('dp.loadFailed'));
        this.loading.set(false);
      },
    });

    this.periodApi
      .list(this.projectId)
      .pipe(catchError(() => of([])))
      .subscribe((periods) => {
        const open = periods.find((per) => per.status === RequirementPeriodStatus.Open);
        this.openPeriodClosesAtUtc.set(open?.closesAtUtc ?? null);
      });
  }

  protected whenLabel(iso: string): string {
    return formatCairoDateTime(iso, this.catalog.locale());
  }
}
