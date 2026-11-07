import {
  ChangeDetectionStrategy,
  Component,
  effect,
  inject,
  signal,
  untracked,
} from '@angular/core';
import { HttpErrorResponse } from '@angular/common/http';
import { RouterLink } from '@angular/router';
import { catchError, forkJoin, of } from 'rxjs';
import {
  PeraAlertComponent,
  PeraBadgeComponent,
  PeraButtonComponent,
  PeraCardComponent,
  PeraEmptyComponent,
  PeraIconComponent,
  PeraSkeletonComponent,
} from '@ds';
import { ErrorHandlerService, friendly } from '@platform/http/error-handler.service';
import { CatalogService } from '@platform/i18n/catalog.service';
import type { CatalogKey } from '@platform/i18n/catalog/en';
import { SiteService } from '../../data/site.service';
import { formatCell } from '../../model/site-format';
import { localName } from '../../model/site-normalize';
import { siteQuery } from '../../model/site-url';
import type { SitePivot, SiteRecord, SiteSpaceGroup } from '../../model/site.model';
import { SiteDetailStore } from '../../stores/site-detail.store';

/** How many visible values a record row summarises (prototype `spacesTab`, `sites.js:622`). */
const SUMMARY_FIELDS = 4;

/**
 * sites S-6: "By space" (prototype `spacesTab`, `sites.js:616-630`). R12 groups as cards in server
 * order — named spaces, then "Whole unit" (null `spaceId`) last (`RecordContracts.cs:66-71`); each
 * record row shows its module code, label and the first four visible values of its module's pivot
 * (R9, one read per module with records), and links to its capture row (`?tab=capture&m=&r=`).
 */
@Component({
  selector: 'app-site-spaces',
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [
    RouterLink,
    PeraAlertComponent,
    PeraBadgeComponent,
    PeraButtonComponent,
    PeraCardComponent,
    PeraEmptyComponent,
    PeraIconComponent,
    PeraSkeletonComponent,
  ],
  template: `
    @if (error(); as message) {
      <pera-alert tone="danger" data-spaces-error>
        {{ message }}
        <pera-button variant="secondary" size="sm" (click)="load()">{{
          t('sv.retry')
        }}</pera-button>
      </pera-alert>
    } @else if (groups() === null) {
      <div class="grid gap-4 md:grid-cols-2" aria-busy="true">
        <pera-skeleton [height]="160" />
        <pera-skeleton [height]="160" />
      </div>
    } @else if (groups()!.length === 0) {
      <pera-empty [title]="t('sv.noRecords')" iconName="inbox" data-spaces-empty />
    } @else {
      <div class="grid gap-4 md:grid-cols-2" data-space-groups>
        @for (g of groups(); track g.spaceId ?? '') {
          <pera-card padding="none" [attr.data-space]="g.spaceId ?? 'whole'">
            <div class="flex items-start justify-between gap-3 p-4 border-b border-border">
              <div>
                <h2 class="m-0 fs-body font-semibold" dir="auto">
                  {{ g.spaceId ? g.spaceName : t('sv.wholeUnit') }}
                </h2>
                @if (!g.spaceId) {
                  <p class="m-0 mt-1 fs-label text-text-secondary">{{ t('sv.wholeUnitSub') }}</p>
                }
              </div>
              <pera-badge data-count>{{ g.records.length }}</pera-badge>
            </div>
            @for (r of g.records; track r.id) {
              <a
                class="flex items-center gap-3 px-4 py-3 border-b border-border last:border-b-0 hover:bg-surface-muted no-underline text-text-primary"
                [routerLink]="[]"
                [queryParams]="captureQuery(r)"
                [attr.aria-label]="t('sv.openInCapture') + ': ' + r.label"
                [attr.data-record]="r.id"
              >
                <pera-badge tone="info" dir="ltr">{{ moduleCode(r.moduleId) }}</pera-badge>
                <div class="flex-1 min-w-0">
                  <div class="font-semibold" dir="auto">{{ r.label }}</div>
                  @if (summary(r); as s) {
                    <div class="fs-label text-text-secondary truncate" data-summary>{{ s }}</div>
                  }
                </div>
                <pera-icon name="chevron-right" [size]="14" class="inline-flex rtl:rotate-180" />
              </a>
            }
          </pera-card>
        }
      </div>
    }
  `,
})
export class SiteSpacesComponent {
  private readonly api = inject(SiteService);
  private readonly detail = inject(SiteDetailStore);
  private readonly catalog = inject(CatalogService);
  private readonly errors = inject(ErrorHandlerService);

  /** null while loading. */
  protected readonly groups = signal<SiteSpaceGroup[] | null>(null);
  protected readonly error = signal<string | null>(null);
  /** The pivot of each module with records, by module id (a 404 module simply has no summary). */
  private readonly pivots = signal<Record<string, SitePivot | null>>({});
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
    this.error.set(null);
    this.groups.set(null);
    this.api.grouped(siteId).subscribe({
      next: (g) => {
        this.groups.set(g.groups);
        this.loadPivots(siteId, g.groups);
      },
      error: (err: unknown) =>
        this.error.set(
          err instanceof HttpErrorResponse
            ? friendly(this.errors.parse(err))
            : this.t('sv.spacesLoadFailed'),
        ),
    });
  }

  private loadPivots(siteId: string, groups: SiteSpaceGroup[]): void {
    const ids = [...new Set(groups.flatMap((g) => g.records.map((r) => r.moduleId)))];
    if (!ids.length) return;
    forkJoin(
      ids.map((m) => this.api.pivot(siteId, m).pipe(catchError(() => of<SitePivot | null>(null)))),
    ).subscribe((list) => {
      const out: Record<string, SitePivot | null> = {};
      ids.forEach((id, i) => (out[id] = list[i]));
      this.pivots.set(out);
    });
  }

  protected moduleCode(moduleId: string): string {
    return (
      this.detail.modules().find((m) => m.id === moduleId)?.code ??
      this.detail.site()?.recordCounts.find((c) => c.moduleId === moduleId)?.code ??
      this.pivots()[moduleId]?.moduleCode ??
      '—'
    );
  }

  protected captureQuery(r: SiteRecord): Record<string, string> {
    return siteQuery('capture', r.moduleId, r.id);
  }

  /** "Name: value · …" for the first four visible fields (in form order) that hold a value. */
  protected summary(r: SiteRecord): string {
    const pivot = this.pivots()[r.moduleId];
    const row = pivot?.rows.find((x) => x.recordId === r.id);
    if (!pivot || !row) return '';
    const locale = this.catalog.locale();
    return pivot.columns
      .filter((f) => f.isVisible)
      .sort((a, b) => a.sortOrder - b.sortOrder)
      .slice(0, SUMMARY_FIELDS)
      .filter((f) => row.cells[f.code])
      .map(
        (f) =>
          `${localName(f, locale)}: ${formatCell(f, row.cells[f.code], locale, (v) => this.t(v ? 'sv.yes' : 'sv.no'))}`,
      )
      .join(' · ');
  }
}
