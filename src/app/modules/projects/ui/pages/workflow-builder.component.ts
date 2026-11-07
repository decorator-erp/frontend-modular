import { ProjectAccessStore } from '../../stores/project-access.store';
import {
  ChangeDetectionStrategy,
  Component,
  DestroyRef,
  computed,
  inject,
  signal,
} from '@angular/core';
import { HttpErrorResponse } from '@angular/common/http';
import { takeUntilDestroyed } from '@angular/core/rxjs-interop';
import { ActivatedRoute } from '@angular/router';
import { Project, ProjectStage, StageKind } from '../../model/project.model';
import { ProjectService } from '../../data/project.service';
import { ProjectStageService } from '../../data/project-stage.service';
import { CanDirective } from '@platform/permissions';
import { ConfirmService } from '@ds';
import { ErrorHandlerService, friendly } from '@platform/http/error-handler.service';
import { ToastService } from '@platform/feedback/toast.service';
import { BuilderCanvasComponent } from '../workflow-builder/builder-canvas.component';
import { StagePaletteComponent } from '../workflow-builder/stage-palette.component';
import { StageConfigPanelComponent } from '../workflow-builder/stage-config-panel.component';
import { PaletteChip } from '../workflow-builder/builder.types';

/**
 * Workflow builder — three-pane layout: palette (drag source) · canvas (drop target,
 * sortable) · config panel. Palette drops + manual "Add stage" both persist via
 * the project-stages API. The Kind tag is local-only (no backend field today).
 */
@Component({
  selector: 'app-workflow-builder',
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [BuilderCanvasComponent, StagePaletteComponent, StageConfigPanelComponent, CanDirective],
  host: { class: 'block h-[calc(100vh-3rem)] flex flex-col bg-bg' },
  template: `
    <div class="h-12 border-b border-border flex items-center gap-3.5 px-4 bg-surface">
      <div class="fs-body font-semibold flex items-center gap-2">
        {{ project()?.name ?? 'Workflow' }}
        <span
          class="font-mono fs-label text-accent border border-accent/30 bg-accent-soft px-1.5 py-0.5"
        >
          live · backed by API
        </span>
      </div>
      <span class="font-mono fs-micro text-text-muted uppercase">
        {{ stages().length }} stages · {{ gateCount() }} gates · {{ approvalCount() }} approvals
      </span>
      <div class="flex-1"></div>
      @if (canAddStage()) {
        <button
          type="button"
          class="px-3 py-1.5 fs-label bg-accent text-on-accent border border-accent hover:bg-accent-hover"
          (click)="addLast()"
        >
          + Add stage
        </button>
      }
    </div>
    <div
      class="flex-1 grid min-h-0"
      style="grid-template-columns: var(--w-column-lg) 1fr var(--w-panel);"
    >
      <app-stage-palette [connectedTo]="['workflow-canvas']" />
      <app-builder-canvas
        [stages]="stages()"
        [selectedId]="selectedId()"
        (reorder)="onReorder($event)"
        (select)="onSelect($event)"
        (addFirst)="addLast()"
        (addLast)="addLast()"
        (addFromPalette)="addFromPalette($event)"
      />
      <app-stage-config-panel
        [stage]="selected()"
        [allStages]="stages()"
        (save)="saveStage($event)"
        (changeKind)="changeKind($event.id, $event.kind)"
        (deleteStage)="deleteStage($event.id)"
      />
    </div>
  `,
})
export class WorkflowBuilderComponent {
  private readonly route = inject(ActivatedRoute);
  private readonly projects = inject(ProjectService);
  private readonly stagesApi = inject(ProjectStageService);
  private readonly feedback = inject(ToastService);
  private readonly errors = inject(ErrorHandlerService);
  private readonly confirm = inject(ConfirmService);
  private readonly destroyRef = inject(DestroyRef);

  readonly project = signal<Project | null>(null);
  private readonly access = inject(ProjectAccessStore);
  /** crmp review R2: adding a stage needs stages.manage AND the Manager level AND an open project. */
  readonly canAddStage = computed(() => {
    const id = this.project()?.id;
    return !!id && this.access.can(id, 'stage.create');
  });
  readonly stages = signal<ProjectStage[]>([]);
  readonly selectedId = signal<string | null>(null);

  readonly selected = computed(() => this.stages().find((s) => s.id === this.selectedId()) ?? null);
  readonly gateCount = computed(
    () => this.stages().filter((s) => (s.kind ?? 'Task') === 'Gate').length,
  );
  readonly approvalCount = computed(
    () => this.stages().filter((s) => (s.kind ?? 'Task') === 'Approval').length,
  );
  constructor() {
    const projectId =
      this.route.snapshot.paramMap.get('projectId') ?? this.route.snapshot.paramMap.get('id');
    if (projectId) {
      this.projects
        .getById(projectId)
        .pipe(takeUntilDestroyed(this.destroyRef))
        .subscribe((p) => {
          this.project.set(p);
          if (p) this.access.seed(p);
        });
      this.reloadStages(projectId);
    }
  }

