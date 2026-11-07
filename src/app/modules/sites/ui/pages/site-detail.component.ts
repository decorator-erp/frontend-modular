import { ChangeDetectionStrategy, Component, computed, inject } from '@angular/core';
import { toSignal } from '@angular/core/rxjs-interop';
import { ActivatedRoute, Router, RouterLink } from '@angular/router';
import { map } from 'rxjs';
import {
  ConfirmService,
  ModalService,
  PeraAlertComponent,
  PeraBadgeComponent,
  PeraButtonComponent,
  PeraDropdownComponent,
  PeraEmptyComponent,
  PeraIconComponent,
  PeraSkeletonComponent,
  PeraStatusBadgeComponent,
  PeraTabsComponent,
  type TabDef,
} from '@ds';
import { isProjectClosed } from '@modules/projects';
import { CatalogService } from '@platform/i18n/catalog.service';
import type { CatalogKey } from '@platform/i18n/catalog/en';
import { formatCairoDateTime } from '@platform/i18n/intl-locale';
import { SITE_STATUS_LABEL, SITE_STATUS_TONE, SiteStatus } from '../../model/site-enums';
import { parseSiteTab, siteQuery, type SiteTab } from '../../model/site-url';
import { SiteDetailStore } from '../../stores/site-detail.store';
import {
  SiteDecideDialogComponent,
  type SiteDecideDialogData,
} from '../detail/site-decide-dialog.component';
import { SiteCaptureComponent } from '../detail/site-capture.component';
import { SiteOverviewComponent } from '../detail/site-overview.component';
import { SiteSpacesComponent } from '../detail/site-spaces.component';
import { SiteFamiliesComponent } from '../detail/site-families.component';
import {
  SiteUnitDialogComponent,
  type SiteUnitDialogData,
} from '../detail/site-unit-dialog.component';

/** The tabs built so far; the others (boq, documents) land with S-8..S-9. */
const BUILT_TABS: readonly SiteTab[] = ['overview', 'capture', 'spaces', 'families'];

/**
 * sites S-3 / S-4: `/sites/:siteId` — header (code, status, project link, level chip), the actions
 * `caps()` allows (hidden, not disabled; U3–U5), the banners (closed / submitted / decided / viewer;
 * `sites.js:366-372`) and the tabs held in `?tab=` (`&m=` on capture).
 */
