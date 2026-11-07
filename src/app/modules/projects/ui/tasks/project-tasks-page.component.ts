import { ToastService } from '@platform/feedback/toast.service';
import { ErrorHandlerService, friendly } from '@platform/http/error-handler.service';
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
import { catchError, of } from 'rxjs';
import {
  PeraAlertComponent,
  PeraButtonComponent,
  PeraEmptyComponent,
  PeraFormFieldComponent,
  PeraPageHeaderComponent,
  PeraSelectComponent,
  PeraSkeletonComponent,
  SelectOption,
} from '@ds';
import { EmployeeService } from '@modules/people';
import { CatalogService } from '@platform/i18n/catalog.service';
import type { CatalogKey } from '@platform/i18n/catalog/en';
import { formatCairoDate } from '@platform/i18n/intl-locale';
import { ProjectStageService } from '../../data/project-stage.service';
import { ProjectTaskQuery, ProjectTaskService } from '../../data/project-task.service';
import type { ProjectStage, ProjectTask, ProjectTaskStatus } from '../../model/project.model';
import { ProjectAccessStore } from '../../stores/project-access.store';
import { ProjectClosedBannerComponent } from '../shared/project-closed-banner.component';

/** One page of the task list (contract §1.6: opt-in paging; a short page is the last one). */
export const TASK_PAGE_SIZE = 50;

const STATUSES: ProjectTaskStatus[] = [
  'Locked',
  'Open',
  'InProgress',
  'PendingApproval',
  'Completed',
  'Rejected',
  'Cancelled',
];

type LoadState = 'loading' | 'ready' | 'error' | 'notFound';

/**
 * crmp P-3: the project's tasks, filtered by stage, assignee and status — `GET /projects/{id}/tasks
 * ?stageId&assigneeId&status&pageNumber&pageSize` (dms `TaskEndpoints.cs:23`), a page at a time with
 * "load more". Each row opens the task page.
 */
@Component({
  selector: 'app-project-tasks-page',
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [
    FormsModule,
    RouterLink,
    PeraAlertComponent,
    PeraButtonComponent,
    PeraEmptyComponent,
    PeraFormFieldComponent,
    PeraPageHeaderComponent,
    PeraSelectComponent,
    PeraSkeletonComponent,
    ProjectClosedBannerComponent,
  ],
  template: `
    <div class="flex flex-col gap-4 p-6 max-w-5xl">
      <a class="fs-label text-text-muted hover:text-accent" [routerLink]="['/projects', projectId]">
        {{ catalog.t('pm.back') }}
      </a>
      <pera-page-header [title]="catalog.t('pt.listTitle')" />
      @if (access.project(projectId)(); as p) {
        <app-project-closed-banner [project]="p" />
      }

      <div class="flex flex-wrap gap-3" data-filters>
        <pera-form-field [label]="catalog.t('pt.filterStage')">
          <pera-select
            name="stage"
            [options]="stageOptions()"
            [ngModel]="stageId()"
            (ngModelChange)="setFilter('stage', $event)"
          />
        </pera-form-field>
        <pera-form-field [label]="catalog.t('pt.filterAssignee')">
          <pera-select
            name="assignee"
            [options]="assigneeOptions()"
            [ngModel]="assigneeId()"
            (ngModelChange)="setFilter('assignee', $event)"
          />
        </pera-form-field>
        <pera-form-field [label]="catalog.t('pt.filterStatus')">
          <pera-select
            name="status"
            [options]="statusOptions()"
            [ngModel]="status()"
            (ngModelChange)="setFilter('status', $event)"
          />
        </pera-form-field>
      </div>

      @switch (state()) {
        @case ('loading') {
          <div class="flex flex-col gap-2" aria-busy="true">
            <pera-skeleton [height]="44" />
            <pera-skeleton [height]="44" />
            <pera-skeleton [height]="44" />
          </div>
        }
        @case ('notFound') {
          <pera-empty
            [title]="catalog.t('pm.notFound')"
            [description]="catalog.t('pm.notFoundBody')"
          />
        }
        @case ('error') {
          <pera-alert tone="danger">
            {{ catalog.t('pt.loadFailed') }}
            <pera-button variant="ghost" size="sm" (click)="reload()">{{
              catalog.t('pm.retry')
            }}</pera-button>
          </pera-alert>
        }
        @case ('ready') {
          @if (tasks().length) {
            <ul class="m-0 p-0 list-none flex flex-col border border-border-soft" data-task-list>
              @for (t of tasks(); track t.id) {
                <li class="border-b border-border-soft last:border-b-0">
                  <a
                    class="flex flex-wrap items-center gap-3 px-3 py-2 hover:bg-surface-muted"
                    [routerLink]="['/projects', projectId, 'tasks', t.id]"
                    data-task-row
                  >
                    <span class="fs-body-sm font-medium grow min-w-0 truncate">{{ t.name }}</span>
                    <span class="fs-caption text-text-muted">{{ stageName(t) }}</span>
                    <span class="fs-caption text-text-muted">{{ assigneeName(t) }}</span>
                    <span class="fs-label">{{ statusLabel(t.status) }}</span>
                    @if (t.dueDate) {
                      <span class="fs-caption text-text-muted">{{
                        catalog.t('pt.due', { date: date(t.dueDate) })
                      }}</span>
                    }
                  </a>
                </li>
              }
            </ul>
            @if (hasMore()) {
              <pera-button
                variant="ghost"
                [disabled]="loadingMore()"
                (click)="loadMore()"
                data-load-more
              >
                {{
                  loadingMore() ? catalog.t('projects.loadingMore') : catalog.t('projects.loadMore')
                }}
              </pera-button>
            }
          } @else {
            <pera-empty [title]="catalog.t('pt.empty')" [description]="catalog.t('pt.emptyBody')" />
          }
        }
      }
    </div>
  `,
})
export class ProjectTasksPageComponent implements OnInit {
  private readonly route = inject(ActivatedRoute);
  private readonly api = inject(ProjectTaskService);
  private readonly stagesApi = inject(ProjectStageService);
  private readonly directory = inject(EmployeeService);
  protected readonly access = inject(ProjectAccessStore);
  protected readonly catalog = inject(CatalogService);
  private readonly toast = inject(ToastService);
  private readonly errors = inject(ErrorHandlerService);

