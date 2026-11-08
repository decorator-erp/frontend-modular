import { ChangeDetectionStrategy, Component, OnInit, inject } from '@angular/core';
import { RouterLink } from '@angular/router';
import {
  PeraAlertComponent,
  PeraBadgeComponent,
  PeraButtonComponent,
  PeraEmptyComponent,
  PeraPageHeaderComponent,
  PeraSkeletonComponent,
  PeraStatusBadgeComponent,
} from '@ds';
import { CatalogService } from '@platform/i18n/catalog.service';
import type { CatalogKey } from '@platform/i18n/catalog/en';
import { formatCairoDateTime, intlLocale } from '@platform/i18n/intl-locale';
import type { MyAccessGrant } from '../../model/access-grant.model';
import { MyAccessGrantsStore } from '../../stores/my-access-grants.store';

const UNITS: readonly [Intl.RelativeTimeFormatUnit, number][] = [
  ['day', 86_400_000],
  ['hour', 3_600_000],
  ['minute', 60_000],
];

/**
 * crmp P1-B: "Shared with me" (`projects/shared-with-me`, `GET /api/me/access-grants`): the projects
 * the caller reaches through an Active or Upcoming grant — name and code linking to the project,
 * level, areas, stages, and when it ends ("Expires in 3 days", Cairo date on hover) or "No end".
 * Re-read on every visit, so a revoked grant drops off.
 */
@Component({
  selector: 'app-shared-with-me-page',
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [
    RouterLink,
    PeraAlertComponent,
    PeraBadgeComponent,
    PeraButtonComponent,
    PeraEmptyComponent,
    PeraPageHeaderComponent,
    PeraSkeletonComponent,
    PeraStatusBadgeComponent,
  ],
  template: `
    <div class="flex flex-col gap-4 p-6 max-w-4xl">
      @if (store.loading() && !store.grants().length) {
        <div class="flex flex-col gap-2" aria-busy="true" data-loading>
          <pera-skeleton [height]="28" width="40%" />
          <pera-skeleton [height]="64" />
        </div>
      } @else if (store.error()) {
        <pera-alert tone="danger" data-error>
          {{ t('swm.loadFailed') }}
          <pera-button variant="ghost" size="sm" (click)="store.refresh()">{{
            t('swm.retry')
          }}</pera-button>
        </pera-alert>
      } @else {
        <pera-page-header [title]="t('swm.title')" [count]="store.grants().length" />
        <p class="m-0 fs-body-sm text-text-secondary">{{ t('swm.subtitle') }}</p>
        @if (store.grants().length) {
          <ul class="m-0 p-0 list-none flex flex-col border border-border-soft" data-shared>
            @for (g of store.grants(); track g.grantId) {
              <li
                class="flex flex-col gap-1.5 px-4 py-3 border-b border-border-soft last:border-b-0"
                data-shared-row
              >
                <div class="flex flex-wrap items-center gap-2">
                  <a
                    class="fs-body-sm font-medium text-text-primary hover:text-accent grow min-w-0 truncate"
                    [routerLink]="['/projects', g.projectId]"
                    data-project-link
                    >{{ g.projectName }}
                    @if (g.projectCode) {
                      <span class="font-mono text-text-muted ms-1">{{ g.projectCode }}</span>
                    }
                  </a>
                  @if (g.status === 'Upcoming') {
                    <pera-status-badge tone="info" [label]="t('pa.status.Upcoming')" />
                  }
                  <span class="fs-label" data-level>{{ t('grants.level.' + g.level) }}</span>
                </div>
                <div class="flex flex-wrap items-center gap-1.5">
                  @for (a of g.areas; track a) {
                    <pera-badge>{{ t('grants.area.' + a) }}</pera-badge>
                  }
                </div>
                <div class="fs-caption text-text-secondary flex flex-wrap gap-x-3">
                  <span data-stages>{{ stagesOf(g) }}</span>
                  <span data-window [attr.title]="endTitle(g)">{{ windowOf(g) }}</span>
                </div>
              </li>
            }
          </ul>
        } @else {
          <pera-empty
            [title]="t('swm.empty')"
            [description]="t('swm.emptyBody')"
            iconName="inbox"
            data-empty
          />
        }
      }
    </div>
  `,
})
export class SharedWithMePageComponent implements OnInit {
  protected readonly store = inject(MyAccessGrantsStore);
  private readonly catalog = inject(CatalogService);

  ngOnInit(): void {
    this.store.refresh();
  }

  t(key: string, params?: Record<string, string | number>): string {
    return this.catalog.t(key as CatalogKey, params);
  }

  stagesOf(g: MyAccessGrant): string {
    return g.stageIds.length
      ? this.t('swm.someStages', { n: g.stageIds.length })
      : this.t('grants.wholeProject');
  }

  /** "Starts in 2 days · Expires in 9 days", "Expires in 3 hours" or "No end". */
  windowOf(g: MyAccessGrant): string {
    const parts: string[] = [];
    if (g.status === 'Upcoming' && g.startsAtUtc)
      parts.push(this.t('swm.starts', { rel: this.relative(g.startsAtUtc) }));
    parts.push(
      g.expiresAtUtc
        ? this.t('swm.expires', { rel: this.relative(g.expiresAtUtc) })
        : this.t('swm.noEnd'),
    );
    return parts.join(' · ');
  }

  endTitle(g: MyAccessGrant): string | null {
    return g.expiresAtUtc ? formatCairoDateTime(g.expiresAtUtc, this.catalog.locale()) : null;
  }

  private relative(iso: string): string {
    const diff = Date.parse(iso) - Date.now();
    const fmt = new Intl.RelativeTimeFormat(intlLocale(this.catalog.locale()), {
      numeric: 'auto',
    });
    for (const [unit, ms] of UNITS) {
      if (Math.abs(diff) >= ms || unit === 'minute') return fmt.format(Math.round(diff / ms), unit);
    }
    return fmt.format(0, 'minute');
  }
}
