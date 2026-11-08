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
import { ErrorHandlerService, friendly } from '@platform/http/error-handler.service';
import { injectReloadOnConflict } from '@platform/http/concurrency';
import { ToastService } from '@platform/feedback/toast.service';
import { CatalogService } from '@platform/i18n/catalog.service';
import type { CatalogKey } from '@platform/i18n/catalog/en';
import { formatCairoDate } from '@platform/i18n/intl-locale';
import { PermissionsService } from '@platform/permissions';
import { ProjectService } from '../../data/project.service';
import { ProjectMemberService } from '../../data/project-member.service';
import { ProjectAccessStore } from '../../stores/project-access.store';
import type { Project, ProjectMember, ProjectMemberAccess } from '../../model/project.model';
import {
  ProjectAction,
  ProjectLevel,
  canProjectAction,
  isProjectClosed,
} from '../../model/project-actions';
import { ProjectClosedBannerComponent } from '../shared/project-closed-banner.component';

type LoadState = 'loading' | 'ready' | 'error' | 'notFound';

/** The member's access as the level the UI names it ("Contributor" is the Editor level, 2). */
const ACCESS_LEVEL: Record<ProjectMemberAccess, ProjectLevel> = {
  Viewer: 'Viewer',
  Contributor: 'Editor',
  Manager: 'Manager',
};
const LEVEL_ACCESS: Record<ProjectLevel, ProjectMemberAccess> = {
  Viewer: 'Viewer',
  Editor: 'Contributor',
  Manager: 'Manager',
};

/**
 * crmp P-1 (D1): the project's members and their levels — `GET/POST /projects/{id}/members`,
 * `PUT …/members/{memberId}/access`, `DELETE …/members/{memberId}` (dms `ProjectMemberEndpoints.cs:23-50`).
 * Writes are Manager-only: `project.manage_members` AND `myLevel` Manager (contract §2.17.2), shown
 * through `canProjectAction`. `AlreadyMember` and `EmployeeNotFound` show inline;
 * `projects.members.ConcurrentUpdate` reloads with the shared toast.
 */