@Component({
  selector: 'app-site-detail',
  changeDetection: ChangeDetectionStrategy.OnPush,
  providers: [SiteDetailStore],
  imports: [
    RouterLink,
    PeraAlertComponent,
    PeraBadgeComponent,
    PeraButtonComponent,
    PeraDropdownComponent,
    PeraEmptyComponent,
    PeraIconComponent,
    PeraSkeletonComponent,
    PeraStatusBadgeComponent,
    PeraTabsComponent,
    SiteOverviewComponent,
    SiteCaptureComponent,
    SiteSpacesComponent,
    SiteFamiliesComponent,
  ],
  template: `
    @if (store.notFound()) {
      <div class="px-8 py-10" data-not-found>
        <pera-empty
          [title]="t('sv.notFound')"
          [description]="t('sv.notFoundSub')"
          iconName="alert-circle"
          [cta]="backCta"
        />
      </div>
    } @else if (store.error() && !store.site()) {
      <div class="px-8 py-6">
        <pera-alert tone="danger" data-detail-error>
          {{ store.error() }}
          <pera-button variant="secondary" size="sm" (click)="store.reload()">{{
            t('sv.retry')
          }}</pera-button>
        </pera-alert>
      </div>
    } @else if (!store.site()) {
      <div class="px-8 py-6 flex flex-col gap-3" aria-busy="true">
        <pera-skeleton [height]="40" width="30%" />
        <pera-skeleton [height]="20" width="50%" />
        <pera-skeleton [height]="240" />
      </div>
    } @else if (store.site(); as s) {
      <header class="bg-surface border-b border-border px-8 pt-7">
        <div class="flex items-start justify-between gap-6 flex-wrap mb-5">
          <div class="flex flex-col gap-2">
            <div class="flex items-center gap-3">
              <h1 class="m-0 font-semibold fs-h1" dir="ltr">{{ s.code }}</h1>
              <pera-status-badge
                [tone]="tone(s.status)"
                [label]="statusLabel(s.status)"
                data-status
              />
            </div>
            <div class="flex items-center gap-2 flex-wrap fs-body-sm text-text-secondary">
              @if (store.project(); as p) {
                <a
                  class="text-accent underline"
                  [routerLink]="['/projects', p.id]"
                  data-project-link
                  >{{ p.code }} · {{ p.name }}</a
                >
                <span>· {{ p.clientName }}</span>
                <pera-badge tone="accent" [dot]="true" data-level-chip>{{
                  t('sv.level', { l: t(levelKey(p.myLevel)) })
                }}</pera-badge>
              }
            </div>
          </div>
          <div class="flex items-center gap-2 flex-wrap" data-actions>
            @if (caps().edit) {
              <pera-button
                iconStart="pencil"
                [disabled]="store.busy()"
                (click)="editUnit()"
                data-act="edit"
              >
                {{ t('sv.editUnit') }}
              </pera-button>
            }
            @if (caps().submit) {
              <pera-button
                variant="primary"
                iconStart="check"
                [loading]="store.busy()"
                [disabled]="store.busy()"
                (click)="submit()"
                data-act="submit"
                >{{ t('sv.submit') }}</pera-button
              >
            }
            @if (caps().decide) {
              <pera-button
                iconStart="x"
                [disabled]="store.busy()"
                (click)="decide(false)"
                data-act="reject"
              >
                {{ t('sv.reject') }}
              </pera-button>
              @if (caps().approve) {
                <pera-button
                  variant="primary"
                  iconStart="check"
                  [disabled]="store.busy()"
                  (click)="decide(true)"
                  data-act="approve"
                  >{{ t('sv.approve') }}</pera-button
                >
              }
            }
            @if (caps().reopen) {
              <pera-button
                variant="primary"
                [loading]="store.busy()"
                [disabled]="store.busy()"
                (click)="reopen()"
                data-act="reopen"
                >{{ t('sv.reopen') }}</pera-button
              >
            }
            @if (caps().del) {
              <pera-dropdown>
                <button
                  trigger
                  type="button"
                  class="inline-flex items-center justify-center w-8 h-8 text-text-secondary hover:bg-surface-muted cursor-pointer"
                  [attr.aria-label]="t('sv.more')"
                  aria-haspopup="menu"
                  data-act="more"
                >
                  <pera-icon name="more-vertical" [size]="16" />
                </button>
                <button
                  type="button"
                  role="menuitem"
                  class="w-full text-start px-3 py-2 text-danger hover:bg-surface-muted cursor-pointer"
                  [disabled]="store.busy()"
                  (click)="remove()"
                  data-act="delete"
                >
                  {{ t('sv.deleteSurvey') }}
                </button>
              </pera-dropdown>
            }
          </div>
        </div>
        <div class="flex flex-col gap-2 mb-4" data-banners>
          @if (caps().closed && store.project(); as p) {
            <pera-alert tone="warning" data-banner="closed">{{
              t(s.status === submitted ? 'sv.closedBannerDecide' : 'sv.closedBanner', {
                s: projectStatusLabel(),
              })
            }}</pera-alert>
          }
          @if (s.status === submitted && s.submittedAtUtc) {
            <pera-alert tone="info" data-banner="submitted">{{
              t('sv.submittedBannerNoName', { d: dateTime(s.submittedAtUtc) })
            }}</pera-alert>
          }
          @if (s.status === approved) {
            <pera-alert tone="success" data-banner="approved"
              >{{ t('sv.approvedBanner', { n: nameOf(s.decidedById), d: dateTime(s.decidedAtUtc) })
              }}{{ s.decisionNote ? ' — “' + s.decisionNote + '”' : '' }}</pera-alert
            >
          }
          @if (s.status === rejected) {
            <pera-alert tone="danger" data-banner="rejected">
              {{ t('sv.rejectedBanner', { n: nameOf(s.decidedById) })
              }}{{ s.decisionNote ? ' — “' + s.decisionNote + '”' : '' }}
              @if (!caps().reopen) {
                <div class="fs-label mt-1">{{ t('sv.rejectedHint') }}</div>
              }
            </pera-alert>
          }
          @if (store.project()?.myLevel === 'Viewer') {
            <pera-alert tone="info" data-banner="viewer">{{ t('sv.viewerBanner') }}</pera-alert>
          }
          @if (caps().selfApproval) {
            <pera-alert tone="info" data-banner="self">{{ t('sv.selfApprovalHint') }}</pera-alert>
          }
          @if (store.decisionBlocked(); as message) {
            <pera-alert tone="warning" data-banner="blocked">{{ message }}</pera-alert>
          }
          @if (store.actionError(); as message) {
            <pera-alert tone="danger" data-banner="action">{{ message }}</pera-alert>
          }
        </div>
        <pera-tabs [tabs]="tabs()" [activeId]="tab()" (activeChange)="go($event)" />
      </header>
      <div class="px-8 py-6">
        @switch (tab()) {
          @case ('capture') {
            <app-site-capture [moduleId]="moduleId()" [recordId]="recordId()" />
          }
          @case ('spaces') {
            <app-site-spaces />
          }
          @case ('families') {
            <app-site-families />
          }
          @default {
            <app-site-overview (editUnit)="editUnit()" />
          }
        }
      </div>
    }
  `,
})
export class SiteDetailComponent {
  protected readonly store = inject(SiteDetailStore);
  private readonly route = inject(ActivatedRoute);
  private readonly router = inject(Router);
  private readonly modal = inject(ModalService);
  private readonly confirm = inject(ConfirmService);
  private readonly catalog = inject(CatalogService);

