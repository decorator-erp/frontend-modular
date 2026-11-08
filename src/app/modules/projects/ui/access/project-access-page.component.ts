import {
  ChangeDetectionStrategy,
  Component,
  OnInit,
  computed,
  inject,
  signal,
} from '@angular/core';
import { FormsModule } from '@angular/forms';
import { HttpErrorResponse } from '@angular/common/http';
import { ActivatedRoute, RouterLink } from '@angular/router';
import { catchError, forkJoin, of } from 'rxjs';
import {
  ConfirmService,
  ModalService,
  PeraAlertComponent,
  PeraBadgeComponent,
  PeraButtonComponent,
  PeraEmptyComponent,
  PeraFormFieldComponent,
  PeraPageHeaderComponent,
  PeraSelectComponent,
  PeraSkeletonComponent,
  PeraStatusBadgeComponent,
  SelectOption,
  StatusBadgeTone,
} from '@ds';
import { EmployeeService } from '@modules/people';
import { injectReloadOnConflict } from '@platform/http/concurrency';
import { ErrorHandlerService, friendly } from '@platform/http/error-handler.service';
import { ToastService } from '@platform/feedback/toast.service';
import { CatalogService } from '@platform/i18n/catalog.service';
import type { CatalogKey } from '@platform/i18n/catalog/en';
import { formatCairoDateTime } from '@platform/i18n/intl-locale';
import { PermissionsService } from '@platform/permissions';
import { ProjectService } from '../../data/project.service';
import { ProjectAccessGrantService } from '../../data/project-access-grant.service';
import { ProjectAccessStore } from '../../stores/project-access.store';
import {
  GRANT_REASON_MAX,
  GrantStatus,
  ProjectAccessGrant,
  isGrantOpen,
} from '../../model/access-grant.model';
import type { ProjectDetails } from '../../model/project.model';
import { canManageGrants, grantLevelCap } from '../../model/project-access';
import { GrantFormDialogComponent, GrantFormDialogData } from './grant-form-dialog.component';

type LoadState = 'loading' | 'ready' | 'error' | 'notFound' | 'notAllowed';
type Filter = 'current' | 'all';

const STATUS_TONE: Record<GrantStatus, StatusBadgeTone> = {
  Upcoming: 'info',
  Active: 'success',
  Expired: 'neutral',
  Revoked: 'error',
};

/**
 * crmp P1-B: the project's Access tab (`projects/:id/access`). Lists every grant (active and upcoming
 * by default, or all) with who, level, areas, stages, window, reason, granter and status; revoked rows
 * add who revoked, when and why. "Grant access" and Edit open `GrantFormDialogComponent`; Revoke asks
 * through `ConfirmService` with an optional reason, then re-reads the list at once. Only a
 * `project.manage_access` holder or a Manager by membership manages grants (403
 * `projects.access_grants.NotAllowed` otherwise, shown as the page's own state).
 */
