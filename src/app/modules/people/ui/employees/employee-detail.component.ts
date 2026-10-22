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
import { ActivatedRoute, Router } from '@angular/router';
import { EmployeeService, EmployeePatch } from '../../data/employee.service';
import { LookupCache } from '../../data/lookup.cache';
import { ToastService } from '@platform/feedback/toast.service';
import { LocaleService } from '@platform/i18n';
import { CanDirective } from '@platform/permissions';
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
import { contractTypeLabel } from './contract-type';
import { EditEmployeeDialogComponent } from './edit-employee-dialog.component';
import {
  ColumnDef,
  ConfirmService,
  ModalService,
  PeraAvatarComponent,
  PeraBadgeComponent,
  PeraButtonComponent,
  PeraCardComponent,
  PeraDataTableComponent,
  PeraEmptyComponent,
  PeraSkeletonComponent,
  PeraTabsComponent,
  PeraTooltipDirective,
  TabDef,
} from '@ds';

/** How long the login gets to come back on after activate before we look again. */
const LOGIN_RECHECK_DELAY_MS = 2000;

@Component({
  selector: 'app-employee-detail',
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [
    CanDirective,
    PeraAvatarComponent,
    PeraDataTableComponent,
    PeraEmptyComponent,
    PeraSkeletonComponent,
    PeraTooltipDirective,
  ],
  templateUrl: './employee-detail.component.html',
})
export class EmployeeDetailComponent implements OnInit {
  private readonly route = inject(ActivatedRoute);
  private readonly router = inject(Router);
  private readonly employeesApi = inject(EmployeeService);
  private readonly lookups = inject(LookupCache);
  private readonly modal = inject(ModalService);
  private readonly confirm = inject(ConfirmService);
  private readonly toast = inject(ToastService);
  readonly locale = inject(LocaleService);

  readonly loading = signal(true);
  readonly failed = signal(false);
  readonly employee = signal<EmployeeFull | null>(null);
  /** Set between an activate and its delayed login refetch (006b-2 #20). */
  readonly loginRecheckPending = signal(false);
  readonly overview = signal<EmployeeOverview | null>(null);
  readonly projects = signal<EmployeeProjectRef[]>([]);
  readonly tasks = signal<EmployeeTaskRef[]>([]);

  /** These three have no backend — see the `TODO(backend-gap)` markers on the directory service. */
  readonly overviewUnavailable = signal(false);
  readonly projectsUnavailable = signal(false);
  readonly tasksUnavailable = signal(false);

  /** departmentId → name: the employee wire carries no `departmentName`. */
  private readonly departmentNames = signal<Map<string, string>>(new Map());
  readonly departmentName = computed(() => {
    const id = this.employee()?.primaryDepartmentId;
    return id ? (this.departmentNames().get(id) ?? null) : null;
  });
  readonly contractLabel = computed(() => contractTypeLabel(this.employee()?.contractType));

  readonly activeTab = signal('overview');
  readonly tabs: TabDef[] = [
    { id: 'overview', label: 'Overview' },
    { id: 'projects', label: 'Projects' },
    { id: 'tasks', label: 'Tasks' },
    { id: 'activity', label: 'Activity' },
  ];

  private readonly taskStatusTpl = viewChild.required<TemplateRef<unknown>>('taskStatusTpl');
  private readonly taskDueTpl = viewChild.required<TemplateRef<unknown>>('taskDueTpl');

  readonly taskColumns = computed<ColumnDef<EmployeeTaskRef>[]>(() => [
    { key: 'name', header: 'Task', minWidth: 200, sortable: true },
    { key: 'projectName', header: 'Project', width: 200, sortable: true },
    { key: 'stageName', header: 'Stage', width: 160 },
    { key: 'status', header: 'Status', width: 130, sortable: true, template: this.taskStatusTpl() },
    { key: 'dueDate', header: 'Due', width: 110, sortable: true, template: this.taskDueTpl() },
  ]);

  readonly tenureLabel = computed(() => tenure(this.employee()?.hireDate, this.locale.locale()));

  readonly projectTone = projectStatusTone;
  readonly projectLabel = projectStatusLabel;
  readonly taskTone = taskStatusTone;
  readonly taskLabel = taskStatusLabel;
  readonly shortDate = formatShortDate;

