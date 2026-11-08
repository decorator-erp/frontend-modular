import {
  ChangeDetectionStrategy,
  Component,
  computed,
  effect,
  inject,
  input,
  signal,
} from '@angular/core';
import { FormsModule } from '@angular/forms';
import { HttpErrorResponse } from '@angular/common/http';
import {
  PeraAlertComponent,
  PeraEmptyComponent,
  PeraFormFieldComponent,
  PeraPaginationComponent,
  PeraSelectComponent,
  PeraSkeletonComponent,
  SelectOption,
} from '@ds';
import { ErrorHandlerService, friendly } from '@platform/http/error-handler.service';
import { CatalogService } from '@platform/i18n/catalog.service';
import type { CatalogKey } from '@platform/i18n/catalog/en';
import { formatCairoDate } from '@platform/i18n/intl-locale';
import { CrmItemService, PortalRequirementItem } from '../../data/crm-item.service';
import { ApprovalState } from '../../model/crm-enums';
import type { ClientProfileProject } from '../../model';
import { RequirementCategory, RequirementPriority } from '../../model/crm-enums';
import { CATEGORY_KEYS, PRIORITY_KEYS } from './add-requirement.component';

export const PORTAL_ITEMS_PAGE_SIZE = 20;

/**
 * crmp C-1: the client's own requirement items in the portal (replaces the "not available" state).
 * Filters by project, that project's open period, and approval state; paged. Each row shows its
 * approval state and the decision comment (contract §2.14 #105).
 */
@Component({
  selector: 'app-crm-portal-items',
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [
    FormsModule,
    PeraAlertComponent,
    PeraEmptyComponent,
    PeraFormFieldComponent,
    PeraPaginationComponent,
    PeraSelectComponent,
    PeraSkeletonComponent,
  ],
  template: `
    <div class="flex flex-col gap-3">
      <div class="flex flex-wrap gap-3" data-filters>
        <pera-form-field [label]="catalog.t('pitems.project')">
          <pera-select
            name="project"
            [options]="projectOptions()"
            [ngModel]="projectId()"
            (ngModelChange)="setProject($event)"
          />
        </pera-form-field>
        <pera-form-field [label]="catalog.t('pitems.period')">
          <pera-select
            name="period"
            [options]="periodOptions()"
            [ngModel]="periodId()"
            (ngModelChange)="setFilter('period', $event)"
          />
        </pera-form-field>
        <pera-form-field [label]="catalog.t('pitems.status')">
          <pera-select
            name="status"
            [options]="statusOptions()"
            [ngModel]="status()"
            (ngModelChange)="setFilter('status', $event)"
          />
        </pera-form-field>
      </div>

      @if (loading()) {
        <div class="flex flex-col gap-2" aria-busy="true">
          <pera-skeleton [height]="56" />
          <pera-skeleton [height]="56" />
        </div>
      } @else if (error(); as message) {
        <pera-alert tone="warning" data-error>{{ message }}</pera-alert>
      } @else if (items().length) {
        <ul class="m-0 p-0 list-none flex flex-col gap-2" data-items>
          @for (it of items(); track it.id) {
            <li class="border border-border p-3 flex flex-col gap-1" data-item>
              <div class="flex flex-wrap items-center gap-2">
                <span class="fs-body-sm font-medium grow min-w-0">{{ it.title }}</span>
                <span class="fs-label" data-state>{{ stateLabel(it.approvalStatus) }}</span>
              </div>
              <!-- Sync F4e: category and priority, when the row carries them. -->
              @if (categoryLabel(it.category) || priorityLabel(it.priority)) {
                <div class="flex flex-wrap gap-1.5">
                  @if (categoryLabel(it.category); as c) {
                    <span
                      class="fs-micro px-1.5 py-px border border-border bg-bg text-text-secondary"
                      data-category
                      >{{ c }}</span
                    >
                  }
                  @if (priorityLabel(it.priority); as p) {
                    <span
                      class="fs-micro px-1.5 py-px border border-border bg-bg text-text-secondary"
                      data-priority
                      >{{ p }}</span
                    >
                  }
                </div>
              }
              <span class="fs-caption text-text-muted">
                {{ it.projectName }} · {{ date(it.createdAtUtc) }}
                @if (it.room) {
                  · {{ it.room }}
                }
              </span>
              @if (it.decisionComment) {
                <p class="m-0 fs-caption" data-comment>
                  {{ catalog.t('pitems.comment') }}: {{ it.decisionComment }}
                </p>
              }
            </li>
          }
        </ul>
        <pera-pagination
          [page]="page()"
          [pageSize]="pageSize"
          [totalCount]="total()"
          (pageChange)="goTo($event)"
        />
      } @else {
        <pera-empty
          [title]="catalog.t('pitems.empty')"
          [description]="catalog.t('pitems.emptyBody')"
        />
      }
    </div>
  `,
})
export class PortalItemsComponent {
  readonly projects = input<ClientProfileProject[]>([]);
  private readonly api = inject(CrmItemService);
  private readonly errors = inject(ErrorHandlerService);
  protected readonly catalog = inject(CatalogService);