@Component({
  selector: 'app-project-access-page',
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [
    FormsModule,
    RouterLink,
    PeraAlertComponent,
    PeraBadgeComponent,
    PeraButtonComponent,
    PeraEmptyComponent,
    PeraFormFieldComponent,
    PeraPageHeaderComponent,
    PeraSelectComponent,
    PeraSkeletonComponent,
    PeraStatusBadgeComponent,
  ],
  template: `
    <div class="flex flex-col gap-4 p-6 max-w-5xl">
      <a class="fs-label text-text-muted hover:text-accent" [routerLink]="['/projects', projectId]">
        {{ t('pa.back') }}
      </a>

      @switch (state()) {
        @case ('loading') {
          <div class="flex flex-col gap-2" aria-busy="true" data-loading>
            <pera-skeleton [height]="28" width="40%" />
            <pera-skeleton [height]="72" />
            <pera-skeleton [height]="72" />
          </div>
        }
        @case ('notFound') {
          <pera-empty
            [title]="t('pa.notFound')"
            [description]="t('pa.notFoundBody')"
            iconName="search"
            data-not-found
          />
        }
        @case ('notAllowed') {
          <pera-empty
            [title]="t('pa.notAllowed')"
            [description]="t('pa.notAllowedBody')"
            iconName="lock"
            data-not-allowed
          />
        }
        @case ('error') {
          <pera-alert tone="danger" data-error>
            {{ t('pa.loadFailed') }}
            <pera-button variant="ghost" size="sm" (click)="load()">{{
              t('pa.retry')
            }}</pera-button>
          </pera-alert>
        }
        @case ('ready') {
          <pera-page-header [title]="t('pa.title')" [count]="visible().length" />
          <p class="m-0 fs-body-sm text-text-secondary">{{ t('pa.subtitle') }}</p>

          @if (inlineError(); as message) {
            <pera-alert tone="danger" data-inline-error>{{ message }}</pera-alert>
          }

          <div class="flex flex-wrap items-end gap-3">
            <pera-form-field [label]="t('pa.filter')">
              <pera-select
                [options]="filterOptions"
                [ngModel]="filter()"
                (ngModelChange)="filter.set($event)"
                data-filter
              />
            </pera-form-field>
            <span class="grow"></span>
            <pera-button
              variant="primary"
              [disabled]="busy()"
              (click)="openCreate()"
              data-grant-access
              >{{ t('pa.grant') }}</pera-button
            >
          </div>

          @if (visible().length) {
            <ul class="m-0 p-0 list-none flex flex-col border border-border-soft" data-grants>
              @for (g of visible(); track g.id) {
                <li
                  class="flex flex-col gap-2 px-4 py-3 border-b border-border-soft last:border-b-0"
                  data-grant-row
                  [attr.data-status]="g.status"
                >
                  <div class="flex flex-wrap items-center gap-2">
                    <span class="fs-body-sm font-medium grow min-w-0 truncate" data-name>{{
                      nameOf(g.employeeId, g.employeeName)
                    }}</span>
                    <pera-status-badge
                      [tone]="tone(g.status)"
                      [label]="t('pa.status.' + g.status)"
                      data-status-chip
                    />
                    <span class="fs-label" data-level>{{ t('grants.level.' + g.level) }}</span>
                  </div>
                  <div class="flex flex-wrap items-center gap-1.5" data-areas>
                    @for (a of g.areas; track a) {
                      <pera-badge>{{ t('grants.area.' + a) }}</pera-badge>
                    }
                  </div>
                  <div class="fs-caption text-text-secondary flex flex-wrap gap-x-3 gap-y-1">
                    <span data-stages>{{ stagesOf(g) }}</span>
                    <span data-window>{{ windowOf(g) }}</span>
                  </div>
                  <div class="fs-caption text-text-secondary" data-reason>
                    {{ t('pa.revokeReason', { reason: g.reason }) }}
                  </div>
                  <div class="fs-caption text-text-muted" data-granted-by>
                    {{
                      t('pa.grantedBy', { name: nameOf(g.grantedById), date: when(g.grantedAtUtc) })
                    }}
                  </div>
                  @if (g.status === 'Revoked') {
                    <div class="fs-caption text-text-muted" data-revoked-by>
                      {{
                        t('pa.revokedBy', {
                          name: nameOf(g.revokedById),
                          date: when(g.revokedAtUtc),
                        })
                      }}
                      @if (g.revokeReason) {
                        · {{ t('pa.revokeReason', { reason: g.revokeReason }) }}
                      }
                    </div>
                  }
                  @if (open(g)) {
                    <div class="flex gap-2">
                      <pera-button
                        variant="secondary"
                        size="sm"
                        [disabled]="busy()"
                        (click)="openEdit(g)"
                        data-edit
                        >{{ t('pa.edit') }}</pera-button
                      >
                      <pera-button
                        variant="danger"
                        size="sm"
                        [disabled]="busy()"
                        (click)="revoke(g)"
                        data-revoke
                        >{{ t('pa.revoke') }}</pera-button
                      >
                    </div>
                  }
                </li>
              }
            </ul>
          } @else {
            <pera-empty
              [title]="t('pa.empty')"
              [description]="t(grants().length ? 'pa.emptyCurrent' : 'pa.emptyBody')"
              iconName="users"
              data-empty
            />
          }
        }
      }
    </div>
  `,
})
export class ProjectAccessPageComponent implements OnInit {
  private readonly route = inject(ActivatedRoute);
  private readonly projects = inject(ProjectService);
  private readonly api = inject(ProjectAccessGrantService);
  private readonly directory = inject(EmployeeService);
  private readonly errors = inject(ErrorHandlerService);
  private readonly toast = inject(ToastService);
  private readonly confirm = inject(ConfirmService);
  private readonly modal = inject(ModalService);
  private readonly permissions = inject(PermissionsService);
  private readonly access = inject(ProjectAccessStore);
  private readonly reloadOnConflict = injectReloadOnConflict();
  private readonly catalog = inject(CatalogService);

  readonly projectId = this.route.snapshot.paramMap.get('id') ?? '';
  readonly state = signal<LoadState>('loading');
  readonly details = signal<ProjectDetails | null>(null);
  readonly grants = signal<ProjectAccessGrant[]>([]);
  readonly names = signal<Map<string, string>>(new Map());
  readonly filter = signal<Filter>('current');
  readonly busy = signal(false);
  readonly inlineError = signal<string | null>(null);

  readonly filterOptions: SelectOption[] = [
    { value: 'current', label: this.t('pa.filter.current') },
    { value: 'all', label: this.t('pa.filter.all') },
  ];

  readonly visible = computed(() =>
    this.filter() === 'all' ? this.grants() : this.grants().filter((g) => isGrantOpen(g)),
  );

  ngOnInit(): void {
    this.load();
  }

  t(key: string, params?: Record<string, string | number>): string {
    return this.catalog.t(key as CatalogKey, params);
  }

