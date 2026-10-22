import { HttpErrorResponse } from '@angular/common/http';
import {
  ChangeDetectionStrategy,
  Component,
  OnInit,
  TemplateRef,
  computed,
  inject,
  signal,
  viewChild,
} from '@angular/core';
import { Router } from '@angular/router';
import { ThemeService } from '@platform/theme';
import { LocaleService } from '@platform/i18n';
import { LookupCache } from '../../data/lookup.cache';
import { EmployeeService } from '../../data/employee.service';
import { handled } from '@platform/http/handled-errors';
import {
  EmployeeFull,
  EmployeeOverview,
  EmployeeProjectRef,
  EmployeeTaskRef,
} from '../../model/employee.model';
import {
  formatShortDate,
  projectStatusLabel,
  projectStatusTone,
  taskStatusLabel,
  taskStatusTone,
  tenure,
} from '@shared/ui/status';
import {
  ColumnDef,
  PeraAvatarComponent,
  PeraBadgeComponent,
  PeraButtonComponent,
  PeraCardComponent,
  PeraDataTableComponent,
  PeraEmptyComponent,
  PeraIconComponent,
  PeraSkeletonComponent,
  PeraTabsComponent,
  PeraTooltipDirective,
  TabDef,
} from '@ds';
import { ContractTypeLabel, coerceEnum, ContractType } from '../../model/contract.enums';

@Component({
  selector: 'app-profile',
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [
    PeraAvatarComponent,
    PeraBadgeComponent,
    PeraButtonComponent,
    PeraCardComponent,
    PeraDataTableComponent,
    PeraEmptyComponent,
    PeraIconComponent,
    PeraSkeletonComponent,
    PeraTabsComponent,
    PeraTooltipDirective,
  ],
  templateUrl: './profile.component.html',
})
export class ProfileComponent implements OnInit {
  private readonly employees = inject(EmployeeService);
  private readonly lookups = inject(LookupCache);
  private readonly router = inject(Router);
  readonly theme = inject(ThemeService);
  readonly locale = inject(LocaleService);

  readonly loading = signal(true);
  readonly failed = signal(false);
  /** No employee record, or `employees.view_own` not granted — a state, not a failure. */
  readonly profileUnavailable = signal(false);
  readonly me = signal<EmployeeFull | null>(null);
  readonly overview = signal<EmployeeOverview | null>(null);
  readonly managerName = signal<string | null>(null);

  /**
   * These three tabs have NO backend (see the `TODO(backend-gap)` markers on
   * `EmployeeService`). They must say so: an empty list here reads as "you have no work",
   * which is worse than an error because it looks authoritative.
   */
  readonly overviewUnavailable = signal(true);
  readonly projectsUnavailable = signal(false);
  readonly tasksUnavailable = signal(false);
  /** No `GET /departments/{id}/head` — the Manager card has no source. */
  readonly managerUnavailable = signal(true);

  readonly activeTab = signal('overview');
  readonly tabs: TabDef[] = [
    { id: 'overview', label: 'Overview' },
    { id: 'projects', label: 'Projects' },
    { id: 'tasks', label: 'Tasks' },
    { id: 'settings', label: 'Settings' },
  ];

  readonly projects = signal<EmployeeProjectRef[] | null>(null);
  readonly projectsLoading = signal(false);
  readonly tasks = signal<EmployeeTaskRef[] | null>(null);
  readonly tasksLoading = signal(false);

  private readonly taskStatusTpl = viewChild.required<TemplateRef<unknown>>('taskStatusTpl');
  private readonly taskPriorityTpl = viewChild.required<TemplateRef<unknown>>('taskPriorityTpl');
  private readonly taskDueTpl = viewChild.required<TemplateRef<unknown>>('taskDueTpl');

