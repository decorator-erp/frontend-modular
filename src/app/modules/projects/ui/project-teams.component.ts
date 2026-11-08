import {
  ChangeDetectionStrategy,
  Component,
  DestroyRef,
  computed,
  effect,
  inject,
  input,
  signal,
} from '@angular/core';
import { FormsModule } from '@angular/forms';
import { HttpErrorResponse } from '@angular/common/http';
import { takeUntilDestroyed } from '@angular/core/rxjs-interop';
import { catchError, forkJoin, of } from 'rxjs';
import { ProjectAccessStore } from '../stores/project-access.store';
import type { ProjectAction } from '../model/project-actions';
import { StageTeam, StageTeamsService } from '../data/stage-teams.service';
import { EmployeeService } from '@modules/people';
import { ProjectStageService } from '../data/project-stage.service';
import { DepartmentService } from '@modules/people';
import { ErrorHandlerService, friendly } from '@platform/http/error-handler.service';
import { ToastService } from '@platform/feedback/toast.service';
import { PERM } from '@platform/permissions';
import { CatalogService } from '@platform/i18n/catalog.service';
import { CanDirective } from '@platform/permissions';
import {
  ConfirmService,
  ModalService,
  PeraAlertComponent,
  PERA_MODAL_DATA,
  PeraAvatarComponent,
  PeraButtonComponent,
  PeraEmptyComponent,
  PeraFormFieldComponent,
  PeraModalComponent,
  PeraModalFooterDirective,
  PeraModalRef,
  PeraSelectComponent,
  PeraSkeletonComponent,
  PeraTabsComponent,
  SelectOption,
  TabDef,
} from '@ds';
import {
  MemberFormDialogComponent,
  MemberFormDialogData,
} from './dialogs/member-form-dialog.component';

export interface EmployeePickerData {
  title: string;
  confirmLabel: string;
  /** Restrict choices to these employee ids (e.g. current team members for head change). */
  restrictToIds?: string[];
}

/** Generic employee picker backed by the employee directory. */
@Component({
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [
    FormsModule,
    PeraModalComponent,
    PeraModalFooterDirective,
    PeraFormFieldComponent,
    PeraSelectComponent,
    PeraButtonComponent,
  ],
  template: `
    <pera-modal [title]="data.title" size="sm">
      <pera-form-field label="Employee" [required]="true">
        <pera-select
          [options]="options()"
          [ngModel]="selected()"
          (ngModelChange)="selected.set($event)"
          placeholder="Select an employee"
        />
      </pera-form-field>
      <div peraModalFooter class="flex gap-2">
        <pera-button variant="ghost" (click)="ref.close()">Cancel</pera-button>
        <pera-button
          variant="primary"
          [disabled]="!selected()"
          (click)="ref.close({ employeeId: selected()! })"
        >
          {{ data.confirmLabel }}
        </pera-button>
      </div>
    </pera-modal>
  `,
})
export class EmployeePickerModalComponent {
  readonly ref = inject(PeraModalRef) as PeraModalRef<{ employeeId: string } | undefined>;
  readonly data = inject(PERA_MODAL_DATA) as EmployeePickerData;
  private readonly directory = inject(EmployeeService);

  readonly options = signal<SelectOption[]>([]);
  readonly selected = signal<string | null>(null);

  constructor() {
    this.directory
      .listPaged({ page: 1, pageSize: 500, isActive: true })
      .pipe(catchError(() => of(null)))
      .subscribe((paged) => {
        const restrict = this.data.restrictToIds;
        const items = (paged?.items ?? []).filter((e) => !restrict || restrict.includes(e.id));
        this.options.set(items.map((e) => ({ value: e.id, label: e.fullName })));
      });
  }
}

export interface NewTeamModalData {
  projectId: string;
}