  load(): void {
    this.state.set('loading');
    this.inlineError.set(null);
    forkJoin({
      details: this.projects.getDetails(this.projectId),
      employees: this.directory
        .listPaged({ page: 1, pageSize: 500 })
        .pipe(catchError(() => of({ items: [] as { id: string; fullName: string }[] }))),
    }).subscribe({
      next: ({ details, employees }) => {
        this.details.set(details);
        this.access.seed(details.project);
        this.names.set(new Map((employees?.items ?? []).map((e) => [e.id, e.fullName])));
        if (!canManageGrants(details.myAccess, (p) => this.permissions.can(p))) {
          this.state.set('notAllowed');
          return;
        }
        this.loadGrants(true);
      },
      error: (err: HttpErrorResponse) => this.state.set(err.status === 404 ? 'notFound' : 'error'),
    });
  }

  private loadGrants(first = false): void {
    this.api.list(this.projectId).subscribe({
      next: (list) => {
        this.grants.set(list);
        this.state.set('ready');
      },
      error: (err: HttpErrorResponse) => {
        if (!first) {
          this.inlineError.set(friendly(this.errors.parse(err)));
          return;
        }
        this.state.set(
          err.status === 404 ? 'notFound' : err.status === 403 ? 'notAllowed' : 'error',
        );
      },
    });
  }

  open(g: ProjectAccessGrant): boolean {
    return isGrantOpen(g);
  }

  tone(status: GrantStatus): StatusBadgeTone {
    return STATUS_TONE[status];
  }

  nameOf(id: string | null, fallback?: string | null): string {
    if (fallback) return fallback;
    if (!id) return this.t('pa.someone');
    return this.names().get(id) ?? id;
  }

  when(iso: string | null | undefined): string {
    return iso ? formatCairoDateTime(iso, this.catalog.locale()) : '—';
  }

  stagesOf(g: ProjectAccessGrant): string {
    if (!g.stageIds.length) return this.t('grants.wholeProject');
    const byId = new Map((this.details()?.stages ?? []).map((s) => [s.id, s.name]));
    return g.stageIds.map((id) => byId.get(id) ?? id).join(this.t('grants.listSep'));
  }

  windowOf(g: ProjectAccessGrant): string {
    const start =
      g.status === 'Upcoming'
        ? this.t('pa.starts', { date: this.when(g.startsAtUtc) })
        : this.t('pa.started', { date: this.when(g.startsAtUtc) });
    const end = g.expiresAtUtc
      ? this.t('pa.expires', { date: this.when(g.expiresAtUtc) })
      : this.t('pa.noEnd');
    return `${start} · ${end}`;
  }

  private dialogData(mode: 'create' | 'edit', grant?: ProjectAccessGrant): GrantFormDialogData {
    const d = this.details();
    return {
      mode,
      projectId: this.projectId,
      projectName: d?.project.name ?? '',
      stages: (d?.stages ?? []).map((s) => ({ id: s.id, name: s.name })),
      maxLevel: grantLevelCap(d?.myAccess, (p) => this.permissions.can(p)),
      excludeEmployeeIds: this.grants()
        .filter((g) => isGrantOpen(g))
        .map((g) => g.employeeId),
      grant,
    };
  }

  async openCreate(): Promise<void> {
    if (this.busy()) return;
    await this.openDialog(this.dialogData('create'), 'pa.granted');
  }

  async openEdit(g: ProjectAccessGrant): Promise<void> {
    if (this.busy() || !isGrantOpen(g)) return;
    await this.openDialog(this.dialogData('edit', g), 'pa.updated');
  }

  private async openDialog(data: GrantFormDialogData, successKey: string): Promise<void> {
    const saved = await this.modal
      .open<boolean>(GrantFormDialogComponent, { size: 'lg', data })
      .afterClosed();
    if (!saved) return;
    this.toast.show({ tone: 'success', message: this.t(successKey) });
    this.loadGrants();
  }

  async revoke(g: ProjectAccessGrant): Promise<void> {
    if (this.busy() || !isGrantOpen(g)) return;
    const answer = await this.confirm.openWithReason({
      title: this.t('pa.revokeTitle'),
      body: this.t('pa.revokeBody', { name: this.nameOf(g.employeeId, g.employeeName) }),
      confirmLabel: this.t('pa.revoke'),
      tone: 'danger',
      reason: { label: this.t('pa.revokeReasonLabel'), maxLength: GRANT_REASON_MAX },
    });
    if (!answer.confirmed || this.busy()) return;
    this.busy.set(true);
    this.inlineError.set(null);
    this.api.revoke(this.projectId, g.id, answer.reason).subscribe({
      next: () => {
        this.busy.set(false);
        this.toast.show({ tone: 'success', message: this.t('pa.revoked') });
        this.loadGrants();
      },
      error: (err: HttpErrorResponse) => {
        this.busy.set(false);
        if (this.reloadOnConflict(err, () => this.loadGrants())) return;
        this.inlineError.set(friendly(this.errors.parse(err)));
        this.loadGrants();
      },
    });
  }
}
