import {
  ChangeDetectionStrategy,
  Component,
  OnInit,
  computed,
  inject,
  input,
  signal,
} from '@angular/core';
import { HttpErrorResponse } from '@angular/common/http';
import { FormsModule } from '@angular/forms';
import { RouterLink } from '@angular/router';
import { Observable, forkJoin, of } from 'rxjs';
import { catchError, map, switchMap } from 'rxjs/operators';
import {
  ConfirmService,
  ModalService,
  PeraButtonComponent,
  PeraEmptyComponent,
  PeraSelectComponent,
  PeraSkeletonComponent,
  SelectOption,
} from '@ds';
import { DepartmentService } from '@modules/people';
import { ToastService } from '@platform/feedback/toast.service';
import { ErrorHandlerService, friendly } from '@platform/http/error-handler.service';
import { CatalogService } from '@platform/i18n/catalog.service';
import type { CatalogKey } from '@platform/i18n/catalog/en';
import { CanDirective, PERM, PermissionsService } from '@platform/permissions';
import { StageTemplateStructureService } from '../../data/stage-template-structure.service';
import { StageTemplatesService } from '../../data/stage-templates.service';
import type {
  StageTemplateRef,
  TemplateStage,
  TemplateStageTask,
  TemplateSubTask,
} from '../../model/stage-template.model';
import {
  TemplateStructureDialogComponent,
  TemplateStructureDialogData,
} from './template-structure-dialog.component';

/** One stage with everything under it. */
export interface StageNode {
  stage: TemplateStage;
  tasks: { task: TemplateStageTask; subTasks: TemplateSubTask[] }[];
  departmentIds: string[];
}

const byOrder = <T extends { order: number }>(a: T, b: T) => a.order - b.order;

/**
 * Sync F1: the stage template structure editor, `/library/stage-templates/:id`. The stages in
 * order; under each its tasks (with their sub-tasks) and the departments it is linked to. Every
 * write (dms TemplateEndpoints.cs:66-192) needs `stages.manage`; without it the page is read-only.
 */