/** New stage team — CreateProjectStageTeamRequest { projectStageId, departmentId } per api-docs/08. */
@Component({
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [
    FormsModule,
    PeraModalComponent,
    PeraModalFooterDirective,
    PeraFormFieldComponent,
    PeraSelectComponent,
    PeraButtonComponent,
  ],
  template: `
    <pera-modal title="New stage team" size="sm">
      <div class="flex flex-col gap-3">
        <pera-form-field label="Stage" [required]="true">
          <pera-select
            [options]="stageOptions()"
            [ngModel]="stageId()"
            (ngModelChange)="stageId.set($event)"
            placeholder="Select a stage"
          />
        </pera-form-field>
        <pera-form-field
          label="Department"
          [required]="true"
          hint="The department head becomes the team head."
        >
          <pera-select
            [options]="departmentOptions()"
            [ngModel]="departmentId()"
            (ngModelChange)="departmentId.set($event)"
            placeholder="Select a department"
          />
        </pera-form-field>
        @if (errorMessage()) {
          <p class="m-0 fs-caption text-danger">{{ errorMessage() }}</p>
        }
      </div>
      <div peraModalFooter class="flex gap-2">
        <pera-button variant="ghost" (click)="ref.close(false)">Cancel</pera-button>
        <pera-button
          variant="primary"
          [disabled]="!stageId() || !departmentId()"
          [loading]="submitting()"
          (click)="submit()"
        >
          Create team
        </pera-button>
      </div>
    </pera-modal>
  `,
})
export class NewTeamModalComponent {
  readonly ref = inject(PeraModalRef) as PeraModalRef<boolean>;
  readonly data = inject(PERA_MODAL_DATA) as NewTeamModalData;
  private readonly teamsApi = inject(StageTeamsService);
  private readonly stagesApi = inject(ProjectStageService);
  private readonly departmentsApi = inject(DepartmentService);
  private readonly errors = inject(ErrorHandlerService);

  readonly stageOptions = signal<SelectOption[]>([]);
  readonly departmentOptions = signal<SelectOption[]>([]);
  readonly stageId = signal<string | null>(null);
  readonly departmentId = signal<string | null>(null);
  readonly submitting = signal(false);
  readonly errorMessage = signal('');

  constructor() {
    this.stagesApi
      .getByProject(this.data.projectId)
      .pipe(catchError(() => of([])))
      .subscribe((stages) =>
        this.stageOptions.set(stages.map((s) => ({ value: s.id, label: s.name }))),
      );
    this.departmentsApi
      .getAll()
      .pipe(catchError(() => of([])))
      .subscribe((departments) =>
        this.departmentOptions.set(departments.map((d) => ({ value: d.id, label: d.name }))),
      );
  }

  submit(): void {
    const stageId = this.stageId();
    const departmentId = this.departmentId();
    if (!stageId || !departmentId || this.submitting()) return;
    this.submitting.set(true);
    this.errorMessage.set('');
    this.teamsApi.create(this.data.projectId, stageId, departmentId).subscribe({
      next: () => this.ref.close(true),
      error: (err: HttpErrorResponse) => {
        this.submitting.set(false);
        // stage_teams.DuplicateDepartmentTeam / DepartmentHasNoHead per api-docs/08.
        this.errorMessage.set(friendly(this.errors.parse(err)));
      },
    });
  }
}

const NEW_TEAM_TAB = '__new__';

/**
 * Per-project stage teams panel — `/api/stage-teams` per
 * api-docs/08-stage-templates-teams-gates.md. One tab per team plus a
 * "+ New team" tab; mutations gated by Projects.ManageStageTeams.
 */