  readonly pageSize = PORTAL_ITEMS_PAGE_SIZE;
  readonly projectId = signal<string | null>(null);
  readonly periodId = signal<string | null>(null);
  readonly status = signal<ApprovalState | null>(null);
  readonly page = signal(1);
  readonly items = signal<PortalRequirementItem[]>([]);
  readonly total = signal(0);
  readonly loading = signal(true);
  readonly error = signal<string | null>(null);
  private generation = 0;

  readonly projectOptions = computed<SelectOption[]>(() => [
    { value: null, label: this.catalog.t('pitems.allProjects') },
    ...this.projects().map((p) => ({ value: p.id, label: p.name })),
  ]);
  /** The portal knows each project's open period only; "any" covers the rest. */
  readonly periodOptions = computed<SelectOption[]>(() => {
    const open = this.projects().find((p) => p.id === this.projectId())?.openPeriodId;
    return [
      { value: null, label: this.catalog.t('pitems.anyPeriod') },
      ...(open ? [{ value: open, label: this.catalog.t('pitems.openPeriod') }] : []),
    ];
  });
  readonly statusOptions = computed<SelectOption[]>(() => [
    { value: null, label: this.catalog.t('pitems.anyStatus') },
    ...[
      ApprovalState.PendingApproval,
      ApprovalState.Approved,
      ApprovalState.Rejected,
      ApprovalState.NotRequired,
    ].map((s) => ({ value: s, label: this.stateLabel(s) })),
  ]);

  constructor() {
    effect(() => {
      this.projects();
      this.reload();
    });
  }

  setProject(id: string | null): void {
    this.projectId.set(id);
    this.periodId.set(null);
    this.page.set(1);
    this.reload();
  }

  setFilter(kind: 'period' | 'status', value: string | number | null): void {
    if (kind === 'period') this.periodId.set(value as string | null);
    else this.status.set(value as ApprovalState | null);
    this.page.set(1);
    this.reload();
  }

  goTo(page: number): void {
    this.page.set(page);
    this.reload();
  }

  reload(): void {
    const gen = ++this.generation;
    this.loading.set(true);
    this.error.set(null);
    this.api
      .listPortal({
        projectId: this.projectId(),
        periodId: this.periodId(),
        status: this.status(),
        pageNumber: this.page(),
        pageSize: this.pageSize,
      })
      .subscribe({
        next: (r) => {
          if (gen !== this.generation) return;
          this.items.set(r.items);
          this.total.set(r.totalCount);
          this.loading.set(false);
        },
        error: (err: HttpErrorResponse) => {
          if (gen !== this.generation) return;
          this.error.set(friendly(this.errors.parse(err)));
          this.loading.set(false);
        },
      });
  }

  categoryLabel(c: number | null | undefined): string {
    const key = c == null ? undefined : CATEGORY_KEYS[c as RequirementCategory];
    return key ? this.catalog.t(key) : '';
  }

  priorityLabel(p: number | null | undefined): string {
    const key = p == null ? undefined : PRIORITY_KEYS[p as RequirementPriority];
    return key ? this.catalog.t(key) : '';
  }

  stateLabel(s: ApprovalState): string {
    return this.catalog.t(`pitems.state.${s}` as CatalogKey);
  }

  date(iso: string): string {
    return iso ? formatCairoDate(iso, this.catalog.locale()) : '';
  }
}