  private reloadStages(projectId: string): void {
    this.stagesApi
      .getByProject(projectId)
      .pipe(takeUntilDestroyed(this.destroyRef))
      .subscribe((list) => {
        this.stages.set(list);
        if (list.length && !list.some((s) => s.id === this.selectedId())) {
          this.selectedId.set(list[0].id);
        }
      });
  }

  onSelect(stage: ProjectStage): void {
    this.selectedId.set(stage.id);
  }

  addLast(): void {
    const project = this.project();
    if (!project) return;
    const nextOrder = (this.stages().reduce((max, s) => Math.max(max, s.order), 0) || 0) + 1;
    const name = `Stage ${nextOrder}`;
    this.stagesApi.create(project.id, { name, order: nextOrder }).subscribe({
      next: (newId) => {
        this.feedback.show({ tone: 'success', message: `Stage "${name}" created` });
        if (typeof newId === 'string') this.selectedId.set(newId);
        this.reloadStages(project.id);
      },
      error: (err: HttpErrorResponse) =>
        this.feedback.show({ tone: 'danger', message: friendly(this.errors.parse(err)) }),
    });
  }

  addFromPalette({ chip, index }: { chip: PaletteChip; index: number }): void {
    const project = this.project();
    if (!project) return;
    // The backend enforces a unique `order` per project and has no batch-reorder
    // endpoint (see onReorder), so we cannot insert mid-list without colliding with
    // an existing order. Append at the end (max order + 1) to guarantee a free slot;
    // the user can reorder locally afterward. `index` is intentionally ignored until
    // a re-numbering endpoint exists.
    const maxOrder = this.stages().reduce((m, s) => Math.max(m, s.order), 0);
    const targetOrder = maxOrder + 1;
    const name = chip.title === 'Task' ? `Stage ${this.stages().length + 1}` : `New ${chip.title}`;
    this.stagesApi.create(project.id, { name, order: targetOrder }).subscribe({
      next: (newId) => {
        this.feedback.show({ tone: 'success', message: `${chip.title} stage added` });
        if (typeof newId === 'string') {
          this.selectedId.set(newId);
          // Tag the new stage with its kind locally (backend has no kind field).
          this.stages.update((list) =>
            list.map((s) => (s.id === newId ? { ...s, kind: chip.kind } : s)),
          );
        }
        this.reloadStages(project.id);
      },
      error: (err: HttpErrorResponse) =>
        this.feedback.show({ tone: 'danger', message: friendly(this.errors.parse(err)) }),
    });
  }

  onReorder({
    previousIndex,
    currentIndex,
  }: {
    previousIndex: number;
    currentIndex: number;
  }): void {
    // Local-only reorder. The backend enforces unique `order` per project so a
    // direct PUT to one stage with a new order collides with an existing one;
    // there is no batch-reorder endpoint today. The user can save individual
    // stages once a re-numbering endpoint exists.
    const list = [...this.stages()];
    const [moved] = list.splice(previousIndex, 1);
    list.splice(currentIndex, 0, moved);
    list.forEach((s, i) => (s.order = i + 1));
    this.stages.set([...list]);
    this.feedback.show({
      tone: 'info',
      message: 'Reordered locally — backend batch-reorder pending',
    });
  }

  saveStage({ id, name, nameAr }: { id: string; name: string; nameAr: string }): void {
    const stage = this.stages().find((s) => s.id === id);
    if (!stage) return;
    this.stagesApi
      .update(stage.projectId, id, {
        name,
        order: stage.order,
        description: stage.description,
        notes: stage.notes,
        estimatedStartDate: stage.estimatedStartDate,
        estimatedEndDate: stage.estimatedEndDate,
      })
      .subscribe({
        next: () => {
          this.feedback.show({ tone: 'success', message: 'Stage saved' });
          this.stages.update((list) => list.map((s) => (s.id === id ? { ...s, name, nameAr } : s)));
        },
        error: (err: HttpErrorResponse) =>
          this.feedback.show({ tone: 'danger', message: friendly(this.errors.parse(err)) }),
      });
  }

  changeKind(id: string, kind: StageKind): void {
    this.stages.update((list) => list.map((s) => (s.id === id ? { ...s, kind } : s)));
  }

  async deleteStage(id: string): Promise<void> {
    const stage = this.stages().find((s) => s.id === id);
    if (!stage) return;
    const ok = await this.confirm.open({
      title: 'Delete stage',
      body: `Delete "${stage.name}" and its tasks? This cannot be undone.`,
      confirmLabel: 'Delete',
      tone: 'danger',
    });
    if (!ok) return;
    // R1-F11: the stage carries its own project id.
    this.stagesApi.remove(stage.projectId, id).subscribe({
      next: () => {
        this.feedback.show({ tone: 'success', message: 'Stage deleted' });
        if (this.selectedId() === id) this.selectedId.set(null);
        const project = this.project();
        if (project) this.reloadStages(project.id);
      },
      error: (err: HttpErrorResponse) =>
        this.feedback.show({ tone: 'danger', message: friendly(this.errors.parse(err)) }),
    });
  }
}
