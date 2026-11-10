import { ChangeDetectionStrategy, Component, OnInit, computed, inject } from '@angular/core';
import { NgTemplateOutlet } from '@angular/common';
import { Router, RouterLink } from '@angular/router';
import {
  PeraEmptyComponent,
  PeraIconComponent,
  PeraKpiTileComponent,
  PeraProgressBarComponent,
  PeraSkeletonComponent,
  PeraStatusBadgeComponent,
  type StatusBadgeTone,
} from '@ds';
import { CatalogService } from '@platform/i18n/catalog.service';
import { LocaleService } from '@platform/i18n';
import type { ProjectStatus, ProjectTaskStatus } from '@modules/projects';
import { DashboardStore, type MyTask } from '../data/dashboard.store';

const PROJECT_TONE: Record<ProjectStatus, StatusBadgeTone> = {
  Draft: 'neutral',
  InProgress: 'info',
  OnHold: 'warning',
  Completed: 'success',
  Cancelled: 'error',
};

const TASK_TONE: Partial<Record<ProjectTaskStatus, StatusBadgeTone>> = {
  Open: 'neutral',
  InProgress: 'info',
  PendingApproval: 'pending',
  Rejected: 'error',
};

/** The lead statuses the pipeline shows, in funnel order. */
const PIPELINE = [
  { key: 'new', label: 'lead.statusNew' },
  { key: 'contacted', label: 'lead.statusContacted' },
  { key: 'qualified', label: 'lead.statusQualified' },
  { key: 'converted', label: 'lead.statusConverted' },
] as const;

/**
 * DB-1: the home dashboard (`/dashboard`) — where every office user lands. It shows only what the
 * signed-in user's permissions open: a plain employee sees their projects, their tasks and their
 * notifications; a manager also sees approvals, gathering work and the leads pipeline. Each widget
 * loads, fails and empties on its own (`DashboardStore`).
 */
