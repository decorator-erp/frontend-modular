import { ChangeDetectionStrategy, Component, computed, inject, output } from '@angular/core';
import { RouterLink } from '@angular/router';
import {
  PeraAlertComponent,
  PeraBadgeComponent,
  PeraButtonComponent,
  PeraCardComponent,
  PeraIconComponent,
} from '@ds';
import { CatalogService } from '@platform/i18n/catalog.service';
import type { CatalogKey } from '@platform/i18n/catalog/en';
import { formatCairoDate, formatCairoDateTime } from '@platform/i18n/intl-locale';
import {
  BUILDING_KIND_LABEL,
  ELEVATOR_STATUS_LABEL,
  SiteStatus,
  UNIT_CONDITION_LABEL,
  UNIT_POSITION_LABEL,
  UNIT_TYPE_LABEL,
} from '../../model/site-enums';
import { localName } from '../../model/site-normalize';
import { siteQuery } from '../../model/site-url';
import { SiteDetailStore } from '../../stores/site-detail.store';

interface Row {
  key: CatalogKey;
  value: string | null;
  field?: string;
}

/**
 * sites S-3: the overview tab (prototype `overviewTab`, `sites.js:384-415`): the 14 unit-data facts
 * ("—" for null, enum labels, m²), the lifecycle trail (submitter name omitted, DEVIATION-S1), records
 * per module (`recordCounts` joined to the active modules; a row opens the capture tab on it) and the
 * caller's access card.
 */
@Component({
  selector: 'app-site-overview',
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [
    RouterLink,
    PeraAlertComponent,
    PeraBadgeComponent,
    PeraButtonComponent,
    PeraCardComponent,
    PeraIconComponent,
  ],
  template: `
    @if (store.site(); as s) {
      <div class="grid grid-cols-1 lg:grid-cols-3 gap-4">
        <div class="lg:col-span-2 flex flex-col gap-4">
          <pera-card padding="none">
            <div class="flex items-start justify-between gap-3 p-4 border-b border-border">
              <div>
                <h2 class="m-0 fs-body font-semibold">{{ t('sv.unitData') }}</h2>
                <p class="m-0 mt-1 fs-label text-text-secondary">{{ t('sv.unitDataSub') }}</p>
              </div>
              @if (store.caps().edit) {
                <pera-button
                  size="sm"
                  iconStart="pencil"
                  (click)="editUnit.emit()"
                  data-edit-unit-card
                >
                  {{ t('sv.edit') }}
                </pera-button>
              }
            </div>
            <dl
              class="grid grid-cols-[minmax(8rem,max-content)_1fr] gap-x-4 gap-y-2 m-0 p-4 fs-body-sm"
              data-unit-facts
            >
              @for (r of rows(); track r.key) {
                <dt
                  class="text-text-muted"
                  [class.text-danger]="r.field === 'address' && store.addressRequired()"
                >
                  {{ t(r.key) }}
                </dt>
                <dd class="m-0 text-text-primary whitespace-pre-line" dir="auto">
                  {{ r.value ?? '—' }}
                </dd>
              }
            </dl>
          </pera-card>
          @if (s.status === draft && !s.address) {
            <pera-alert tone="warning" data-address-needed>{{ t('sv.addressNeeded') }}</pera-alert>
          }
        </div>

        <div class="flex flex-col gap-4">
          <pera-card padding="none">
            <h2 class="m-0 p-4 fs-body font-semibold border-b border-border">
              {{ t('sv.lifecycle') }}
            </h2>
            <ol class="m-0 p-0 list-none" data-trail>
              <li class="flex gap-3 px-4 py-3 border-b border-border">
                <span class="w-2 h-2 mt-1.5 rounded-full bg-accent shrink-0"></span>
                <div>
                  <div class="font-medium">
                    {{ t('sv.trail.created', { n: nameOf(s.createdById) }) }}
                  </div>
                  <div class="fs-label text-text-muted">{{ dateTime(s.createdAtUtc) }}</div>
                </div>
              </li>
              <li class="flex gap-3 px-4 py-3 border-b border-border">
                <span
                  class="w-2 h-2 mt-1.5 rounded-full shrink-0"
                  [class.bg-accent]="!!s.submittedAtUtc"
                  [class.bg-border-strong]="!s.submittedAtUtc"
                ></span>
                @if (s.submittedAtUtc) {
                  <div>
                    <div class="font-medium">{{ t('sv.trail.submittedAt') }}</div>
                    <div class="fs-label text-text-muted">{{ dateTime(s.submittedAtUtc) }}</div>
                  </div>
                } @else {
                  <div class="text-text-muted">{{ t('sv.trail.notSubmitted') }}</div>
                }
              </li>
              <li class="flex gap-3 px-4 py-3">
                <span
                  class="w-2 h-2 mt-1.5 rounded-full shrink-0"
                  [class.bg-accent]="!!s.decidedAtUtc"
                  [class.bg-border-strong]="!s.decidedAtUtc"
                ></span>
                @if (s.decidedAtUtc) {
                  <div>
                    <div class="font-medium">
                      {{
                        t(s.status === approved ? 'sv.trail.approved' : 'sv.trail.rejected', {
                          n: nameOf(s.decidedById),
                        })
                      }}
                    </div>
                    <div class="fs-label text-text-muted" dir="auto">
                      {{ dateTime(s.decidedAtUtc)
                      }}{{ s.decisionNote ? ' · ' + s.decisionNote : '' }}
                    </div>
                  </div>
                } @else {
                  <div class="text-text-muted">{{ t('sv.trail.notDecided') }}</div>
                }
              </li>
            </ol>
          </pera-card>

          <pera-card padding="none">
            <h2 class="m-0 p-4 fs-body font-semibold border-b border-border">
              {{ t('sv.recordCounts') }}
            </h2>
            <ul class="m-0 p-0 list-none" data-record-counts>
              @for (m of moduleCounts(); track m.id) {
                <li class="border-b border-border last:border-b-0">
                  <a
                    class="flex items-center gap-2 px-4 py-3 hover:bg-surface-muted text-text-primary no-underline"
                    [routerLink]="['/sites', s.id]"
                    [queryParams]="captureQuery(m.id)"
                  >
                    <span class="flex-1 min-w-0">
                      {{ m.name }}
                      <span class="fs-label text-text-muted" dir="ltr">{{ m.code }}</span>
                    </span>
                    <span class="font-semibold">{{ m.count }}</span>
                    <pera-icon name="chevron-right" [size]="14" class="rtl:rotate-180" />
                  </a>
                </li>
              } @empty {
                <li class="px-4 py-3 text-text-muted">{{ t('sv.noModules') }}</li>
              }
            </ul>
          </pera-card>

          <pera-card>
            <h2 class="m-0 mb-3 fs-body font-semibold">{{ t('sv.yourAccess') }}</h2>
            @if (store.project(); as p) {
              <div class="flex flex-col gap-2" data-access>
                <div>
                  <pera-badge tone="accent" [dot]="true">{{
                    t('sv.level', { l: t(levelKey(p.myLevel)) })
                  }}</pera-badge>
                </div>
                <div class="fs-body-sm text-text-secondary">{{ t('sv.levelSrc.myLevel') }}</div>
                <div class="fs-label text-text-muted">{{ t('sv.levelRules') }}</div>
              </div>
            }
          </pera-card>
        </div>
      </div>
    }
  `,
})
export class SiteOverviewComponent {
  protected readonly store = inject(SiteDetailStore);
  private readonly catalog = inject(CatalogService);

