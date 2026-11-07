import {
  ChangeDetectionStrategy,
  Component,
  OnInit,
  TemplateRef,
  computed,
  inject,
  viewChild,
} from '@angular/core';
import { FormsModule } from '@angular/forms';
import { ActivatedRoute, Router } from '@angular/router';
import { firstValueFrom } from 'rxjs';
import {
  ModalService,
  PeraAlertComponent,
  PeraBadgeComponent,
  PeraButtonComponent,
  PeraCardComponent,
  PeraChipComponent,
  PeraDataTableComponent,
  PeraEmptyComponent,
  PeraFormFieldComponent,
  PeraPageHeaderComponent,
  PeraSelectComponent,
  PeraSkeletonComponent,
  PeraStatusBadgeComponent,
  type ColumnDef,
  type SelectOption,
} from '@ds';
import { isProjectClosed, type Project } from '@modules/projects';
import { ToastService } from '@platform/feedback/toast.service';
import { ErrorHandlerService } from '@platform/http/error-handler.service';
import { CatalogService } from '@platform/i18n/catalog.service';
import type { CatalogKey } from '@platform/i18n/catalog/en';
import { formatCairoDate } from '@platform/i18n/intl-locale';
import { SiteService } from '../../data/site.service';
import { SITE_STATUS_LABEL, SITE_STATUS_TONE, SiteStatus } from '../../model/site-enums';
import { failureOutcome, type WriteOutcome } from '../../model/site-errors';
import type { SiteListItem, SiteUnitData } from '../../model/site.model';
import { SITE_PAGE_SIZE, SiteListStore } from '../../stores/site-list.store';
import {
  SiteUnitDialogComponent,
  type SiteUnitDialogData,
} from '../detail/site-unit-dialog.component';

const STATUS_ORDER = [
  SiteStatus.Draft,
  SiteStatus.Submitted,
  SiteStatus.Approved,
  SiteStatus.Rejected,
] as const;

/** Codes after which the picker's projects are re-read: the level or the project changed (U3). */
const PROJECT_REFRESH_CODES = new Set([
  'sites.InsufficientLevel',
  'sites.ProjectClosed',
  'sites.ProjectNotFound',
]);

/**
 * sites S-2: `/sites` — one project's surveys (prototype `sites.js:263-296`). Project picker (projects
 * with a level; `?projectId` preselects), level and closed chips, status pills with counts and the KPI
 * row (DEVIATION-S4), the paged table, and "New survey" (`sites.create` + Editor + open project).
 */
@Component({
  selector: 'app-site-list',
  changeDetection: ChangeDetectionStrategy.OnPush,
  providers: [SiteListStore],
  imports: [
    FormsModule,
    PeraAlertComponent,
    PeraBadgeComponent,
    PeraButtonComponent,
    PeraCardComponent,
    PeraChipComponent,
    PeraDataTableComponent,
    PeraEmptyComponent,
    PeraFormFieldComponent,
    PeraPageHeaderComponent,
    PeraSelectComponent,
    PeraSkeletonComponent,
    PeraStatusBadgeComponent,
  ],
  template: `
    <pera-page-header [title]="t('sv.listTitle')">
      @if (store.canCreate()) {
        <pera-button actions variant="primary" iconStart="plus" (click)="create()" data-new-survey>
          {{ t('sv.newSurvey') }}
        </pera-button>
      }
    </pera-page-header>

    <div class="px-8 py-6 flex flex-col gap-4">
      <p class="m-0 fs-body-sm text-text-secondary">{{ t('sv.listSub') }}</p>

      @if (store.projectsLoading()) {
        <div class="flex flex-col gap-2" aria-busy="true">
          <pera-skeleton [height]="36" width="40%" />
          <pera-skeleton [height]="96" />
        </div>
      } @else if (store.projectsError(); as message) {
        <pera-alert tone="danger">
          {{ message }}
          <pera-button variant="secondary" size="sm" (click)="store.refreshProjects()">{{
            t('sv.retry')
          }}</pera-button>
        </pera-alert>
      } @else if (store.projects().length === 0) {
        <pera-empty
          [title]="t('sv.noProjects')"
          [description]="t('sv.noProjectsSub')"
          iconName="briefcase"
        />
      } @else {
        <div class="flex items-end justify-between gap-4 flex-wrap">
          <div class="flex items-end gap-3 flex-wrap">
            <pera-form-field [label]="t('sv.pickProject')" class="min-w-64">
              <pera-select
                [options]="projectOptions()"
                [placeholder]="t('sv.pickProject')"
                [ngModel]="store.projectId()"
                (ngModelChange)="pick($event)"
                data-project-picker
              />
            </pera-form-field>
            @if (store.project(); as p) {
              <pera-badge tone="accent" [dot]="true" data-level-chip>{{
                t('sv.level', { l: levelLabel(p) })
              }}</pera-badge>
              @if (closed()) {
                <pera-badge tone="warning" data-closed-chip>{{ projectStatusLabel(p) }}</pera-badge>
              }
            }
          </div>
          <div
            class="flex items-center gap-2 flex-wrap"
            role="group"
            [attr.aria-label]="t('sv.statusFilter')"
          >
            <pera-chip
              [on]="store.status() === null"
              (toggled)="store.setStatus(null)"
              data-pill="all"
            >
              {{ t('sv.all') }} {{ store.totalAll() ?? '' }}
            </pera-chip>
            @for (s of statuses; track s) {
              <pera-chip
                [on]="store.status() === s"
                (toggled)="store.setStatus(s)"
                [attr.data-pill]="s"
              >
                {{ statusLabel(s) }} {{ count(s) }}
              </pera-chip>
            }
          </div>
        </div>

        @if (closed() && store.project(); as p) {
          <pera-alert tone="warning" data-closed-banner>{{
            t('sv.closedBanner', { s: projectStatusLabel(p) })
          }}</pera-alert>
        }

        <div class="grid grid-cols-2 lg:grid-cols-4 gap-4">
          @for (s of statuses; track s) {
            <pera-card [attr.data-kpi]="s">
              <div class="fs-micro uppercase text-text-muted">{{ statusLabel(s) }}</div>
              <div class="fs-h2 font-semibold mt-1">{{ count(s) }}</div>
              @if (s === submitted) {
                <div class="fs-label text-text-muted mt-1">{{ t('sv.kpiAwaiting') }}</div>
              }
            </pera-card>
          }
        </div>

        @if (store.error(); as message) {
          <pera-alert tone="danger" data-list-error>
            {{ message }}
            <pera-button variant="secondary" size="sm" (click)="store.reload()">{{
              t('sv.retry')
            }}</pera-button>
          </pera-alert>
        } @else {
          <pera-data-table
            [columns]="columns()"
            [rows]="store.page()?.items ?? []"
            [rowId]="rowId"
            [loading]="store.loading()"
            [hasRowClick]="true"
            [page]="store.pageIndex()"
            [pageSize]="pageSize"
            [totalCount]="store.page()?.totalCount ?? 0"
            [empty]="{
              title: t('sv.noSurveys'),
              description: store.canCreate() ? t('sv.noSurveysSub') : undefined,
            }"
            (pageChange)="store.setPage($event)"
            (rowClick)="open($event)"
          />
        }
      }
    </div>

    <ng-template #statusTpl let-row>
      <pera-status-badge [tone]="tone(row.status)" [label]="statusLabel(row.status)" />
    </ng-template>
  `,
})
export class SiteListComponent implements OnInit {
  protected readonly store = inject(SiteListStore);
  private readonly api = inject(SiteService);
  private readonly modal = inject(ModalService);
  private readonly router = inject(Router);
  private readonly route = inject(ActivatedRoute);
  private readonly toast = inject(ToastService);
  private readonly errors = inject(ErrorHandlerService);
  private readonly catalog = inject(CatalogService);