@Component({
  selector: 'app-dashboard-page',
  changeDetection: ChangeDetectionStrategy.OnPush,
  providers: [DashboardStore],
  imports: [
    NgTemplateOutlet,
    RouterLink,
    PeraEmptyComponent,
    PeraIconComponent,
    PeraKpiTileComponent,
    PeraProgressBarComponent,
    PeraSkeletonComponent,
    PeraStatusBadgeComponent,
  ],
  host: { class: 'block' },
  template: `
    <div class="flex flex-col gap-5 p-4 md:p-6 lg:px-8 max-w-[var(--w-page)] mx-auto">
      <!-- Greeting + quick actions -->
      <header class="flex flex-wrap items-end justify-between gap-4">
        <div class="flex flex-col gap-1 min-w-0">
          <h1 class="m-0 fs-h2 font-semibold tracking-tight" data-dash-greeting>
            {{ greeting() }}
          </h1>
          <p class="m-0 fs-body-sm text-text-muted">
            {{ today() }} · {{ catalog.t('dash.subtitle') }}
          </p>
        </div>
        <div class="flex flex-wrap gap-2">
          @if (can().sites) {
            <a
              routerLink="/sites"
              data-quick="sites"
              class="inline-flex items-center gap-2 px-3 py-2 rounded-md border border-border bg-surface fs-caption font-medium hover:bg-surface-muted"
            >
              <pera-icon name="folder" [size]="14" />{{ catalog.t('dash.openSites') }}
            </a>
          }
          @if (can().leads) {
            <a
              routerLink="/crm/leads"
              data-quick="leads"
              class="inline-flex items-center gap-2 px-3 py-2 rounded-md border border-border bg-surface fs-caption font-medium hover:bg-surface-muted"
            >
              <pera-icon name="users" [size]="14" />{{ catalog.t('dash.openLeads') }}
            </a>
          }
          @if (can().createProject) {
            <a
              routerLink="/projects/new"
              data-quick="new-project"
              class="inline-flex items-center gap-2 px-3 py-2 rounded-md bg-accent text-text-on-accent fs-caption font-semibold hover:bg-accent-hover"
            >
              <pera-icon name="plus" [size]="14" />{{ catalog.t('dash.newProject') }}
            </a>
          }
        </div>
      </header>

      @if (store.nothingToShow()) {
        <div class="bg-surface border border-border rounded-card p-6" data-dash-empty>
          <pera-empty
            [title]="catalog.t('dash.emptyTitle')"
            [description]="catalog.t('dash.emptyBody')"
            iconName="home"
            [cta]="profileCta()"
          />
        </div>
      } @else {
        <!-- KPI row -->
        <div class="grid grid-cols-2 lg:grid-cols-4 gap-3" data-dash-kpis>
          @if (can().projects) {
            <pera-kpi-tile
              data-kpi="projects"
              [caption]="catalog.t('dash.kpiActive')"
              [value]="store.projects().data?.active ?? '—'"
              [message]="
                store.projects().data
                  ? catalog.t('dash.kpiActiveMsg', { total: store.projects().data!.total })
                  : null
              "
              icon="briefcase"
              tone="accent"
            />
          }
          @if (can().tasks) {
            <pera-kpi-tile
              data-kpi="tasks"
              [caption]="catalog.t('dash.kpiTasks')"
              [value]="store.tasks().data?.length ?? '—'"
              [message]="
                store.tasks().data
                  ? catalog.t('dash.kpiTasksMsg', { overdue: overdueCount() })
                  : null
              "
              icon="check-circle"
              tone="info"
            />
          }
          @if (can().leads) {
            <pera-kpi-tile
              data-kpi="leads"
              [caption]="catalog.t('dash.kpiLeads')"
              [value]="openLeads() ?? '—'"
              [message]="
                store.leads().data
                  ? catalog.t('dash.kpiLeadsMsg', { new: store.leads().data!.new })
                  : null
              "
              icon="target"
              tone="success"
            />
          }
          @if (can().approvals) {
            <pera-kpi-tile
              data-kpi="approvals"
              [caption]="catalog.t('dash.kpiApprovals')"
              [value]="store.approvals().data?.total ?? '—'"
              [message]="catalog.t('dash.kpiApprovalsMsg')"
              icon="alert-circle"
              tone="pending"
            />
          } @else if (can().notifications) {
            <pera-kpi-tile
              data-kpi="unread"
              [caption]="catalog.t('dash.kpiUnread')"
              [value]="store.notifications.unreadCount()"
              icon="bell"
              tone="warning"
            />
          }
        </div>

        <div class="grid grid-cols-1 xl:grid-cols-3 gap-4 items-start">
          <!-- Main column -->
          <div class="xl:col-span-2 flex flex-col gap-4 min-w-0">
            @if (can().tasks) {
              <section
                class="bg-surface border border-border rounded-card min-w-0"
                data-widget="tasks"
              >
                <ng-container
                  *ngTemplateOutlet="head; context: { title: 'dash.wMyTasks', link: '/projects' }"
                />
                @if (store.tasks().loading) {
                  <div class="p-4 flex flex-col gap-2">
                    @for (i of [1, 2, 3]; track i) {
                      <pera-skeleton [height]="36" rounded="md" />
                    }
                  </div>
                } @else if (store.tasks().error) {
                  <p class="m-0 p-4 fs-body-sm text-danger">{{ catalog.t('dash.loadError') }}</p>
                } @else if (!store.tasks().data?.length) {
                  <p class="m-0 p-4 fs-body-sm text-text-muted">
                    {{ catalog.t('dash.myTasksEmpty') }}
                  </p>
                } @else {
                  <ul class="m-0 p-0 list-none">
                    @for (task of store.tasks().data!; track task.id) {
                      <li class="border-b border-border-soft last:border-b-0">
                        <a
                          [routerLink]="['/projects', task.projectId, 'tasks', task.id]"
                          class="flex items-center gap-3 px-4 py-3 hover:bg-hover"
                        >
                          <span class="flex-1 min-w-0 flex flex-col">
                            <span class="fs-body-sm font-medium truncate">{{ task.name }}</span>
                            <span class="fs-caption text-text-muted truncate"
                              >{{ task.projectCode }} · {{ task.projectName }}</span
                            >
                          </span>
                          <span
                            class="fs-caption whitespace-nowrap"
                            [class.text-danger]="isOverdue(task)"
                            [class.text-text-muted]="!isOverdue(task)"
                            >{{ dueLabel(task) }}</span
                          >
                          <pera-status-badge
                            [tone]="taskTone(task)"
                            [label]="taskLabel(task.status)"
                          />
                        </a>
                      </li>
                    }
                  </ul>
                }
              </section>
            }

            @if (can().projects) {
              <section
                class="bg-surface border border-border rounded-card min-w-0"
                data-widget="projects"
              >
                <ng-container
                  *ngTemplateOutlet="head; context: { title: 'dash.wProjects', link: '/projects' }"
                />
                @if (store.projects().loading) {
                  <div class="p-4 grid grid-cols-1 md:grid-cols-2 gap-3">
                    @for (i of [1, 2, 3, 4]; track i) {
                      <pera-skeleton [height]="72" rounded="md" />
                    }
                  </div>
                } @else if (store.projects().error) {
                  <p class="m-0 p-4 fs-body-sm text-danger">{{ catalog.t('dash.loadError') }}</p>
                } @else if (!store.projects().data?.items?.length) {
                  <p class="m-0 p-4 fs-body-sm text-text-muted">
                    {{ catalog.t('dash.projectsEmpty') }}
                  </p>
                } @else {
                  <div class="p-3 grid grid-cols-1 md:grid-cols-2 gap-2">
                    @for (p of store.projects().data!.items; track p.id) {
                      <a
                        [routerLink]="['/projects', p.id]"
                        class="flex flex-col gap-2 p-3 rounded-lg border border-border-soft hover:border-border-strong hover:bg-hover"
                      >
                        <span class="flex items-start justify-between gap-2">
                          <span class="flex flex-col min-w-0">
                            <span class="fs-body-sm font-semibold truncate">{{ p.name }}</span>
                            <span class="fs-caption text-text-muted truncate"
                              >{{ p.code }} · {{ p.clientName }}</span
                            >
                          </span>
                          <pera-status-badge
                            [tone]="projectTone(p.status)"
                            [label]="projectLabel(p.status)"
                          />
                        </span>
                        <span class="flex items-center gap-2">
                          <pera-progress-bar
                            class="flex-1"
                            [value]="p.progressPercentage"
                            [height]="4"
                          />
                          <span class="fs-caption text-text-secondary tabular-nums"
                            >{{ p.progressPercentage }}%</span
                          >
                        </span>
                      </a>
                    }
                  </div>
                }
              </section>
            }

            @if (can().gathering) {
              <section
                class="bg-surface border border-border rounded-card min-w-0"
                data-widget="gathering"
              >
                <ng-container
                  *ngTemplateOutlet="
                    head;
                    context: { title: 'dash.wTasksTitle', link: '/crm/my-work' }
                  "
                />
                @if (store.gathering().loading) {
                  <div class="p-4"><pera-skeleton [height]="48" rounded="md" /></div>
                } @else if (store.gathering().error) {
                  <p class="m-0 p-4 fs-body-sm text-text-muted">
                    {{ catalog.t('dash.tasksNotAvailable') }}
                  </p>
                } @else if (!store.gathering().data?.length) {
                  <p class="m-0 p-4 fs-body-sm text-text-muted">
                    {{ catalog.t('dash.tasksEmpty') }}
                  </p>
                } @else {
                  <ul class="m-0 p-0 list-none">
                    @for (g of store.gathering().data!; track g.trackKey) {
                      <li
                        class="flex items-center gap-3 px-4 py-3 border-b border-border-soft last:border-b-0"
                      >
                        <span class="flex-1 min-w-0 flex flex-col">
                          <span class="fs-body-sm font-medium truncate">{{ g.taskName }}</span>
                          <span class="fs-caption text-text-muted truncate"
                            >{{ g.projectName }}{{ g.stageName ? ' · ' + g.stageName : '' }}</span
                          >
                        </span>
                        <span class="fs-caption text-text-muted whitespace-nowrap">{{
                          catalog.t('dash.taskCounts', {
                            entries: g.taskBlock.entryTotal,
                            unresolved: g.taskBlock.unresolvedTotal,
                          })
                        }}</span>
                      </li>
                    }
                  </ul>
                }
              </section>
            }
          </div>

          <!-- Side column -->
          <div class="flex flex-col gap-4 min-w-0">
            @if (can().approvals) {
              <section
                class="bg-surface border border-border rounded-card min-w-0"
                data-widget="approvals"
              >
                <ng-container
                  *ngTemplateOutlet="
                    head;
                    context: { title: 'dash.wAttnTitle', link: '/approvals' }
                  "
                />
                @if (store.approvals().loading) {
                  <div class="p-4"><pera-skeleton [height]="48" rounded="md" /></div>
                } @else if (store.approvals().error) {
                  <p class="m-0 p-4 fs-body-sm text-danger">{{ catalog.t('dash.loadError') }}</p>
                } @else if (!store.approvals().data?.items?.length) {
                  <p class="m-0 p-4 fs-body-sm text-text-muted">
                    {{ catalog.t('dash.attnEmpty') }}
                  </p>
                } @else {
                  <ul class="m-0 p-0 list-none">
                    @for (a of store.approvals().data!.items; track a.trackKey) {
                      <li class="border-b border-border-soft last:border-b-0">
                        <a
                          routerLink="/approvals"
                          class="flex items-center justify-between gap-3 px-4 py-3 hover:bg-hover"
                        >
                          <span class="fs-body-sm">
                            {{ catalog.t('dash.approvalItem') }} ·
                            {{ catalog.t('dash.round', { round: a.round }) }}
                          </span>
                          @if (a.dueAtUtc) {
                            <span class="fs-caption text-text-muted whitespace-nowrap">{{
                              catalog.t('dash.dueOn', { date: shortDate(a.dueAtUtc) })
                            }}</span>
                          }
                        </a>
                      </li>
                    }
                  </ul>
                }
              </section>
            }

            @if (can().leads) {
              <section
                class="bg-surface border border-border rounded-card min-w-0"
                data-widget="leads"
              >
                <ng-container
                  *ngTemplateOutlet="head; context: { title: 'dash.wLeads', link: '/crm/leads' }"
                />
                @if (store.leads().loading) {
                  <div class="p-4"><pera-skeleton [height]="96" rounded="md" /></div>
                } @else if (store.leads().error) {
                  <p class="m-0 p-4 fs-body-sm text-danger">{{ catalog.t('dash.loadError') }}</p>
                } @else if (store.leads().data; as counts) {
                  <div class="p-4 flex flex-col gap-3">
                    @for (row of pipeline; track row.key) {
                      <div class="grid grid-cols-[var(--w-column-sm)_1fr_auto] items-center gap-3">
                        <span class="fs-caption text-text-secondary truncate">{{
                          catalog.t(row.label)
                        }}</span>
                        <pera-progress-bar
                          [value]="pipelinePct(counts[row.key], counts.total)"
                          [height]="8"
                        />
                        <span class="fs-caption font-semibold tabular-nums">{{
                          counts[row.key]
                        }}</span>
                      </div>
                    }
                  </div>
                }
              </section>
            }

            @if (can().notifications) {
              <section
                class="bg-surface border border-border rounded-card min-w-0"
                data-widget="notifications"
              >
                <ng-container
                  *ngTemplateOutlet="
                    head;
                    context: { title: 'dash.wNotifications', link: '/notifications' }
                  "
                />
                @if (store.notifications.loadingRecent()) {
                  <div class="p-4"><pera-skeleton [height]="48" rounded="md" /></div>
                } @else if (!recentNotifications().length) {
                  <p class="m-0 p-4 fs-body-sm text-text-muted">
                    {{ catalog.t('dash.notificationsEmpty') }}
                  </p>
                } @else {
                  <ul class="m-0 p-0 list-none">
                    @for (n of recentNotifications(); track n.id) {
                      <li class="border-b border-border-soft last:border-b-0">
                        <a routerLink="/notifications" class="flex gap-3 px-4 py-3 hover:bg-hover">
                          <span
                            class="mt-1.5 w-2 h-2 rounded-full shrink-0"
                            [class.bg-accent]="n.isUnread"
                            [class.bg-border]="!n.isUnread"
                            aria-hidden="true"
                          ></span>
                          <span class="flex-1 min-w-0 flex flex-col">
                            <span class="fs-body-sm truncate" [class.font-semibold]="n.isUnread">{{
                              n.title
                            }}</span>
                            <span class="fs-caption text-text-muted">{{
                              shortDate(n.createdAtUtc)
                            }}</span>
                          </span>
                        </a>
                      </li>
                    }
                  </ul>
                }
              </section>
            }
          </div>
        </div>
      }
    </div>

    <ng-template #head let-title="title" let-link="link">
      <div class="flex items-center justify-between gap-2 px-4 py-3 border-b border-border-soft">
        <h2 class="m-0 fs-body font-semibold">{{ catalog.t(title) }}</h2>
        <a [routerLink]="link" class="fs-caption font-semibold text-accent hover:underline">{{
          catalog.t('dash.viewAll')
        }}</a>
      </div>
    </ng-template>
  `,
})
export class DashboardPageComponent implements OnInit {
  readonly store = inject(DashboardStore);
  readonly catalog = inject(CatalogService);
  private readonly locale = inject(LocaleService);
  private readonly router = inject(Router);