  /**
   * Only `getFull` is a live route. `getOverview`, `getProjects` and `getTasks` have no backend at
   * all, so they are fetched SEPARATELY with their own failure state — a `forkJoin` would let any
   * one of those guaranteed 404s take down the whole detail page, which is what used to happen.
   */
  ngOnInit(): void {
    const id = this.route.snapshot.paramMap.get('id')!;

    this.employeesApi.getFull(id).subscribe({
      next: (employee) => {
        this.employee.set(employee);
        this.loading.set(false);
      },
      error: () => {
        this.loading.set(false);
        this.failed.set(true);
      },
    });

    this.employeesApi.getOverview(id).subscribe({
      next: (overview) => {
        this.overview.set(overview);
        this.overviewUnavailable.set(false);
      },
      error: () => this.overviewUnavailable.set(true),
    });

    this.employeesApi.getProjects(id).subscribe({
      next: (list) => {
        this.projects.set(list);
        this.projectsUnavailable.set(false);
      },
      error: () => this.projectsUnavailable.set(true),
    });

    this.employeesApi.getTasks(id).subscribe({
      next: (list) => {
        this.tasks.set(list);
        this.tasksUnavailable.set(false);
      },
      error: () => this.tasksUnavailable.set(true),
    });

    this.lookups
      .departments()
      .subscribe((list) => this.departmentNames.set(new Map(list.map((d) => [d.id, d.name]))));
  }

  /** Edit is offered only while ACTIVE: `Employee.Update()` no-ops on an inactive employee. */
  async openEdit(): Promise<void> {
    const current = this.employee();
    if (!current || !current.isActive) return;
    const ref = this.modal.open<EmployeePatch | null>(EditEmployeeDialogComponent, {
      size: 'md',
      data: {
        employeeId: current.id,
        fullName: current.fullName,
        jobTitle: current.jobTitle,
        contractType: current.contractType,
        phoneNumber: current.phoneNumber,
        emergencyContactPhone: current.emergencyContactPhone,
        notes: current.notes,
        endDate: current.endDate,
      },
    });
    const patch = await ref.afterClosed();
    if (!patch) return;
    this.employee.set({
      ...current,
      jobTitle: patch.jobTitle ?? current.jobTitle,
      contractType: patch.contractType ?? current.contractType,
      phoneNumber: patch.phoneNumber || null,
      emergencyContactPhone: patch.emergencyContactPhone || null,
      notes: patch.notes || null,
      endDate: patch.endDate || null,
      // 006b-2 #21: a name edit sends both halves; the detail shows them joined.
      fullName:
        patch.firstName && patch.lastName
          ? `${patch.firstName} ${patch.lastName}`
          : current.fullName,
    });
  }

  openProject(projectId: string): void {
    void this.router.navigate(['/projects', projectId]);
  }

  goBack(): void {
    void this.router.navigate(['/employees']);
  }

  async toggleActive(): Promise<void> {
    const current = this.employee();
    if (!current) return;
    const deactivating = current.isActive;
    const ok = await this.confirm.open({
      title: deactivating ? 'Deactivate employee' : 'Reactivate employee',
      body: deactivating
        ? `${current.fullName} will lose access to PERA until reactivated.`
        : `${current.fullName} will regain access to PERA.`,
      confirmLabel: deactivating ? 'Deactivate' : 'Reactivate',
      tone: deactivating ? 'danger' : 'default',
    });
    if (!ok) return;
    const call = deactivating
      ? this.employeesApi.deactivate(current.id)
      : this.employeesApi.activate(current.id);
    call.subscribe({
      next: () => {
        this.toast.show({
          tone: 'success',
          message: `${current.fullName} ${deactivating ? 'deactivated' : 'reactivated'}`,
        });
        this.employee.set({ ...current, isActive: !deactivating });
        // 006b-2 #20: activation re-enables the login asynchronously (outbox), so the fresh state
        // can still read "login off" for a moment. Hold the banner, refetch once after ~2 s, and
        // let that answer decide.
        if (!deactivating) {
          this.loginRecheckPending.set(true);
          setTimeout(() => this.recheckLogin(current.id), LOGIN_RECHECK_DELAY_MS);
        }
      },
    });
  }

  /** True when the employee is active but cannot sign in, and no post-activate refetch is due. */
  readonly loginOffWarning = computed(() => {
    const e = this.employee();
    return !!e && e.isActive && !e.loginActive && !this.loginRecheckPending();
  });

  private recheckLogin(id: string): void {
    this.employeesApi.getFull(id).subscribe({
      next: (employee) => {
        this.employee.set(employee);
        this.loginRecheckPending.set(false);
      },
      error: () => this.loginRecheckPending.set(false),
    });
  }
}
