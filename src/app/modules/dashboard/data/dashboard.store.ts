import { Injectable, computed, inject, signal } from '@angular/core';
import { firstValueFrom } from 'rxjs';
import { PERM, PermissionsService } from '@platform/permissions';
import { handled } from '@platform/http/handled-errors';
import { AuthStore } from '@platform/auth/auth.store';
import {
  ProjectService,
  ProjectTaskService,
  type Project,
  type ProjectStatus,
  type ProjectTask,
  type ProjectTaskStatus,
} from '@modules/projects';
import { EmployeeService } from '@modules/people';
import {
  CrmApprovalsService,
  CrmLeadService,
  CrmMyGatheringWorkService,
  type CrmLeadStatusCounts,
  type MyGatheringWorkItem,
  type PendingApproval,
} from '@modules/crm';
import { NotificationStore } from '@modules/notifications';

/** One widget's state: loading until its call settles, then data or an error. */
export interface WidgetState<T> {
  loading: boolean;
  data: T | null;
  error: boolean;
}

/** A task assigned to me, with the project it belongs to. */
export interface MyTask extends ProjectTask {
  projectName: string;
  projectCode: string;
}

const idle = <T>(): WidgetState<T> => ({ loading: false, data: null, error: false });
const loading = <T>(): WidgetState<T> => ({ loading: true, data: null, error: false });

/** How many of each list the dashboard shows; "View all" opens the full page. */
export const DASHBOARD_LIMITS = {
  projects: 6,
  /** Projects scanned for my tasks — one call each, in parallel. */
  taskProjects: 5,
  tasks: 8,
  approvals: 5,
  gathering: 5,
} as const;

const CLOSED: readonly ProjectStatus[] = ['Completed', 'Cancelled'];
const OPEN_TASK: readonly ProjectTaskStatus[] = [
  'Open',
  'InProgress',
  'PendingApproval',
  'Rejected',
];

/**
 * DB-1: the home dashboard's data. Each widget has its own permission, and its call is made only
 * when the user holds it — a plain employee never triggers a 403. Widgets load independently, so
 * one failing source leaves the others on screen.
 *
 * | Widget            | Permission             | Source                                        |
 * |-------------------|------------------------|-----------------------------------------------|
 * | My projects       | project.read           | `GET /api/projects`                           |
 * | My tasks          | stage_tasks.read + an employee record | `/employees/me`, then `/projects/{id}/tasks?assigneeId` |
 * | Needs attention   | approvals.read         | `GET /api/approvals/pending`                  |
 * | Gathering work    | crm.briefs.read        | `GET /api/crm/my-gathering-work`              |
 * | Leads pipeline    | crm.leads.read         | `GET /api/crm/leads/status-counts`            |
 * | Notifications     | notifications.view_own | the app-wide `NotificationStore`              |
 */
@Injectable()
export class DashboardStore {
  private readonly permissions = inject(PermissionsService);
  private readonly auth = inject(AuthStore);
  private readonly projectsApi = inject(ProjectService);
  private readonly tasksApi = inject(ProjectTaskService);
  private readonly employees = inject(EmployeeService);
  private readonly approvalsApi = inject(CrmApprovalsService);
  private readonly gatheringApi = inject(CrmMyGatheringWorkService);
  private readonly leadsApi = inject(CrmLeadService);
  readonly notifications = inject(NotificationStore);

  /** What the signed-in user may see, read once per load. */
  readonly can = computed(() => ({
    projects: this.permissions.can(PERM.projects.read),
    tasks: this.permissions.can(PERM.stageTasks.read),
    approvals: this.permissions.can(PERM.approvals.read),
    gathering: this.permissions.can(PERM.crm.briefs.read),
    leads: this.permissions.can(PERM.crm.leads.read),
    notifications: this.permissions.can(PERM.notifications.viewOwn),
    createProject: this.permissions.can(PERM.projects.create),
    sites: this.permissions.can('sites.read'),
  }));

  /** True when not a single widget is open to the user. */
  readonly nothingToShow = computed(() => {
    const c = this.can();
    return !c.projects && !c.tasks && !c.approvals && !c.gathering && !c.leads && !c.notifications;
  });

  readonly displayName = signal('');
  readonly projects =
    signal<WidgetState<{ items: Project[]; total: number; active: number }>>(idle());
  readonly tasks = signal<WidgetState<MyTask[]>>(idle());
  readonly approvals = signal<WidgetState<{ items: PendingApproval[]; total: number }>>(idle());
  readonly gathering = signal<WidgetState<MyGatheringWorkItem[]>>(idle());
  readonly leads = signal<WidgetState<CrmLeadStatusCounts>>(idle());

  /** `/employees/me`, asked once per load and shared by the widgets that need it; null = no record. */
  private me: Promise<{ id: string; fullName: string } | null> | null = null;