  readonly can = this.store.can;
  readonly pipeline = PIPELINE;
  private readonly now = new Date();

  readonly profileCta = computed(() => ({
    label: this.catalog.t('dash.emptyCta'),
    action: () => void this.router.navigate(['/profile']),
  }));

  readonly greeting = computed(() => {
    const name = this.store.displayName().split(' ')[0];
    if (!name || name.includes('@')) return this.catalog.t('dash.greetPlain');
    const h = this.now.getHours();
    const key = h < 12 ? 'dash.greetMorning' : h < 18 ? 'dash.greetAfternoon' : 'dash.greetEvening';
    return this.catalog.t(key, { name });
  });

  readonly today = computed(() =>
    new Intl.DateTimeFormat(this.intlLocale(), {
      weekday: 'long',
      day: 'numeric',
      month: 'long',
      year: 'numeric',
    }).format(this.now),
  );

  readonly openLeads = computed(() => {
    const c = this.store.leads().data;
    return c ? c.new + c.contacted + c.qualified : null;
  });

  readonly overdueCount = computed(
    () => (this.store.tasks().data ?? []).filter((t) => this.isOverdue(t)).length,
  );

  readonly recentNotifications = computed(() => this.store.notifications.recent().slice(0, 5));

  ngOnInit(): void {
    this.store.load();
  }