@Component({
  selector: 'app-stage-template-detail',
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [
    CanDirective,
    FormsModule,
    PeraButtonComponent,
    PeraEmptyComponent,
    PeraSelectComponent,
    PeraSkeletonComponent,
    RouterLink,
  ],
  template: `
    <div class="bg-bg min-h-full">
      <header class="px-7 pt-5 pb-3.5 border-b border-border bg-surface flex items-start gap-4">
        <div class="flex-1 min-w-0">
          <a
            routerLink="/library/stage-templates"
            class="font-mono fs-label text-accent hover:underline"
            data-back
            >← {{ t('tplx.back') }}</a
          >
          <h1 class="m-0 mt-1.5 fs-h2 font-semibold tracking-tight leading-tight" data-title>
            {{ template()?.name ?? '' }}
          </h1>
          @if (template()?.description) {
            <p class="m-0 mt-1 fs-caption text-text-secondary">{{ template()?.description }}</p>
          }
        </div>
        @if (template()) {
          <pera-button *peraCan="perm" variant="primary" (click)="openStage()" data-add-stage>{{
            t('tplx.addStage')
          }}</pera-button>
        }
      </header>

      @if (loading()) {
        <div class="p-6"><pera-skeleton [height]="360" rounded="md" /></div>
      } @else if (failed()) {
        <div class="p-6 flex flex-col items-start gap-3" data-load-failed>
          <p class="m-0 fs-caption text-danger">{{ t('tplx.loadFailed') }}</p>
          <pera-button variant="secondary" (click)="load()">{{ t('tplx.retry') }}</pera-button>
        </div>
      } @else if (!nodes().length) {
        <pera-empty [title]="t('tplx.noStages')" [description]="t('tplx.noStagesBody')" />
      } @else {
        <div class="p-6 flex flex-col gap-4" data-stages>
          @for (n of nodes(); track n.stage.id) {
            <section
              class="border border-border bg-surface rounded-card"
              [attr.data-stage]="n.stage.id"
            >
              <header class="px-4 py-3 border-b border-border flex items-start gap-3">
                <span class="font-mono fs-label text-text-muted pt-0.5">{{
                  t('tplx.order', { n: n.stage.order })
                }}</span>
                <div class="flex-1 min-w-0">
                  <h2 class="m-0 fs-body font-semibold">{{ n.stage.name }}</h2>
                  @if (n.stage.description) {
                    <p class="m-0 mt-0.5 fs-caption text-text-secondary">
                      {{ n.stage.description }}
                    </p>
                  }
                  <div class="font-mono fs-micro text-text-muted mt-1 flex gap-2.5 flex-wrap">
                    <span>{{ t('tplx.weightPercent', { n: n.stage.weightPercent }) }}</span>
                    @if (n.stage.defaultFee !== null) {
                      <span>{{ t('tplx.fee', { n: n.stage.defaultFee }) }}</span>
                    }
                  </div>
                </div>
                <div class="flex gap-2 shrink-0" *peraCan="perm">
                  <button
                    type="button"
                    class="font-mono fs-label text-accent hover:underline cursor-pointer"
                    (click)="openStage(n.stage)"
                    data-edit-stage
                  >
                    {{ t('tplx.edit') }}
                  </button>
                  <button
                    type="button"
                    class="font-mono fs-label text-danger hover:underline cursor-pointer"
                    (click)="removeStage(n.stage)"
                    data-delete-stage
                  >
                    {{ t('tplx.delete') }}
                  </button>
                </div>
              </header>

              <div class="flex flex-col">
                <!-- tasks -->
                <div class="px-4 py-3">
                  <div class="flex items-center justify-between mb-2">
                    <h3 class="m-0 font-mono fs-micro uppercase tracking-[0.06em] text-text-muted">
                      {{ t('tplx.tasks') }}
                    </h3>
                    <button
                      *peraCan="perm"
                      type="button"
                      class="font-mono fs-label text-accent hover:underline cursor-pointer"
                      (click)="openTask(n)"
                      data-add-task
                    >
                      + {{ t('tplx.addTask') }}
                    </button>
                  </div>
                  @if (!n.tasks.length) {
                    <p class="m-0 fs-caption text-text-muted">{{ t('tplx.noTasks') }}</p>
                  }
                  <ul class="m-0 p-0 list-none flex flex-col gap-2">
                    @for (k of n.tasks; track k.task.id) {
                      <li class="border border-border-soft bg-bg" [attr.data-task]="k.task.id">
                        <div class="px-3 py-2 flex items-start gap-2.5">
                          <span class="font-mono fs-micro text-text-muted pt-0.5">{{
                            t('tplx.order', { n: k.task.order })
                          }}</span>
                          <div class="flex-1 min-w-0">
                            <div class="fs-caption font-medium">{{ k.task.name }}</div>
                            <div
                              class="font-mono fs-micro text-text-muted mt-0.5 flex gap-2 flex-wrap"
                            >
                              <span>{{ t('tplx.weight', { n: k.task.weight }) }}</span>
                              @if (k.task.departmentId) {
                                <span>· {{ departmentName(k.task.departmentId) }}</span>
                              }
                            </div>
                          </div>
                          <div class="flex gap-2 shrink-0" *peraCan="perm">
                            <button
                              type="button"
                              class="font-mono fs-micro text-accent hover:underline cursor-pointer"
                              (click)="openSubTask(k)"
                              data-add-sub
                            >
                              + {{ t('tplx.addSubTask') }}
                            </button>
                            <button
                              type="button"
                              class="font-mono fs-micro text-accent hover:underline cursor-pointer"
                              (click)="openTask(n, k.task)"
                              data-edit-task
                            >
                              {{ t('tplx.edit') }}
                            </button>
                            <button
                              type="button"
                              class="font-mono fs-micro text-danger hover:underline cursor-pointer"
                              (click)="removeTask(k.task)"
                              data-delete-task
                            >
                              {{ t('tplx.delete') }}
                            </button>
                          </div>
                        </div>
                        @if (k.subTasks.length) {
                          <ul class="m-0 ps-9 pe-3 pb-2 list-none flex flex-col gap-1">
                            @for (x of k.subTasks; track x.id) {
                              <li class="flex items-center gap-2 fs-caption" [attr.data-sub]="x.id">
                                <span class="flex-1 min-w-0 truncate">{{ x.title }}</span>
                                <span class="font-mono fs-micro text-text-muted">{{
                                  t(x.isRequired ? 'tplx.required' : 'tplx.optional')
                                }}</span>
                                <span class="flex gap-2" *peraCan="perm">
                                  <button
                                    type="button"
                                    class="font-mono fs-micro text-accent hover:underline cursor-pointer"
                                    (click)="openSubTask(k, x)"
                                    data-edit-sub
                                  >
                                    {{ t('tplx.edit') }}
                                  </button>
                                  <button
                                    type="button"
                                    class="font-mono fs-micro text-danger hover:underline cursor-pointer"
                                    (click)="removeSubTask(x)"
                                    data-delete-sub
                                  >
                                    {{ t('tplx.delete') }}
                                  </button>
                                </span>
                              </li>
                            }
                          </ul>
                        }
                      </li>
                    }
                  </ul>
                </div>

                <!-- departments -->
                <aside class="px-4 py-3 border-t border-border">
                  <h3
                    class="m-0 mb-2 font-mono fs-micro uppercase tracking-[0.06em] text-text-muted"
                  >
                    {{ t('tplx.departments') }}
                  </h3>
                  @if (!n.departmentIds.length) {
                    <p class="m-0 fs-caption text-text-muted">{{ t('tplx.noDepartments') }}</p>
                  }
                  <div class="flex flex-wrap gap-1.5" data-departments>
                    @for (d of n.departmentIds; track d) {
                      <span
                        class="inline-flex items-center gap-1.5 fs-caption px-2 py-0.5 border border-border bg-bg"
                        [attr.data-department]="d"
                      >
                        {{ departmentName(d) }}
                        <button
                          *peraCan="perm"
                          type="button"
                          class="text-text-muted hover:text-danger cursor-pointer"
                          [attr.aria-label]="t('tplx.unlink', { name: departmentName(d) })"
                          (click)="unlinkDepartment(n.stage.id, d)"
                          data-unlink
                        >
                          ×
                        </button>
                      </span>
                    }
                  </div>
                  <div class="mt-3 flex gap-2 items-end" *peraCan="perm">
                    <div class="flex-1 min-w-0">
                      <pera-select
                        size="sm"
                        [options]="departmentOptions(n)"
                        [placeholder]="t('tplx.pickDepartment')"
                        [ariaLabel]="t('tplx.pickDepartment')"
                        [ngModel]="picked(n.stage.id)"
                        (ngModelChange)="pick(n.stage.id, $event)"
                        data-pick-department
                      />
                    </div>
                    <pera-button
                      size="sm"
                      variant="secondary"
                      [disabled]="!picked(n.stage.id)"
                      (click)="linkDepartment(n.stage.id)"
                      data-link
                      >{{ t('tplx.link') }}</pera-button
                    >
                  </div>
                </aside>
              </div>
            </section>
          }
        </div>
      }
    </div>
  `,
})
export class StageTemplateDetailComponent implements OnInit {
  private readonly perms = inject(PermissionsService);
  private readonly api = inject(StageTemplateStructureService);
  private readonly templates = inject(StageTemplatesService);
  private readonly departmentsApi = inject(DepartmentService);
  private readonly modal = inject(ModalService);
  private readonly confirm = inject(ConfirmService);
  private readonly toast = inject(ToastService);
  private readonly errors = inject(ErrorHandlerService);
  private readonly catalog = inject(CatalogService);

