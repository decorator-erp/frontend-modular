import {
  ChangeDetectionStrategy,
  Component,
  OnInit,
  computed,
  inject,
  signal,
} from '@angular/core';
import { FormsModule } from '@angular/forms';
import { NgTemplateOutlet } from '@angular/common';
import { Router, RouterLink } from '@angular/router';
import {
  PeraAvatarComponent,
  PeraEmptyComponent,
  PeraIconComponent,
  PeraKpiTileComponent,
  PeraProgressBarComponent,
  PeraSegmentedComponent,
  PeraSkeletonComponent,
  PeraStatusBadgeComponent,
  PeraSwatchComponent,
  type SegmentedOption,
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
  { key: 'new', label: 'lead.statusNew', bar: 'bg-accent' },
  { key: 'contacted', label: 'lead.statusContacted', bar: 'bg-sand' },
  { key: 'qualified', label: 'lead.statusQualified', bar: 'bg-info' },
  { key: 'converted', label: 'lead.statusConverted', bar: 'bg-success' },
] as const;

type ProjectFilter = 'active' | 'onHold' | 'all';

/** OS-3: which loaded projects each filter keeps. "Active" = still open and not on hold. */
const PROJECT_FILTER: Record<ProjectFilter, (s: ProjectStatus) => boolean> = {
  active: (s) => s === 'InProgress' || s === 'Draft',
  onHold: (s) => s === 'OnHold',
  all: () => true,
};

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
    FormsModule,
    NgTemplateOutlet,
    RouterLink,
    PeraAvatarComponent,
    PeraEmptyComponent,
    PeraIconComponent,
    PeraKpiTileComponent,
    PeraProgressBarComponent,
    PeraSegmentedComponent,
    PeraSkeletonComponent,
    PeraStatusBadgeComponent,
    PeraSwatchComponent,
  ],
  host: { class: 'block' },
  template: `
    <div class="flex flex-col gap-5 md:gap-6 p-4 md:p-6 lg:px-8 max-w-[var(--w-page)] mx-auto">
      <!-- OS-3 (Ocean Studio): greeting and date on the start side, quick actions on the end side. -->
      <header class="flex flex-wrap items-end justify-between gap-4">
        <div class="flex flex-col gap-1 min-w-0">
          <p class="m-0 fs-label font-bold uppercase tracking-[0.1em] text-text-muted">
            {{ today() }}
          </p>
          <h1 class="m-0 fs-h1 font-extrabold tracking-[-0.02em] leading-[1.15]" data-dash-greeting>
            {{ greeting() }}
          </h1>
          <p class="m-0 fs-body-sm text-text-secondary">{{ catalog.t('dash.subtitle') }}</p>
        </div>
        <div class="flex flex-wrap gap-2 max-md:hidden">
          @if (can().sites) {
            <a routerLink="/sites" data-quick="sites" [class]="quickClass">
              <pera-icon name="folder" [size]="15" />{{ catalog.t('dash.openSites') }}
            </a>
          }
          @if (can().leads) {
            <a routerLink="/crm/leads" data-quick="leads" [class]="quickClass">
              <pera-icon name="users" [size]="15" />{{ catalog.t('dash.openLeads') }}
            </a>
          }
          @if (can().createProject) {
            <a
              routerLink="/projects/new"
              data-quick="new-project"
              class="inline-flex items-center gap-2 px-4 h-[var(--space-10)] rounded-[var(--radius-control)] bg-accent text-text-on-accent fs-body-sm font-bold hover:bg-accent-hover outline-none focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-accent"
            >
              <pera-icon name="plus" [size]="15" />{{ catalog.t('dash.newProject') }}
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
        <!-- KPI row: accent, sand, success, pending (OS-3). -->
        <div class="grid grid-cols-2 lg:grid-cols-4 gap-3 md:gap-4" data-dash-kpis>
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
              tone="sand"
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
              tone="pending"
            />
          }
        </div>

        <div class="grid grid-cols-1 xl:grid-cols-3 gap-4 md:gap-5 items-start">
          <!-- Main column -->
          <div class="xl:col-span-2 flex flex-col gap-4 md:gap-5 min-w-0">
            @if (can().projects) {
              <section [class]="cardClass" data-widget="projects">
                <ng-container
                  *ngTemplateOutlet="head; context: { title: 'dash.wProjects', link: '/projects' }"
                >
                </ng-container>
                @if (store.projects().loading) {
                  <div class="p-4 flex flex-col gap-2">
                    @for (i of [1, 2, 3]; track i) {
                      <pera-skeleton [height]="56" rounded="md" />
                    }
                  </div>
                } @else if (store.projects().error) {
                  <p class="m-0 p-4 fs-body-sm text-danger">{{ catalog.t('dash.loadError') }}</p>
                } @else if (!store.projects().data?.items?.length) {
                  <p class="m-0 p-4 fs-body-sm text-text-muted">
                    {{ catalog.t('dash.projectsEmpty') }}
                  </p>
                } @else {
                  <div class="px-4 pb-1">
                    <pera-segmented
                      data-project-filter
                      [ariaLabel]="catalog.t('dash.wProjects')"
                      [options]="projectFilterOptions()"
                      [ngModel]="projectFilter()"
                      (ngModelChange)="projectFilter.set($event)"
                    />
                  </div>
                  @if (!filteredProjects().length) {
                    <p class="m-0 p-4 fs-body-sm text-text-muted">
                      {{ catalog.t('dash.projectsFilterEmpty') }}
                    </p>
                  } @else {
                    <ul class="m-0 px-2 pb-2 pt-1 list-none">
                      @for (p of filteredProjects(); track p.id) {
                        <li>
                          <a
                            [routerLink]="['/projects', p.id]"
                            data-dash-project
                            class="flex items-center gap-3 px-2 py-2.5 rounded-[var(--radius-control)] hover:bg-hover"
                          >
                            <pera-swatch [seed]="p.id" [label]="p.name" />
                            <span class="flex-1 min-w-0 flex flex-col">
                              <span class="fs-body-sm font-bold truncate">{{ p.name }}</span>
                              <span class="fs-caption text-text-muted truncate"
                                >{{ p.code }} · {{ p.clientName }}</span
                              >
                            </span>
                            <span
                              class="flex items-center gap-2 w-[var(--w-column-sm)] max-sm:w-[var(--space-16)]"
                            >
                              <pera-progress-bar
                                class="flex-1"
                                [value]="p.progressPercentage"
                                [height]="6"
                              />
                              <span class="fs-caption font-bold text-text-secondary tabular-nums"
                                >{{ p.progressPercentage }}%</span
                              >
                            </span>
                            <pera-status-badge
                              class="max-md:hidden"
                              [tone]="projectTone(p.status)"
                              [label]="projectLabel(p.status)"
                            />
                          </a>
                        </li>
                      }
                    </ul>
                  }
                }
              </section>
            }

            @if (can().tasks) {
              <section [class]="cardClass" data-widget="tasks">
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
                  <!-- OS-3: grouped Overdue / This week / Later, in the store's due-date order. -->
                  <div class="px-2 pb-2">
                    @for (group of taskGroups(); track group.key) {
                      <h3
                        class="m-0 px-3 pt-3 pb-1.5 fs-label font-bold uppercase tracking-[0.1em]"
                        [class.text-danger]="group.key === 'overdue'"
                        [class.text-text-muted]="group.key !== 'overdue'"
                        [attr.data-task-group]="group.key"
                      >
                        {{ catalog.t(group.label) }} · {{ group.tasks.length }}
                      </h3>
                      <ul class="m-0 p-0 list-none">
                        @for (task of group.tasks; track task.id) {
                          <li>
                            <a
                              [routerLink]="['/projects', task.projectId, 'tasks', task.id]"
                              class="flex items-center gap-3 px-3 py-2.5 rounded-[var(--radius-control)] hover:bg-hover"
                            >
                              <span
                                class="size-2 rounded-full shrink-0"
                                [class.bg-danger]="isOverdue(task)"
                                [class.bg-sand]="!isOverdue(task)"
                                aria-hidden="true"
                              ></span>
                              <span class="flex-1 min-w-0 flex flex-col">
                                <span class="fs-body-sm font-semibold truncate">{{
                                  task.name
                                }}</span>
                                <span class="fs-caption text-text-muted truncate"
                                  >{{ task.projectCode }} · {{ task.projectName
                                  }}<span class="md:hidden"> · {{ dueLabel(task) }}</span></span
                                >
                              </span>
                              <span
                                class="fs-caption font-semibold whitespace-nowrap max-md:hidden"
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
                  </div>
                }
              </section>
            }

            @if (can().gathering) {
              <section [class]="cardClass" data-widget="gathering">
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
                  <ul class="m-0 px-2 pb-2 list-none">
                    @for (g of store.gathering().data!; track g.trackKey) {
                      <li class="flex items-center gap-3 px-3 py-2.5">
                        <span class="flex-1 min-w-0 flex flex-col">
                          <span class="fs-body-sm font-semibold truncate">{{ g.taskName }}</span>
                          <span class="fs-caption text-text-muted truncate"
                            >{{ g.projectName }}{{ g.stageName ? ' · ' + g.stageName : '' }}</span
                          >
                        </span>
                        <span
                          class="fs-caption font-semibold text-sand-ink bg-sand-soft rounded-full px-2.5 py-0.5 whitespace-nowrap"
                          >{{
                            catalog.t('dash.taskCounts', {
                              entries: g.taskBlock.entryTotal,
                              unresolved: g.taskBlock.unresolvedTotal,
                            })
                          }}</span
                        >
                      </li>
                    }
                  </ul>
                }
              </section>
            }
          </div>

          <!-- Side column -->
          <div class="flex flex-col gap-4 md:gap-5 min-w-0">
            @if (can().approvals) {
              <!-- OS-3: the navy approvals card (sidebar navy; a 1px ring separates it in dark mode). -->
              <section
                class="bg-sidebar text-sidebar-active-text rounded-card shadow-[var(--shadow-card)] ring-1 ring-sidebar-line min-w-0"
                data-widget="approvals"
              >
                <div class="flex items-center justify-between gap-2 px-5 pt-4 pb-2">
                  <h2 class="m-0 fs-body font-extrabold">{{ catalog.t('dash.wAttnTitle') }}</h2>
                  @if (store.approvals().data; as d) {
                    <span
                      class="rounded-full bg-sand text-sidebar fs-label font-extrabold px-2.5 py-0.5 tabular-nums"
                      >{{ d.total }}</span
                    >
                  }
                </div>
                @if (store.approvals().loading) {
                  <div class="p-4"><pera-skeleton [height]="48" rounded="md" /></div>
                } @else if (store.approvals().error) {
                  <p class="m-0 px-5 pb-4 fs-body-sm text-sidebar-text">
                    {{ catalog.t('dash.loadError') }}
                  </p>
                } @else if (!store.approvals().data?.items?.length) {
                  <p class="m-0 px-5 pb-4 fs-body-sm text-sidebar-text">
                    {{ catalog.t('dash.attnEmpty') }}
                  </p>
                } @else {
                  <ul class="m-0 px-3 pb-3 list-none flex flex-col gap-1.5">
                    @for (a of store.approvals().data!.items; track a.trackKey) {
                      <li
                        class="flex items-center justify-between gap-3 px-3 py-2.5 rounded-[var(--radius-control)] bg-sidebar-hover"
                      >
                        <span class="flex flex-col min-w-0">
                          <span class="fs-body-sm font-semibold truncate"
                            >{{ catalog.t('dash.approvalItem') }} ·
                            {{ catalog.t('dash.round', { round: a.round }) }}</span
                          >
                          @if (a.dueAtUtc) {
                            <span class="fs-caption text-sidebar-text">{{
                              catalog.t('dash.dueOn', { date: shortDate(a.dueAtUtc) })
                            }}</span>
                          }
                        </span>
                        <a
                          routerLink="/approvals"
                          data-approval-review
                          class="shrink-0 inline-flex items-center px-3 h-[var(--space-8)] rounded-[var(--radius-md)] bg-sand text-sidebar fs-caption font-extrabold hover:opacity-90 outline-none focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-sidebar-active-text"
                          >{{ catalog.t('dash.review') }}</a
                        >
                      </li>
                    }
                  </ul>
                }
              </section>
            }

            @if (can().leads) {
              <section [class]="cardClass" data-widget="leads">
                <ng-container
                  *ngTemplateOutlet="head; context: { title: 'dash.wLeads', link: '/crm/leads' }"
                />
                @if (store.leads().loading) {
                  <div class="p-4"><pera-skeleton [height]="96" rounded="md" /></div>
                } @else if (store.leads().error) {
                  <p class="m-0 p-4 fs-body-sm text-danger">{{ catalog.t('dash.loadError') }}</p>
                } @else if (store.leads().data; as counts) {
                  <!-- OS-3: one stacked bar of the funnel, with a two-column legend. -->
                  <div class="px-4 pb-4 pt-1 flex flex-col gap-3.5">
                    <div
                      class="flex h-[var(--space-3)] rounded-full overflow-hidden bg-surface-muted gap-0.5"
                      role="img"
                      [attr.aria-label]="pipelineSummary(counts)"
                      data-pipeline-bar
                    >
                      @for (row of pipeline; track row.key) {
                        @if (counts[row.key] > 0) {
                          <span
                            [class]="row.bar"
                            [style.flexGrow]="counts[row.key]"
                            [attr.data-segment]="row.key"
                          ></span>
                        }
                      }
                    </div>
                    <ul class="m-0 p-0 list-none grid grid-cols-2 gap-x-4 gap-y-2.5">
                      @for (row of pipeline; track row.key) {
                        <li class="flex items-center gap-2 min-w-0">
                          <span
                            class="size-2.5 rounded-sm shrink-0 {{ row.bar }}"
                            aria-hidden="true"
                          ></span>
                          <span class="fs-caption text-text-secondary truncate flex-1">{{
                            catalog.t(row.label)
                          }}</span>
                          <span class="fs-body-sm font-extrabold tabular-nums">{{
                            counts[row.key]
                          }}</span>
                        </li>
                      }
                    </ul>
                  </div>
                }
              </section>
            }

            @if (can().notifications) {
              <section [class]="cardClass" data-widget="notifications">
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
                  <ul class="m-0 px-2 pb-2 list-none">
                    @for (n of recentNotifications(); track n.id) {
                      <li>
                        <a
                          routerLink="/notifications"
                          class="flex items-start gap-3 px-2 py-2.5 rounded-[var(--radius-control)] hover:bg-hover"
                        >
                          <span class="relative shrink-0">
                            <pera-avatar [name]="n.title" size="md" />
                            @if (n.isUnread) {
                              <span
                                class="absolute -top-0.5 -end-0.5 size-2.5 rounded-full bg-accent ring-2 ring-surface"
                                aria-hidden="true"
                              ></span>
                            }
                          </span>
                          <span class="flex-1 min-w-0 flex flex-col">
                            <span
                              class="fs-body-sm truncate"
                              [class.font-bold]="n.isUnread"
                              [class.font-medium]="!n.isUnread"
                              >{{ n.title }}</span
                            >
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
      <div class="flex items-center justify-between gap-2 px-5 pt-4 pb-2">
        <h2 class="m-0 fs-body font-extrabold">{{ catalog.t(title) }}</h2>
        <a
          [routerLink]="link"
          class="fs-caption font-bold text-accent hover:underline inline-flex items-center gap-1"
          >{{ catalog.t('dash.viewAll')
          }}<span class="rtl:rotate-180" aria-hidden="true">→</span></a
        >
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

  /** OS-3: the soft Ocean Studio card every widget sits in. */
  protected readonly cardClass =
    'bg-surface border border-border-soft rounded-card shadow-[var(--shadow-card)] min-w-0';
  protected readonly quickClass =
    'inline-flex items-center gap-2 px-4 h-[var(--space-10)] rounded-[var(--radius-control)] border border-border bg-surface fs-body-sm font-semibold hover:bg-surface-muted outline-none focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-accent';

  /** OS-3: My projects filter, over the rows already loaded (no refetch). */
  readonly projectFilter = signal<ProjectFilter>('active');
  readonly projectFilterOptions = computed<SegmentedOption[]>(() => [
    { value: 'active', label: this.catalog.t('dash.filterActive') },
    { value: 'onHold', label: this.catalog.t('dash.filterOnHold') },
    { value: 'all', label: this.catalog.t('dash.filterAll') },
  ]);
  readonly filteredProjects = computed(() => {
    const keep = PROJECT_FILTER[this.projectFilter()];
    return (this.store.projects().data?.items ?? []).filter((p) => keep(p.status));
  });

  /** OS-3: My tasks under Overdue, This week and Later; each group keeps the store's order. */
  readonly taskGroups = computed(() => {
    const weekEnd = new Date(this.now);
    weekEnd.setDate(weekEnd.getDate() + 7);
    const weekEndIso = weekEnd.toISOString().slice(0, 10);
    const groups = [
      { key: 'overdue', label: 'dash.groupOverdue' as const, tasks: [] as MyTask[] },
      { key: 'week', label: 'dash.groupThisWeek' as const, tasks: [] as MyTask[] },
      { key: 'later', label: 'dash.groupLater' as const, tasks: [] as MyTask[] },
    ];
    for (const t of this.store.tasks().data ?? []) {
      if (this.isOverdue(t)) groups[0].tasks.push(t);
      else if (t.dueDate && t.dueDate.slice(0, 10) <= weekEndIso) groups[1].tasks.push(t);
      else groups[2].tasks.push(t);
    }
    return groups.filter((g) => g.tasks.length);
  });

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

  /** The stacked bar's accessible name: every stage and its count. */
  pipelineSummary(counts: Record<(typeof PIPELINE)[number]['key'], number>): string {
    return PIPELINE.map((r) => `${this.catalog.t(r.label)} ${counts[r.key]}`).join(', ');
  }

  private intlLocale(): string {
    return this.locale.locale() === 'ar' ? 'ar-EG' : 'en-GB';
  }
}