  projectTone(status: keyof typeof PROJECT_TONE): StatusBadgeTone {
    return PROJECT_TONE[status] ?? 'neutral';
  }

  taskLabel(status: ProjectTaskStatus): string {
    return this.catalog.t(`pt.status.${status}` as const);
  }

  projectLabel(status: ProjectStatus): string {
    return this.catalog.t(`sv.projectStatus.${status}` as const);
  }

  taskTone(task: MyTask): StatusBadgeTone {
    return this.isOverdue(task) ? 'error' : (TASK_TONE[task.status] ?? 'neutral');
  }

  isOverdue(task: MyTask): boolean {
    return !!task.dueDate && task.dueDate.slice(0, 10) < this.now.toISOString().slice(0, 10);
  }

  dueLabel(task: MyTask): string {
    if (!task.dueDate) return this.catalog.t('dash.noDue');
    if (this.isOverdue(task)) return this.catalog.t('dash.overdue');
    return this.catalog.t('dash.due', { date: this.shortDate(task.dueDate) });
  }

  shortDate(iso: string): string {
    const d = new Date(iso);
    if (Number.isNaN(d.getTime())) return '';
    return new Intl.DateTimeFormat(this.intlLocale(), { day: 'numeric', month: 'short' }).format(d);
  }

  pipelinePct(value: number, total: number): number {
    return total > 0 ? Math.round((value / total) * 100) : 0;
  }

  private intlLocale(): string {
    return this.locale.locale() === 'ar' ? 'ar-EG' : 'en-GB';
  }
}