@Component({
  selector: 'app-project-members-page',
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
    <div class="flex flex-col gap-4 p-6 max-w-4xl">
      <a class="fs-label text-text-muted hover:text-accent" [routerLink]="['/projects', projectId]">
        {{ catalog.t('pm.back') }}
      </a>

      @switch (state()) {
        @case ('loading') {
          <div class="flex flex-col gap-2" aria-busy="true">
            <pera-skeleton [height]="28" width="40%" />
            <pera-skeleton [height]="56" />
            <pera-skeleton [height]="56" />
          </div>
        }
        @case ('notFound') {
          <pera-empty
            [title]="catalog.t('pm.notFound')"
            [description]="catalog.t('pm.notFoundBody')"
            iconName="search"
          />
        }
        @case ('error') {
          <pera-alert tone="danger">
            {{ catalog.t('pm.loadFailed') }}
            <pera-button variant="ghost" size="sm" (click)="load()">{{
              catalog.t('pm.retry')
            }}</pera-button>
          </pera-alert>
        }
        @case ('ready') {
          <pera-page-header [title]="catalog.t('pm.title')" [count]="members().length" />
          <p class="m-0 fs-body-sm text-text-secondary">{{ catalog.t('pm.subtitle') }}</p>
          <p class="m-0 fs-caption text-text-muted" data-my-level>
            {{ catalog.t('pm.yourLevel', { level: levelLabel(myLevel()) }) }} ·
            {{ catalog.t('pm.levelHelp') }}
          </p>

          @if (project(); as p) {
            <app-project-closed-banner [project]="p" />
          }

          @if (inlineError(); as message) {
            <pera-alert tone="danger" data-inline-error>{{ message }}</pera-alert>
          }

          @if (can('member.add')) {
            <form
              class="flex flex-wrap items-end gap-3 border border-border-soft p-3"
              (ngSubmit)="add()"
              data-add-member
            >
              <pera-form-field class="grow min-w-0" [label]="catalog.t('pm.employee')">
                <pera-select
                  name="employee"
                  [options]="employeeOptions()"
                  [placeholder]="catalog.t('pm.pickEmployee')"
                  [ngModel]="newEmployeeId()"
                  (ngModelChange)="newEmployeeId.set($event)"
                />
              </pera-form-field>
              <pera-form-field [label]="catalog.t('pm.level')">
                <pera-select
                  name="level"
                  [options]="levelOptions()"
                  [ngModel]="newLevel()"
                  (ngModelChange)="newLevel.set($event)"
                />
              </pera-form-field>
              <pera-button
                type="submit"
                variant="primary"
                [disabled]="!newEmployeeId() || busy()"
                [loading]="busy()"
              >
                {{ busy() ? catalog.t('pm.adding') : catalog.t('pm.add') }}
              </pera-button>
            </form>
          } @else {
            <p class="m-0 fs-caption text-text-muted" data-manager-only>
              {{ catalog.t('pm.managerOnly') }}
            </p>
          }

          @if (members().length) {
            <ul class="m-0 p-0 list-none flex flex-col border border-border-soft" data-members>
              @for (m of members(); track m.id) {
                <li
                  class="flex flex-wrap items-center gap-3 px-3 py-2 border-b border-border-soft last:border-b-0"
                  data-member-row
                >
                  <div class="flex flex-col grow min-w-0">
                    <span class="fs-body-sm font-medium truncate">{{ nameOf(m) }}</span>
                    <span class="fs-caption text-text-muted">{{
                      catalog.t('pm.addedOn', { date: date(m.addedAtUtc) })
                    }}</span>
                  </div>
                  @if (can('member.access')) {
                    <pera-select
                      size="sm"
                      [ariaLabel]="catalog.t('pm.changeLevel', { name: nameOf(m) })"
                      [options]="levelOptions()"
                      [disabled]="busy()"
                      [ngModel]="levelOf(m)"
                      (ngModelChange)="changeLevel(m, $event)"
                    />
                  } @else {
                    <span class="fs-label" data-level>{{ levelLabel(levelOf(m)) }}</span>
                  }
                  @if (can('member.remove')) {
                    <pera-button
                      variant="ghost"
                      size="sm"
                      [disabled]="busy()"
                      (click)="remove(m)"
                      data-remove
                      >{{ catalog.t('pm.remove') }}</pera-button
                    >
                  }
                </li>
              }
            </ul>
          } @else {
            <pera-empty
              [title]="catalog.t('pm.empty')"
              [description]="catalog.t('pm.emptyBody')"
              iconName="users"
            />
          }
        }
      }
    </div>
  `,
})
export class ProjectMembersPageComponent implements OnInit {
  private readonly route = inject(ActivatedRoute);
  private readonly projects = inject(ProjectService);
  private readonly api = inject(ProjectMemberService);
  private readonly directory = inject(EmployeeService);
  private readonly errors = inject(ErrorHandlerService);
  private readonly toast = inject(ToastService);
  private readonly confirm = inject(ConfirmService);
  private readonly permissions = inject(PermissionsService);
  private readonly reloadOnConflict = injectReloadOnConflict();
  private readonly access = inject(ProjectAccessStore);
  protected readonly catalog = inject(CatalogService);

  readonly projectId = this.route.snapshot.paramMap.get('id') ?? '';
  readonly state = signal<LoadState>('loading');
  readonly project = signal<Project | null>(null);
  readonly members = signal<ProjectMember[]>([]);
  readonly employees = signal<Map<string, string>>(new Map());
  readonly busy = signal(false);
  readonly inlineError = signal<string | null>(null);
  readonly newEmployeeId = signal<string | null>(null);
  readonly newLevel = signal<ProjectLevel>('Viewer');

  readonly myLevel = computed<ProjectLevel>(() => this.project()?.myLevel ?? 'Viewer');
  readonly closed = computed(() => {
    const p = this.project();
    return !!p && isProjectClosed(p);
  });

  readonly levelOptions = computed<SelectOption[]>(() =>
    (['Viewer', 'Editor', 'Manager'] as const).map((l) => ({
      value: l,
      label: this.levelLabel(l),
    })),
  );
  readonly employeeOptions = computed<SelectOption[]>(() => {
    const taken = new Set(this.members().map((m) => m.employeeId));
    return [...this.employees()]
      .filter(([id]) => !taken.has(id))
      .map(([value, label]) => ({ value, label }));
  });

  ngOnInit(): void {
    this.load();
  }

  load(): void {
    this.state.set('loading');
    forkJoin({
      project: this.projects.getById(this.projectId),
      members: this.api.getByProject(this.projectId),
      employees: this.directory
        .listPaged({ page: 1, pageSize: 500 })
        .pipe(catchError(() => of({ items: [] as { id: string; fullName: string }[] }))),
    }).subscribe({
      next: ({ project, members, employees }) => {
        this.project.set(project);
        // Review B7 (CP-8): the shared gate other project screens read holds the same project.
        this.access.seed(project);
        this.members.set(members);
        this.employees.set(new Map((employees?.items ?? []).map((e) => [e.id, e.fullName])));
        this.state.set('ready');
      },
      error: (err: HttpErrorResponse) => this.state.set(err.status === 404 ? 'notFound' : 'error'),
    });
  }

  can(action: ProjectAction): boolean {
    return canProjectAction(this.project(), action, (p) => this.permissions.can(p));
  }

  levelOf(m: ProjectMember): ProjectLevel {
    return ACCESS_LEVEL[m.access] ?? 'Viewer';
  }

  levelLabel(level: ProjectLevel): string {
    return this.catalog.t(`pm.level.${level}` as CatalogKey);
  }

  nameOf(m: ProjectMember): string {
    return m.employeeName || this.employees().get(m.employeeId) || m.employeeId;
  }

  date(iso: string | null | undefined): string {
    return iso ? formatCairoDate(iso, this.catalog.locale()) : '—';
  }

  add(): void {
    const employeeId = this.newEmployeeId();
    if (!employeeId || this.busy()) return;
    this.run(
      this.api.add({
        projectId: this.projectId,
        employeeId,
        access: LEVEL_ACCESS[this.newLevel()],
      }),
      'pm.added',
      () => this.newEmployeeId.set(null),
    );
  }

  changeLevel(m: ProjectMember, level: ProjectLevel): void {
    if (this.busy() || level === this.levelOf(m)) return;
    this.run(
      this.api.changeAccess(this.projectId, m.id, { access: LEVEL_ACCESS[level] }),
      'pm.levelChanged',
    );
  }

  async remove(m: ProjectMember): Promise<void> {
    if (this.busy()) return;
    const ok = await this.confirm.open({
      title: this.catalog.t('pm.removeTitle'),
      body: this.catalog.t('pm.removeBody', { name: this.nameOf(m) }),
      confirmLabel: this.catalog.t('pm.remove'),
      tone: 'danger',
    });
    if (!ok) return;
    this.run(this.api.remove(this.projectId, m.id), 'pm.removed');
  }

  private run(
    call: ReturnType<ProjectMemberService['remove']>,
    successKey: CatalogKey,
    after?: () => void,
  ): void {
    this.busy.set(true);
    this.inlineError.set(null);
    call.subscribe({
      next: () => {
        this.busy.set(false);
        after?.();
        this.toast.show({ tone: 'success', message: this.catalog.t(successKey) });
        this.reloadMembers();
        this.reloadProject();
      },
      error: (err: HttpErrorResponse) => {
        this.busy.set(false);
        if (this.reloadOnConflict(err, () => this.load())) return;
        this.inlineError.set(friendly(this.errors.parse(err)));
        this.reloadMembers();
      },
    });
  }

  /**
   * Review B7 (blind-all B6, CP-8): a level change or removal may be the caller's own, so re-read the
   * project (its `myLevel`) and re-seed the shared ProjectAccessStore; on a failed read (e.g. no longer
   * a member) the store reads it again itself.
   */
  private reloadProject(): void {
    this.projects.getById(this.projectId).subscribe({
      next: (project) => {
        this.project.set(project);
        this.access.seed(project);
      },
      error: () => this.access.refresh(this.projectId),
    });
  }

  private reloadMembers(): void {
    this.api
      .getByProject(this.projectId)
      .pipe(catchError(() => of(this.members())))
      .subscribe((list) => this.members.set(list));
  }
}