  private readonly statusTpl = viewChild.required<TemplateRef<unknown>>('statusTpl');

  protected readonly statuses = STATUS_ORDER;
  protected readonly submitted = SiteStatus.Submitted;
  protected readonly pageSize = SITE_PAGE_SIZE;
  protected readonly rowId = (row: SiteListItem) => row.id;

  protected readonly closed = computed(() => {
    const p = this.store.project();
    return !!p && isProjectClosed(p);
  });

  protected readonly projectOptions = computed<SelectOption[]>(() =>
    this.store.projects().map((p) => ({ value: p.id, label: `${p.code} · ${p.name}` })),
  );

  protected readonly columns = computed<ColumnDef<SiteListItem>[]>(() => {
    this.catalog.locale();
    return [
      { key: 'code', header: this.t('sv.code') },
      { key: 'status', header: this.t('sv.status'), template: this.statusTpl() },
      { key: 'address', header: this.t('sv.address'), value: (r) => r.address || '—' },
      {
        key: 'surveyedOn',
        header: this.t('sv.surveyedOn'),
        value: (r) => (r.surveyedOn ? this.date(r.surveyedOn) : '—'),
      },
      {
        key: 'createdAtUtc',
        header: this.t('sv.created'),
        value: (r) => this.date(r.createdAtUtc),
      },
    ];
  });

  ngOnInit(): void {
    this.store.loadProjects(this.route.snapshot.queryParamMap.get('projectId'));
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

  protected count(s: number): string {
    const c = this.store.counts();
    return c ? String(c[s] ?? 0) : '';
  }

  protected levelLabel(p: Project): string {
    return this.t(`sv.e.ProjectLevel.${p.myLevel}` as CatalogKey);
  }

  protected projectStatusLabel(p: Project): string {
    return this.t(
      (p.isActive ? `sv.projectStatus.${p.status}` : 'sv.projectStatus.Inactive') as CatalogKey,
    );
  }

  private date(iso: string): string {
    return formatCairoDate(iso.length === 10 ? `${iso}T12:00:00Z` : iso, this.catalog.locale());
  }

  protected pick(projectId: unknown): void {
    if (typeof projectId === 'string' && projectId !== this.store.projectId()) {
      this.store.select(projectId);
    }
  }

  protected open(row: SiteListItem): void {
    void this.router.navigate(['/sites', row.id]);
  }

  protected create(): void {
    const data: SiteUnitDialogData = {
      mode: 'create',
      projects: this.store.creatableProjects(),
      projectId: this.store.projectId(),
      save: (projectId, unit) => this.save(projectId, unit),
    };
    void this.modal
      .open<string | true>(SiteUnitDialogComponent, { size: 'lg', data })
      .afterClosed()
      .then((id) => {
        if (typeof id === 'string' && id) void this.router.navigate(['/sites', id]);
      });
  }

  private async save(projectId: string, unit: SiteUnitData): Promise<WriteOutcome<string>> {
    try {
      const id = await firstValueFrom(this.api.create(projectId, unit));
      this.toast.show({ tone: 'success', message: this.t('sv.saved') });
      return { ok: true, value: id };
    } catch (err) {
      const outcome = failureOutcome(err, (e) => this.errors.parse(e));
      if (outcome.code && PROJECT_REFRESH_CODES.has(outcome.code)) this.store.refreshProjects();
      return outcome;
    }
  }
}