  readonly editUnit = output<void>();

  protected readonly draft = SiteStatus.Draft;
  protected readonly approved = SiteStatus.Approved;

  protected t(key: CatalogKey, params?: Record<string, string | number>): string {
    return this.catalog.t(key, params);
  }

  protected levelKey(level: string): CatalogKey {
    return `sv.e.ProjectLevel.${level}` as CatalogKey;
  }

  protected nameOf(id: string | null): string {
    return this.store.name(id) ?? '—';
  }

  protected dateTime(iso: string): string {
    return formatCairoDateTime(iso, this.catalog.locale());
  }

  protected captureQuery(moduleId: string): Record<string, string> {
    return siteQuery('capture', moduleId);
  }

  private num(n: number): string {
    return new Intl.NumberFormat(this.catalog.locale() === 'ar' ? 'ar-EG' : 'en-GB', {
      maximumFractionDigits: 2,
    }).format(n);
  }

  private label(map: Record<number, CatalogKey>, v: number | null): string | null {
    return v == null ? null : map[v] ? this.t(map[v]) : String(v);
  }

  private yesNo(v: boolean | null): string | null {
    return v == null ? null : this.t(v ? 'sv.yes' : 'sv.no');
  }

  protected readonly rows = computed<Row[]>(() => {
    const s = this.store.site();
    this.catalog.locale();
    if (!s) return [];
    return [
      { key: 'sv.address', value: s.address, field: 'address' },
      { key: 'sv.f.unitType', value: this.label(UNIT_TYPE_LABEL, s.unitType) },
      { key: 'sv.f.unitCondition', value: this.label(UNIT_CONDITION_LABEL, s.unitCondition) },
      {
        key: 'sv.f.areaSqm',
        value: s.areaSqm == null ? null : `${this.num(s.areaSqm)} ${this.t('sv.unitM2')}`,
      },
      { key: 'sv.f.floorNo', value: s.floorNo == null ? null : this.num(s.floorNo) },
      {
        key: 'sv.f.unitsPerFloor',
        value: s.unitsPerFloor == null ? null : this.num(s.unitsPerFloor),
      },
      { key: 'sv.f.buildingKind', value: this.label(BUILDING_KIND_LABEL, s.buildingKind) },
      { key: 'sv.f.position', value: this.label(UNIT_POSITION_LABEL, s.position) },
      { key: 'sv.f.elevatorStatus', value: this.label(ELEVATOR_STATUS_LABEL, s.elevatorStatus) },
      { key: 'sv.f.isLicensed', value: this.yesNo(s.isLicensed) },
      { key: 'sv.f.isRented', value: this.yesNo(s.isRented) },
      {
        key: 'sv.surveyedOn',
        value: s.surveyedOn
          ? formatCairoDate(`${s.surveyedOn}T12:00:00Z`, this.catalog.locale())
          : null,
      },
      { key: 'sv.f.utilityMetersNote', value: s.utilityMetersNote },
      { key: 'sv.f.notes', value: s.notes },
    ];
  });

  /** Active modules with this survey's record counts (0 when none). */
  protected readonly moduleCounts = computed(() => {
    const s = this.store.site();
    const locale = this.catalog.locale();
    const counts = new Map((s?.recordCounts ?? []).map((c) => [c.moduleId, c.recordCount]));
    return this.store.modules().map((m) => ({
      id: m.id,
      code: m.code,
      name: localName(m, locale),
      count: counts.get(m.id) ?? 0,
    }));
  });
}