  protected readonly submitted = SiteStatus.Submitted;
  protected readonly approved = SiteStatus.Approved;
  protected readonly rejected = SiteStatus.Rejected;
  protected readonly caps = this.store.caps;
  protected readonly backCta = {
    label: this.catalog.t('sv.backToList'),
    action: () => void this.router.navigate(['/sites']),
  };

  private readonly query = toSignal(this.route.queryParamMap, {
    initialValue: this.route.snapshot.queryParamMap,
  });

  protected readonly tab = computed<SiteTab>(() => {
    const t = parseSiteTab(this.query().get('tab'));
    return BUILT_TABS.includes(t) ? t : 'overview';
  });
  protected readonly moduleId = computed(() => this.query().get('m'));
  protected readonly recordId = computed(() => this.query().get('r'));

  protected readonly tabs = computed<TabDef[]>(() => {
    const s = this.store.site();
    const records = (s?.recordCounts ?? []).reduce((n, c) => n + c.recordCount, 0);
    return BUILT_TABS.map((id) => ({
      id,
      label:
        id === 'capture'
          ? `${this.t('sv.tab.capture')} ${records}`
          : this.t(`sv.tab.${id}` as CatalogKey),
    }));
  });

  constructor() {
    this.route.paramMap
      .pipe(map((p) => p.get('siteId') ?? ''))
      .subscribe((id) => id && this.store.load(id));
  }

  protected t(key: CatalogKey, params?: Record<string, string | number>): string {
    return this.catalog.t(key, params);
  }

  protected statusLabel(s: number): string {
    return this.t(SITE_STATUS_LABEL[s] ?? 'sv.none');
  }

  protected tone(s: SiteStatus) {
    return SITE_STATUS_TONE[s] ?? 'neutral';
  }

  protected levelKey(level: string): CatalogKey {
    return `sv.e.ProjectLevel.${level}` as CatalogKey;
  }

  protected projectStatusLabel(): string {
    const p = this.store.project();
    if (!p) return '';
    return this.t(
      (p.isActive && isProjectClosed(p)
        ? `sv.projectStatus.${p.status}`
        : 'sv.projectStatus.Inactive') as CatalogKey,
    );
  }

  protected nameOf(id: string | null): string {
    return this.store.name(id) ?? '—';
  }

  protected dateTime(iso: string | null): string {
    return iso ? formatCairoDateTime(iso, this.catalog.locale()) : '—';
  }

  protected go(tab: string): void {
    const t = parseSiteTab(tab);
    void this.router.navigate([], {
      relativeTo: this.route,
      queryParams: siteQuery(t, t === 'capture' ? this.moduleId() : null),
    });
  }

  protected editUnit(): void {
    const s = this.store.site();
    if (!s || !this.caps().edit) return;
    const data: SiteUnitDialogData = {
      mode: 'edit',
      code: s.code,
      initial: { ...s },
      save: (_p, unit) => this.store.updateUnit(unit),
    };
    this.modal.open(SiteUnitDialogComponent, { size: 'lg', data });
  }

  protected async submit(): Promise<void> {
    const s = this.store.site();
    if (!s || this.store.busy()) return;
    const ok = await this.confirm.open({
      title: this.t('sv.submitQ', { c: s.code }),
      body: this.t('sv.submitBody'),
      confirmLabel: this.t('sv.submit'),
      cancelLabel: this.t('sv.cancel'),
    });
    if (!ok) return;
    const outcome = await this.store.submit();
    if (!outcome.ok && outcome.message) this.store.actionError.set(outcome.message);
  }

  protected decide(approve: boolean): void {
    const s = this.store.site();
    if (!s || this.store.busy()) return;
    const data: SiteDecideDialogData = {
      approve,
      code: s.code,
      save: (note) => this.store.decide(approve, note),
    };
    this.modal.open(SiteDecideDialogComponent, { size: 'md', data });
  }

  protected async reopen(): Promise<void> {
    const s = this.store.site();
    if (!s || this.store.busy()) return;
    const ok = await this.confirm.open({
      title: this.t('sv.reopenQ', { c: s.code }),
      body: this.t('sv.reopenBody'),
      confirmLabel: this.t('sv.reopen'),
      cancelLabel: this.t('sv.cancel'),
    });
    if (!ok) return;
    const outcome = await this.store.reopen();
    if (!outcome.ok && outcome.message) this.store.actionError.set(outcome.message);
  }

  protected async remove(): Promise<void> {
    const s = this.store.site();
    if (!s || this.store.busy()) return;
    const ok = await this.confirm.open({
      title: this.t('sv.deleteQ', { c: s.code }),
      body: this.t('sv.deleteBody'),
      confirmLabel: this.t('sv.deleteSurvey'),
      cancelLabel: this.t('sv.cancel'),
      tone: 'danger',
    });
    if (!ok) return;
    const outcome = await this.store.remove();
    if (outcome.ok)
      void this.router.navigate(['/sites'], { queryParams: { projectId: s.projectId } });
    else if (outcome.message) this.store.actionError.set(outcome.message);
  }
}