  readonly projectId = this.route.snapshot.paramMap.get('id') ?? '';
  readonly state = signal<LoadState>('loading');
  readonly tasks = signal<ProjectTask[]>([]);
  readonly stages = signal<ProjectStage[]>([]);
  readonly employees = signal<Map<string, string>>(new Map());
  readonly stageId = signal<string | null>(null);
  readonly assigneeId = signal<string | null>(null);
  readonly status = signal<ProjectTaskStatus | null>(null);
  readonly hasMore = signal(false);
  readonly loadingMore = signal(false);
  private page = 1;
  /** Drops a response that a newer filter change has overtaken. */
  private generation = 0;

  readonly stageOptions = computed<SelectOption[]>(() => [
    { value: null, label: this.catalog.t('pt.any') },
    ...this.stages().map((s) => ({ value: s.id, label: s.name })),
  ]);
  readonly assigneeOptions = computed<SelectOption[]>(() => [
    { value: null, label: this.catalog.t('pt.any') },
    ...[...this.employees()].map(([value, label]) => ({ value, label })),
  ]);
  readonly statusOptions = computed<SelectOption[]>(() => [
    { value: null, label: this.catalog.t('pt.any') },
    ...STATUSES.map((s) => ({ value: s, label: this.statusLabel(s) })),
  ]);

  ngOnInit(): void {
    this.access.ensure(this.projectId);
    this.stagesApi
      .getByProject(this.projectId)
      .pipe(catchError(() => of([] as ProjectStage[])))
      .subscribe((list) => this.stages.set(list));
    this.directory
      .listPaged({ page: 1, pageSize: 500 })
      .pipe(catchError(() => of({ items: [] as { id: string; fullName: string }[] })))
      .subscribe((p) =>
        this.employees.set(new Map((p?.items ?? []).map((e) => [e.id, e.fullName]))),
      );
    this.reload();
  }

  setFilter(kind: 'stage' | 'assignee' | 'status', value: string | null): void {
    if (kind === 'stage') this.stageId.set(value);
    if (kind === 'assignee') this.assigneeId.set(value);
    if (kind === 'status') this.status.set(value as ProjectTaskStatus | null);
    this.reload();
  }

  private query(page: number): ProjectTaskQuery {
    return {
      stageId: this.stageId(),
      assigneeId: this.assigneeId(),
      status: this.status(),
      pageNumber: page,
      pageSize: TASK_PAGE_SIZE,
    };
  }

  reload(): void {
    const gen = ++this.generation;
    this.page = 1;
    this.state.set('loading');
    this.api.getByProject(this.projectId, this.query(1)).subscribe({
      next: (list) => {
        if (gen !== this.generation) return;
        this.tasks.set(list);
        this.hasMore.set(list.length === TASK_PAGE_SIZE);
        this.state.set('ready');
      },
      error: (err: HttpErrorResponse) => {
        if (gen === this.generation) this.state.set(err.status === 404 ? 'notFound' : 'error');
      },
    });
  }

  loadMore(): void {
    if (this.loadingMore() || !this.hasMore()) return;
    const gen = this.generation;
    this.loadingMore.set(true);
    const next = this.page + 1;
    this.api.getByProject(this.projectId, this.query(next)).subscribe({
      next: (list) => {
        this.loadingMore.set(false);
        if (gen !== this.generation) return;
        this.page = next;
        const seen = new Set(this.tasks().map((t) => t.id));
        this.tasks.update((all) => [...all, ...list.filter((t) => !seen.has(t.id))]);
        this.hasMore.set(list.length === TASK_PAGE_SIZE);
      },
      error: (err: HttpErrorResponse) => {
        this.loadingMore.set(false);
        this.toast.show({ tone: 'danger', message: friendly(this.errors.parse(err)) });
      },
    });
  }

  stageName(t: ProjectTask): string {
    if (!t.projectStageId) return this.catalog.t('pt.unstaged');
    return this.stages().find((s) => s.id === t.projectStageId)?.name ?? '';
  }

  assigneeName(t: ProjectTask): string {
    return t.assignedToId ? (this.employees().get(t.assignedToId) ?? '') : '';
  }

  statusLabel(s: ProjectTaskStatus): string {
    return this.catalog.t(`pt.status.${s}` as CatalogKey);
  }

  date(iso: string): string {
    return formatCairoDate(iso, this.catalog.locale());
  }
}