  /** Route param (`withComponentInputBinding`). */
  readonly id = input.required<string>();

  readonly perm = PERM.stages.manage;
  readonly loading = signal(true);
  readonly failed = signal(false);
  readonly template = signal<StageTemplateRef | null>(null);
  readonly nodes = signal<StageNode[]>([]);
  readonly departments = signal<{ id: string; name: string }[]>([]);
  readonly pickedDepartment = signal<Record<string, string>>({});

  private readonly departmentNames = computed(
    () => new Map(this.departments().map((d) => [d.id, d.name])),
  );

  ngOnInit(): void {
    // UI-1: the department picker reads GET /api/departments (departments.read) — no request without it.
    if (this.perms.can(PERM.departments.read))
      this.departmentsApi
        .getAll()
        .pipe(catchError(() => of([])))
        .subscribe((list) => this.departments.set(list.map((d) => ({ id: d.id, name: d.name }))));
    this.load();
  }

  t(key: CatalogKey, params?: Record<string, string | number>): string {
    return this.catalog.t(key, params);
  }

  departmentName(id: string): string {
    return this.departmentNames().get(id) ?? this.t('tplx.unknownDept');
  }

  departmentOptions(n: StageNode): SelectOption[] {
    const linked = new Set(n.departmentIds);
    return this.departments()
      .filter((d) => !linked.has(d.id))
      .map((d) => ({ value: d.id, label: d.name }));
  }

  load(): void {
    this.loading.set(true);
    this.failed.set(false);
    forkJoin({
      template: this.api.getById(this.id()),
      stages: this.templates.stages(this.id()),
    })
      .pipe(
        switchMap(({ template, stages }) => {
          this.template.set(template);
          const sorted = [...stages].sort(byOrder);
          return sorted.length ? forkJoin(sorted.map((s) => this.loadStage(s))) : of([]);
        }),
      )
      .subscribe({
        next: (nodes) => {
          this.nodes.set(nodes);
          this.loading.set(false);
        },
        error: () => {
          this.failed.set(true);
          this.loading.set(false);
        },
      });
  }

  private loadStage(stage: TemplateStage): Observable<StageNode> {
    return forkJoin({
      tasks: this.api.stageTasks(stage.id),
      departmentIds: this.api.stageDepartments(stage.id),
    }).pipe(
      switchMap(({ tasks, departmentIds }) => {
        const sorted = [...tasks].sort(byOrder);
        const withSubs = sorted.length
          ? forkJoin(
              sorted.map((task) =>
                this.api
                  .subTasks(task.id)
                  .pipe(map((subs) => ({ task, subTasks: [...subs].sort(byOrder) }))),
              ),
            )
          : of([]);
        return withSubs.pipe(map((t) => ({ stage, tasks: t, departmentIds })));
      }),
    );
  }