@Component({
  selector: 'app-project-teams',
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [
    CanDirective,
    PeraAvatarComponent,
    PeraEmptyComponent,
    PeraSkeletonComponent,
    PeraTabsComponent,
    PeraButtonComponent,
    PeraAlertComponent,
  ],
  template: `
    @if (loading()) {
      <pera-skeleton [height]="240" rounded="md" />
    } @else if (loadError() === 'notFound') {
      <pera-empty
        data-not-found
        [title]="catalog.t('pm.notFound')"
        [description]="catalog.t('pm.notFoundBody')"
        iconName="search"
      />
    } @else if (loadError() === 'error') {
      <pera-alert tone="danger" data-load-error>
        {{ catalog.t('pteam.loadFailed') }}
        <pera-button variant="ghost" size="sm" (click)="reload()">{{
          catalog.t('pm.retry')
        }}</pera-button>
      </pera-alert>
    } @else if (teams().length === 0) {
      <pera-empty
        title="No stage teams yet"
        description="Create a team to assign a department to a stage."
      />
      <div class="mt-3 text-center">
        @if (teamCan('team.create')) {
          <pera-button variant="primary" iconStart="plus" (click)="openNewTeam()"
            >New team</pera-button
          >
        }
      </div>
    } @else {
      <pera-tabs
        [tabs]="tabDefs()"
        [activeId]="activeTeamId()"
        (activeChange)="onTabChange($event)"
      />
      @if (activeTeam(); as team) {
        <div class="mt-4 flex flex-col gap-3">
          <!-- Head row -->
          <div class="flex items-center gap-2.5 px-4 py-3 border border-border bg-surface">
            <pera-avatar [name]="team.headName" size="md" />
            <div class="flex-1 min-w-0">
              <div class="fs-body-sm font-medium truncate">{{ team.headName }}</div>
              <div class="font-mono fs-micro uppercase tracking-[0.02em] text-text-muted">
                Team head · {{ team.departmentName }}
              </div>
            </div>
            @if (teamCan('team.head')) {
              <button
                type="button"
                (click)="changeHead(team)"
                class="px-2.5 py-1.5 border border-border bg-bg font-mono fs-label uppercase cursor-pointer hover:bg-surface-muted transition-colors"
              >
                Change head
              </button>
            }
          </div>
          <!-- Members -->
          <div class="border border-border bg-surface">
            <div class="px-4 py-3 border-b border-border flex items-center justify-between">
              <div class="flex items-baseline gap-2.5">
                <h3 class="m-0 fs-body font-semibold">Members</h3>
                <span class="font-mono fs-label text-text-muted">{{ team.memberCount }}</span>
              </div>
              @if (teamCan('team.addMember')) {
                <button
                  type="button"
                  (click)="addMember(team)"
                  class="inline-flex items-center gap-1 px-2 py-1 border border-border bg-bg font-mono fs-label uppercase cursor-pointer hover:bg-surface-muted transition-colors"
                >
                  <svg
                    width="10"
                    height="10"
                    viewBox="0 0 24 24"
                    fill="none"
                    stroke="currentColor"
                    stroke-width="2"
                  >
                    <path d="M12 5v14M5 12h14" />
                  </svg>
                  Add member
                </button>
              }
            </div>
            @for (member of team.members; track member.id) {
              <div
                class="group flex items-center gap-2.5 px-4 py-2 border-b border-border-soft last:border-b-0"
              >
                <pera-avatar [name]="member.employeeName" size="sm" />
                <div class="flex-1 min-w-0">
                  <div class="fs-caption truncate">
                    {{ member.employeeName }}
                    @if (member.isHead) {
                      <span
                        class="ms-1 inline-flex items-center font-mono fs-micro px-1.5 py-0.5 border border-accent bg-accent-soft text-accent"
                        >HEAD</span
                      >
                    }
                  </div>
                </div>
                @if (teamCan('team.removeMember') || teamCan('team.role')) {
                  <button
                    type="button"
                    class="border border-border bg-bg px-2 py-1 font-mono fs-label uppercase text-text-secondary cursor-pointer hover:bg-surface-muted transition-colors"
                    (click)="editRole(member)"
                  >
                    {{ member.role || 'Member' }}
                  </button>
                  @if (!member.isHead) {
                    <button
                      type="button"
                      class="opacity-0 group-hover:opacity-100 font-mono fs-micro uppercase text-text-muted hover:text-danger transition-opacity"
                      (click)="removeMember(team, member.id, member.employeeName)"
                    >
                      Remove
                    </button>
                  }
                }
              </div>
            } @empty {
              <p class="m-0 px-4 py-3 fs-caption text-text-muted">
                No members yet. Add employees from the team's department.
              </p>
            }
          </div>
        </div>
      }
    }
  `,
})
export class ProjectTeamsComponent {
  readonly projectId = input.required<string>();
  private readonly access = inject(ProjectAccessStore);

  /**
   * crmp P-7: team writes need `stage_teams.manage` AND the Manager level AND an open project
   * (contract §2.17.2, #138-140); the `teams.*` refusals arrive as catalog messages.
   */
  teamCan(action: ProjectAction): boolean {
    return this.access.can(this.projectId(), action);
  }

  private readonly api = inject(StageTeamsService);
  private readonly errors = inject(ErrorHandlerService);
  private readonly toast = inject(ToastService);
  private readonly modal = inject(ModalService);
  private readonly confirm = inject(ConfirmService);
  private readonly destroyRef = inject(DestroyRef);

  private readonly directory = inject(EmployeeService);
  private readonly departmentsApi = inject(DepartmentService);

  readonly manageStageTeams = PERM.stageTeams.manage;

  readonly loading = signal(true);
  /** Review B6 (CP-7): the list read's failure — 404 (unknown/out-of-scope project) or anything else. */
  readonly loadError = signal<'error' | 'notFound' | null>(null);
  protected readonly catalog = inject(CatalogService);
  readonly teams = signal<StageTeam[]>([]);
  readonly activeTeamId = signal<string>('');

  readonly activeTeam = computed<StageTeam | null>(
    () => this.teams().find((t) => t.id === this.activeTeamId()) ?? null,
  );

  readonly tabDefs = computed<TabDef[]>(() => [
    ...this.teams().map((t) => ({ id: t.id, label: `${t.departmentName} (${t.memberCount})` })),
    ...(this.teamCan('team.create')
      ? [{ id: NEW_TEAM_TAB, label: '+ New team', capability: this.manageStageTeams }]
      : []),
  ]);