  readonly taskColumns = computed<ColumnDef<EmployeeTaskRef>[]>(() => [
    { key: 'name', header: 'Task', minWidth: 200, sortable: true },
    { key: 'projectName', header: 'Project', width: 200, sortable: true },
    { key: 'status', header: 'Status', width: 120, sortable: true, template: this.taskStatusTpl() },
    {
      key: 'priority',
      header: 'Priority',
      width: 100,
      sortable: true,
      template: this.taskPriorityTpl(),
    },
    { key: 'dueDate', header: 'Due', width: 120, sortable: true, template: this.taskDueTpl() },
  ]);

  readonly fullName = computed(() => this.me()?.fullName ?? '');
  /**
   * Department NAME for the header and the Department card. The employee wire carries only
   * `primaryDepartmentId`, so the name is joined from the shared lookup cache.
   */
  readonly departmentName = computed(() => {
    const id = this.me()?.primaryDepartmentId;
    return id ? (this.departmentNames().get(id) ?? null) : null;
  });
  private readonly departmentNames = signal<Map<string, string>>(new Map());
  readonly tenureLabel = computed(() => tenure(this.me()?.hireDate, this.locale.locale()));
  readonly contractLabel = computed(() => {
    const ct = coerceEnum(this.me()?.contractType, ContractType);
    return ct ? ContractTypeLabel[ct] : this.me()?.contractType || '—';
  });
  // No `lastLogin`: `lastLoginAt` lives in Identity and no HR route exposes it.

  readonly projectTone = projectStatusTone;
  readonly projectLabel = projectStatusLabel;
  readonly taskTone = taskStatusTone;
  readonly taskLabel = taskStatusLabel;
  readonly shortDate = formatShortDate;

  ngOnInit(): void {
    this.load();
    this.lookups
      .departments()
      .subscribe((list) => this.departmentNames.set(new Map(list.map((d) => [d.id, d.name]))));
  }

  /**
   * `GET /api/employees/me` is the whole load now. The overview counts and the manager card have
   * no endpoint behind them, so they are not requested at all — they render an unavailable state.
   */
  load(): void {
    this.loading.set(true);
    this.failed.set(false);
    this.profileUnavailable.set(false);
    // 403 handled (spec 002c): `employees.view_own` missing renders the unavailable state.
    this.employees.getMe({ context: handled(403) }).subscribe({
      next: (me) => {
        this.me.set(me);
        this.loading.set(false);
      },
      error: (err: HttpErrorResponse) => {
        this.loading.set(false);
        // 404 — the caller has no employee record; a client user legitimately has none.
        // 403 — `employees.view_own` has not been granted. The `Employee` role is seeded with no
        // permission claims at all, so this is the normal answer on a fresh environment.
        // Neither is an error worth a red state.
        if (err.status === 404 || err.status === 403) {
          this.profileUnavailable.set(true);
        } else {
          this.failed.set(true);
        }
      },
    });
  }

  reload(): void {
    window.location.reload();
  }

  setTab(id: string): void {
    this.activeTab.set(id);
    if (id === 'projects' && this.projects() === null && !this.projectsLoading()) {
      this.projectsLoading.set(true);
      this.employees.getMineProjects().subscribe({
        next: (list) => {
          this.projects.set(list);
          this.projectsUnavailable.set(false);
          this.projectsLoading.set(false);
        },
        // Was `set([])`, which rendered "No projects yet" — a confident claim about work the app
        // cannot actually see. The route does not exist; say that instead.
        error: () => {
          this.projects.set([]);
          this.projectsUnavailable.set(true);
          this.projectsLoading.set(false);
        },
      });
    }
    if (id === 'tasks' && this.tasks() === null && !this.tasksLoading()) {
      this.tasksLoading.set(true);
      this.employees.getMineTasks().subscribe({
        next: (list) => {
          this.tasks.set(list);
          this.tasksUnavailable.set(false);
          this.tasksLoading.set(false);
        },
        error: () => {
          this.tasks.set([]);
          this.tasksUnavailable.set(true);
          this.tasksLoading.set(false);
        },
      });
    }
  }

  openProject(projectId: string): void {
    void this.router.navigate(['/projects', projectId]);
  }
}