  /** Re-reads one stage after a write under it, keeping the rest of the page as it is. */
  private reloadStage(stageId: string): void {
    const node = this.nodes().find((n) => n.stage.id === stageId);
    if (!node) return this.load();
    this.loadStage(node.stage).subscribe({
      next: (fresh) =>
        this.nodes.update((list) => list.map((n) => (n.stage.id === stageId ? fresh : n))),
      error: () => this.load(),
    });
  }

  private nextOrder(items: readonly { order: number }[]): number {
    return items.reduce((max, i) => Math.max(max, i.order), 0) + 1;
  }

  async openStage(stage?: TemplateStage): Promise<void> {
    const data: TemplateStructureDialogData = {
      kind: 'stage',
      parentId: this.id(),
      item: stage,
      nextOrder: this.nextOrder(this.nodes().map((n) => n.stage)),
    };
    if (await this.openDialog(data)) this.load();
  }

  async openTask(n: StageNode, task?: TemplateStageTask): Promise<void> {
    const data: TemplateStructureDialogData = {
      kind: 'task',
      parentId: n.stage.id,
      item: task,
      nextOrder: this.nextOrder(n.tasks.map((k) => k.task)),
      departments: this.departments(),
    };
    if (await this.openDialog(data)) this.reloadStage(n.stage.id);
  }

  async openSubTask(
    k: { task: TemplateStageTask; subTasks: TemplateSubTask[] },
    sub?: TemplateSubTask,
  ): Promise<void> {
    const data: TemplateStructureDialogData = {
      kind: 'subTask',
      parentId: k.task.id,
      item: sub,
      nextOrder: this.nextOrder(k.subTasks),
    };
    if (await this.openDialog(data)) this.reloadStage(k.task.stageId);
  }

  private async openDialog(data: TemplateStructureDialogData): Promise<boolean> {
    const ref = this.modal.open<boolean>(TemplateStructureDialogComponent, { size: 'md', data });
    const saved = !!(await ref.afterClosed());
    if (saved) this.toast.show({ tone: 'success', message: this.t('tplx.saved') });
    return saved;
  }

  async removeStage(stage: TemplateStage): Promise<void> {
    if (!(await this.ask(stage.name, 'tplx.confirmDeleteStage'))) return;
    this.run(this.api.removeStage(stage.id), 'tplx.deleted', () => this.load());
  }

  async removeTask(task: TemplateStageTask): Promise<void> {
    if (!(await this.ask(task.name, 'tplx.confirmDeleteTask'))) return;
    this.run(this.api.removeStageTask(task.id), 'tplx.deleted', () =>
      this.reloadStage(task.stageId),
    );
  }

  async removeSubTask(sub: TemplateSubTask): Promise<void> {
    if (!(await this.ask(sub.title, 'tplx.confirmDeleteSub'))) return;
    const stageId = this.nodes().find((n) => n.tasks.some((k) => k.task.id === sub.stageTaskId))
      ?.stage.id;
    this.run(this.api.removeSubTask(sub.id), 'tplx.deleted', () =>
      stageId ? this.reloadStage(stageId) : this.load(),
    );
  }

  /** The department picked for a stage, or `''`. */
  picked(stageId: string): string {
    return this.pickedDepartment()[stageId] || '';
  }

  pick(stageId: string, departmentId: string | null): void {
    this.pickedDepartment.update((m) => ({ ...m, [stageId]: departmentId ?? '' }));
  }

  linkDepartment(stageId: string): void {
    const departmentId = this.pickedDepartment()[stageId];
    if (!departmentId) return;
    this.run(this.api.addStageDepartment(stageId, departmentId), 'tplx.linked', () => {
      this.pick(stageId, '');
      this.reloadStage(stageId);
    });
  }

  unlinkDepartment(stageId: string, departmentId: string): void {
    this.run(this.api.removeStageDepartment(stageId, departmentId), 'tplx.unlinked', () =>
      this.reloadStage(stageId),
    );
  }

  private ask(name: string, body: CatalogKey): Promise<boolean> {
    return this.confirm.open({
      title: this.t('tplx.confirmDeleteTitle', { name }),
      body: this.t(body),
      confirmLabel: this.t('tplx.delete'),
      cancelLabel: this.t('tplx.dlg.cancel'),
      tone: 'danger',
    });
  }

  private run(call: Observable<unknown>, success: CatalogKey, after: () => void): void {
    call.subscribe({
      next: () => {
        this.toast.show({ tone: 'success', message: this.t(success) });
        after();
      },
      error: (err: HttpErrorResponse) =>
        this.toast.show({ tone: 'danger', message: friendly(this.errors.parse(err)) }),
    });
  }
}