  constructor() {
    effect(() => {
      const id = this.projectId();
      if (!id) return;
      this.access.ensure(id);
      this.load(id);
    });
  }

  private load(id: string): void {
    this.loading.set(true);
    this.loadError.set(null);
    forkJoin({
      teams: this.api.getByProject(id).pipe(
        catchError((err: unknown) => {
          this.loadError.set(
            err instanceof HttpErrorResponse && err.status === 404 ? 'notFound' : 'error',
          );
          return of([] as StageTeam[]);
        }),
      ),
      employees: this.directory
        .listPaged({ page: 1, pageSize: 500 })
        .pipe(catchError(() => of({ items: [] }))),
      departments: this.departmentsApi.getAll().pipe(catchError(() => of([]))),
    })
      .pipe(takeUntilDestroyed(this.destroyRef))
      .subscribe(({ teams, employees, departments }) => {
        const empById = new Map<string, string>(
          (employees.items ?? []).map((e) => [e.id, e.fullName]),
        );
        const deptById = new Map<string, string>((departments ?? []).map((d) => [d.id, d.name]));
        const enriched: StageTeam[] = teams.map((t) => ({
          ...t,
          departmentName: t.departmentName || deptById.get(t.departmentId) || t.departmentId,
          headName: t.headName || empById.get(t.headId) || '—',
          memberCount: t.memberCount || t.members.length,
          members: t.members.map((m) => ({
            ...m,
            employeeName: m.employeeName || empById.get(m.employeeId) || m.employeeId,
            isHead: m.isHead || m.employeeId === t.headId,
          })),
        }));
        this.teams.set(enriched);
        if (!enriched.some((t) => t.id === this.activeTeamId())) {
          this.activeTeamId.set(enriched[0]?.id ?? '');
        }
        this.loading.set(false);
      });
  }

  reload(): void {
    this.load(this.projectId());
  }

  onTabChange(id: string): void {
    if (id === NEW_TEAM_TAB) {
      void this.openNewTeam();
      return;
    }
    this.activeTeamId.set(id);
  }

  async openNewTeam(): Promise<void> {
    const created = await this.modal
      .open<boolean>(NewTeamModalComponent, {
        size: 'sm',
        data: { projectId: this.projectId() } satisfies NewTeamModalData,
      })
      .afterClosed();
    if (created) this.reload();
  }

  async changeHead(team: StageTeam): Promise<void> {
    const result = await this.modal
      .open<{ employeeId: string }>(EmployeePickerModalComponent, {
        size: 'sm',
        data: {
          title: `Change head of ${team.departmentName} team`,
          confirmLabel: 'Set as head',
          restrictToIds: team.members.map((m) => m.employeeId),
        } satisfies EmployeePickerData,
      })
      .afterClosed();
    if (!result) return;
    this.api.changeHead(this.projectId(), team.id, result.employeeId).subscribe({
      next: () => this.reload(),
      error: (err: HttpErrorResponse) => {
        // stage_teams.HeadRequired / NotAuthorizedToManage per api-docs/08.
        this.toast.show({ tone: 'danger', message: friendly(this.errors.parse(err)) });
      },
    });
  }

  /** Add member — the DMS Forms team-member dialog, with this stage team preselected. */
  async addMember(team: StageTeam): Promise<void> {
    const data: MemberFormDialogData = {
      mode: 'create',
      projectId: this.projectId(),
      stageTeamId: team.id,
    };
    const added = await this.modal
      .open<boolean>(MemberFormDialogComponent, { size: 'lg', data })
      .afterClosed();
    if (added) this.reload();
  }

  /** Change role — same dialog seeded from the member (PUT …/members/{id}/role). */
  async editRole(member: { id: string; role: string | null }): Promise<void> {
    const data: MemberFormDialogData = {
      mode: 'edit',
      projectId: this.projectId(),
      memberId: member.id,
      initial: { role: member.role || 'Member' },
    };
    const saved = await this.modal
      .open<boolean>(MemberFormDialogComponent, { size: 'lg', data })
      .afterClosed();
    if (saved) this.reload();
  }

  async removeMember(team: StageTeam, memberId: string, name: string): Promise<void> {
    const ok = await this.confirm.open({
      title: 'Remove member',
      body: `Remove ${name} from the ${team.departmentName} team?`,
      confirmLabel: 'Remove',
      tone: 'danger',
    });
    if (!ok) return;
    this.api.removeMember(this.projectId(), memberId).subscribe({
      next: () => this.reload(),
      error: (err: HttpErrorResponse) =>
        this.toast.show({ tone: 'danger', message: friendly(this.errors.parse(err)) }),
    });
  }
}
