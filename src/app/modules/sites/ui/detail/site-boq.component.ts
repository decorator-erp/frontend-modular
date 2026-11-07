import {
  ChangeDetectionStrategy,
  Component,
  effect,
  inject,
  signal,
  untracked,
} from '@angular/core';
import { HttpErrorResponse } from '@angular/common/http';
import {
  PeraAlertComponent,
  PeraBadgeComponent,
  PeraButtonComponent,
  PeraCardComponent,
  PeraEmptyComponent,
  PeraSkeletonComponent,
} from '@ds';
import { ErrorHandlerService, friendly } from '@platform/http/error-handler.service';
import { CatalogService } from '@platform/i18n/catalog.service';
import type { CatalogKey } from '@platform/i18n/catalog/en';
import { SiteService } from '../../data/site.service';
import { formatNumber } from '../../model/site-format';
import type { SiteBoqLine } from '../../model/site.model';
import { SiteDetailStore } from '../../stores/site-detail.store';

/**
 * sites S-8: Quantities (prototype `boqTab`, `sites.js:666-691`): the R17 lines as the server rolls
 * them up (`SiteBoqLineResponse`, `RecordContracts.cs:93-96`) — module code chip, kind name in the UI
 * language (`nameAr` under AR), records (occurrences), spaces, total qty, area m², length m; numbers
 * with at most two decimals in the locale, null → "—". Nothing is computed client-side.
 */
@Component({
  selector: 'app-site-boq',
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [
    PeraAlertComponent,
    PeraBadgeComponent,
    PeraButtonComponent,
    PeraCardComponent,
    PeraEmptyComponent,
    PeraSkeletonComponent,
  ],
  template: `
    @if (error(); as message) {
      <pera-alert tone="danger" data-boq-error>
        {{ message }}
        <pera-button variant="secondary" size="sm" (click)="load()">{{
          t('sv.retry')
        }}</pera-button>
      </pera-alert>
    } @else if (lines() === null) {
      <div class="flex flex-col gap-2" aria-busy="true">
        <pera-skeleton [height]="32" />
        <pera-skeleton [height]="32" />
        <pera-skeleton [height]="32" />
      </div>
    } @else if (lines()!.length === 0) {
      <pera-empty [title]="t('sv.noRecords')" iconName="inbox" data-boq-empty />
    } @else {
      <pera-card padding="none">
        <div class="p-4 border-b border-border">
          <h2 class="m-0 fs-body font-semibold">{{ t('sv.boqT') }}</h2>
          <p class="m-0 mt-1 fs-label text-text-secondary">{{ t('sv.boqSub') }}</p>
        </div>
        <div class="overflow-x-auto">
          <table class="w-full fs-body-sm border-collapse" data-boq>
            <thead>
              <tr class="fs-micro uppercase text-text-muted border-b border-border">
                <th class="text-start p-2">{{ t('sv.module') }}</th>
                <th class="text-start p-2">{{ t('sv.kind') }}</th>
                <th class="text-end p-2">{{ t('sv.occurrences') }}</th>
                <th class="text-end p-2">{{ t('sv.spacesCount') }}</th>
                <th class="text-end p-2">{{ t('sv.totalQty') }}</th>
                <th class="text-end p-2">{{ t('sv.totalArea') }}</th>
                <th class="text-end p-2">{{ t('sv.totalLength') }}</th>
              </tr>
            </thead>
            <tbody>
              @for (l of lines(); track l.moduleCode + '|' + l.kindCode) {
                <tr class="border-b border-border" data-boq-line>
                  <td class="p-2">
                    <pera-badge tone="info" dir="ltr">{{ l.moduleCode }}</pera-badge>
                  </td>
                  <td class="p-2 font-semibold" dir="auto" data-kind>{{ kind(l) }}</td>
                  <td class="p-2 text-end" data-n="occurrences">{{ n(l.occurrences, 0) }}</td>
                  <td class="p-2 text-end" data-n="spaces">{{ n(l.spaces, 0) }}</td>
                  <td class="p-2 text-end font-semibold" data-n="qty">{{ n(l.totalQty) }}</td>
                  <td class="p-2 text-end" data-n="area">{{ n(l.totalAreaSqm) }}</td>
                  <td class="p-2 text-end" data-n="length">{{ n(l.totalLengthM) }}</td>
                </tr>
              }
            </tbody>
          </table>
        </div>
      </pera-card>
    }
  `,
})
export class SiteBoqComponent {
  private readonly api = inject(SiteService);
  private readonly detail = inject(SiteDetailStore);
  private readonly catalog = inject(CatalogService);
  private readonly errors = inject(ErrorHandlerService);

  /** null while loading. */
  protected readonly lines = signal<SiteBoqLine[] | null>(null);
  protected readonly error = signal<string | null>(null);
  private loadedFor: string | null = null;

  constructor() {
    effect(() => {
      const id = this.detail.site()?.id;
      if (!id || id === this.loadedFor) return;
      untracked(() => this.load());
    });
  }

  protected t(key: CatalogKey, params?: Record<string, string | number>): string {
    return this.catalog.t(key, params);
  }

  load(): void {
    const siteId = this.detail.site()?.id;
    if (!siteId) return;
    this.loadedFor = siteId;
    this.lines.set(null);
    this.error.set(null);
    this.api.boq(siteId).subscribe({
      next: (b) => this.lines.set(b.lines),
      error: (err: unknown) =>
        this.error.set(
          err instanceof HttpErrorResponse ? friendly(this.errors.parse(err)) : String(err),
        ),
    });
  }

  protected kind(l: SiteBoqLine): string {
    const name = this.catalog.locale() === 'ar' ? l.nameAr || l.nameEn : l.nameEn || l.nameAr;
    return name || '—';
  }

  protected n(v: number | null, digits = 2): string {
    return formatNumber(v, this.catalog.locale(), digits);
  }
}