  private myEmployee(): Promise<{ id: string; fullName: string } | null> {
    // No employee record (a 404 or 403) simply means no work of my own.
    this.me ??= firstValueFrom(this.employees.getMe({ context: handled(403, 404) })).catch(
      () => null,
    );
    return this.me;
  }

  /** Fires every call the user's permissions allow, all at once. */
  load(): void {
    this.me = null;
    this.displayName.set(this.auth.user()?.userName ?? '');
    const c = this.can();
    if (c.projects) void this.loadProjects(c.tasks);
    else if (c.tasks) void this.loadTasks([]);
    if (c.approvals) void this.loadApprovals();
    if (c.gathering) void this.loadGathering();
    if (c.leads) void this.loadLeads();
    if (c.notifications) this.notifications.loadRecent();
  }

  private async loadProjects(alsoTasks: boolean): Promise<void> {
    this.projects.set(loading());
    if (alsoTasks) this.tasks.set(loading());
    try {
      const page = await firstValueFrom(this.projectsApi.getAll(1, 50));
      const live = page.items.filter((p) => p.isActive !== false);
      // "Active" = still open: draft, in progress or on hold. A new project stays Draft until its
      // work starts, so counting only InProgress would show 0 for a studio full of new projects.
      const active = live.filter((p) => !CLOSED.includes(p.status));
      // In progress first, then the other open ones, then the closed ones.
      const rank = (p: Project) =>
        p.status === 'InProgress' ? 0 : CLOSED.includes(p.status) ? 2 : 1;
      const ordered = [...live].sort((a, b) => rank(a) - rank(b));
      this.projects.set({
        loading: false,
        error: false,
        data: {
          items: ordered.slice(0, DASHBOARD_LIMITS.projects),
          total: page.totalCount,
          active: active.length,
        },
      });
      if (alsoTasks) await this.loadTasks(active.length ? active : ordered);
    } catch {
      this.projects.set({ loading: false, data: null, error: true });
      if (alsoTasks) this.tasks.set({ loading: false, data: null, error: true });
    }
  }

  /** My open tasks across my first few active projects, due date first. */
  private async loadTasks(projects: Project[]): Promise<void> {
    this.tasks.set(loading());
    try {
      const me = await this.myEmployee();
      if (me?.fullName) this.displayName.set(me.fullName);
      if (!me?.id || !projects.length) {
        this.tasks.set({ loading: false, error: false, data: [] });
        return;
      }
      const scanned = projects.slice(0, DASHBOARD_LIMITS.taskProjects);
      const lists = await Promise.all(
        scanned.map((p) =>
          firstValueFrom(this.tasksApi.getByProject(p.id, { assigneeId: me.id, pageSize: 50 }))
            .then((rows) => rows.map((t) => ({ ...t, projectName: p.name, projectCode: p.code })))
            .catch(() => [] as MyTask[]),
        ),
      );
      const open = lists
        .flat()
        .filter((t) => OPEN_TASK.includes(t.status))
        .sort(byDueDate)
        .slice(0, DASHBOARD_LIMITS.tasks);
      this.tasks.set({ loading: false, error: false, data: open });
    } catch {
      this.tasks.set({ loading: false, data: null, error: true });
    }
  }

  private async loadApprovals(): Promise<void> {
    this.approvals.set(loading());
    try {
      const page = await firstValueFrom(this.approvalsApi.pending(1, DASHBOARD_LIMITS.approvals));
      this.approvals.set({
        loading: false,
        error: false,
        data: { items: page.items, total: page.totalCount },
      });
    } catch {
      this.approvals.set({ loading: false, data: null, error: true });
    }
  }

  private async loadGathering(): Promise<void> {
    this.gathering.set(loading());
    try {
      // Gathering work is an employee's own; without a record the server answers 403
      // crm.mywork.NotAnEmployee, so don't ask (an admin account has no employee record).
      if (!(await this.myEmployee())) {
        this.gathering.set({ loading: false, error: false, data: [] });
        return;
      }
      const rows = await firstValueFrom(this.gatheringApi.list());
      this.gathering.set({
        loading: false,
        error: false,
        data: rows.slice(0, DASHBOARD_LIMITS.gathering),
      });
    } catch {
      this.gathering.set({ loading: false, data: null, error: true });
    }
  }

  private async loadLeads(): Promise<void> {
    this.leads.set(loading());
    try {
      const counts = await firstValueFrom(this.leadsApi.statusCounts());
      this.leads.set({ loading: false, error: false, data: counts });
    } catch {
      this.leads.set({ loading: false, data: null, error: true });
    }
  }
}

/** Tasks with a due date first (soonest first), then the rest. */
function byDueDate(a: ProjectTask, b: ProjectTask): number {
  if (a.dueDate && b.dueDate) return a.dueDate.localeCompare(b.dueDate);
  if (a.dueDate) return -1;
  if (b.dueDate) return 1;
  return 0;
}
