import { ChangeDetectionStrategy, Component, computed, input, output } from '@angular/core';
import { CdkDrag, CdkDragDrop, CdkDropList } from '@angular/cdk/drag-drop';
import { ProjectStage, StageKind } from '../../model/project.model';
import { PaletteChip } from './builder.types';

/** Translates prototype .wb-canvas — horizontal node graph, drag to reorder, palette drop creates stages. */
@Component({
  selector: 'app-builder-canvas',
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [CdkDrag, CdkDropList],
  host: { class: 'block relative overflow-auto bg-bg max-lg:min-h-80' },
  template: `
    <div
      class="absolute inset-0 opacity-50 pointer-events-none"
      style="background-image: radial-gradient(var(--color-border) var(--hairline), transparent var(--hairline)); background-size: var(--space-5) var(--space-5);"
    ></div>
    <div class="relative p-5 min-h-full">
      <div
        cdkDropList
        cdkDropListId="workflow-canvas"
        #stageList="cdkDropList"
        [cdkDropListData]="stages()"
        cdkDropListOrientation="horizontal"
        (cdkDropListDropped)="onDrop($event)"
        class="flex items-stretch gap-3 min-h-[var(--h-canvas)]"
      >
        @for (stage of stages(); track stage.id) {
          <div cdkDrag [cdkDragData]="stage">
            <button
              type="button"
              class="relative w-[var(--w-node)] border bg-surface ps-3 pe-3 py-2.5 cursor-grab active:cursor-grabbing
                     border-l-[length:var(--border-accent)] transition-shadow text-start outline-none
                     focus-visible:outline-2 focus-visible:outline-accent focus-visible:outline-offset-1
                     hover:shadow-md"
              [class]="nodeClasses(stage)"
              (click)="select.emit(stage)"
            >
              <div class="flex items-center justify-between">
                <span
                  class="font-mono fs-micro text-text-muted tracking-wide inline-flex items-center gap-1.5 uppercase"
                >
                  @switch (kindOf(stage)) {
                    @case ('Gate') {
                      <span
                        class="w-icon-2xs h-icon-2xs rotate-45 border-[length:var(--hairline-strong)] border-text-secondary"
                      ></span>
                    }
                    @case ('Milestone') {
                      <span
                        class="w-icon-2xs h-icon-2xs rotate-45 bg-text-secondary border-[length:var(--hairline-strong)] border-text-secondary"
                      ></span>
                    }
                    @case ('Approval') {
                      <svg
                        width="9"
                        height="9"
                        viewBox="0 0 24 24"
                        fill="none"
                        stroke="currentColor"
                        stroke-width="2.4"
                      >
                        <path d="M5 12l4 4L19 6" />
                      </svg>
                    }
                    @default {
                      <span
                        class="w-icon-2xs h-icon-2xs border-[length:var(--hairline-strong)] border-text-secondary"
                      ></span>
                    }
                  }
                  {{ kindOf(stage) }}
                </span>
                <span class="w-icon-2xs h-icon-2xs rounded-full" [class]="statusDot(stage)"></span>
              </div>
              <div class="fs-caption font-medium mt-1.5 leading-tight">{{ stage.name }}</div>
              @if (stage.nameAr) {
                <div class="fs-micro text-text-muted mt-0.5" dir="rtl">{{ stage.nameAr }}</div>
              }
              <div
                class="font-mono fs-micro text-text-muted mt-2 flex items-center justify-between uppercase"
              >
                <span>{{ stageOrderLabel(stage) }}</span>
                <span>{{ statusLabel(stage) }}</span>
              </div>
            </button>
          </div>
        }

        <!-- Always-visible add tile -->
        <button
          type="button"
          (click)="addLast.emit()"
          class="w-[var(--w-node)] min-h-[var(--h-chart)] border border-dashed border-text-muted bg-surface/50 hover:border-accent hover:bg-accent-soft
                       text-text-muted hover:text-accent flex items-center justify-center cursor-pointer transition-colors"
        >
          <span
            class="font-mono fs-label uppercase tracking-wider inline-flex items-center gap-1.5"
          >
            <span class="fs-body leading-none">+</span>
            Add stage
          </span>
        </button>
      </div>

      @if (stages().length === 0) {
        <div
          class="mt-6 border border-dashed border-border-strong rounded-md p-10 text-center text-text-muted text-sm flex flex-col items-center gap-3"
        >
          <span>Drag stage types from the palette, or click "Add stage" to begin.</span>
          <button
            type="button"
            (click)="addFirst.emit()"
            class="inline-flex items-center gap-1.5 px-3 py-1.5 bg-accent text-text-on-accent fs-caption font-medium cursor-pointer hover:bg-accent-hover transition-colors"
          >
            + Add first stage
          </button>
        </div>
      }
    </div>
  `,
})
export class BuilderCanvasComponent {
  readonly stages = input<ProjectStage[]>([]);
  readonly selectedId = input<string | null>(null);
  /** CDK drop-list ids that may drop INTO the canvas (e.g. the palette). */
  readonly connectedDropIds = input<string[]>([]);
  readonly reorder = output<{ previousIndex: number; currentIndex: number }>();
  readonly select = output<ProjectStage>();
  readonly addFromPalette = output<{ chip: PaletteChip; index: number }>();
  readonly addFirst = output<void>();
  readonly addLast = output<void>();

  readonly _ = computed(() => this.selectedId());

  kindOf(s: ProjectStage): StageKind {
    return s.kind ?? 'Task';
  }

  stageOrderLabel(s: ProjectStage): string {
    return String(s.order ?? 1).padStart(2, '0');
  }

  statusLabel(s: ProjectStage): string {
    if (s.status === 'Completed') return 'DONE';
    if (s.status === 'Active') return 'CURRENT';
    return 'UPCOMING';
  }

  statusDot(s: ProjectStage): string {
    if (s.status === 'Completed') return 'bg-text-primary';
    if (s.status === 'Active') return 'bg-accent animate-pulse';
    return 'bg-surface border border-text-muted';
  }

  nodeClasses(s: ProjectStage): string {
    const base = ['border-border'];
    if (s.status === 'Completed') base.push('border-l-text-primary');
    else if (s.status === 'Active') base.push('border-l-accent');
    else base.push('border-l-text-muted');
    if (s.id === this.selectedId()) {
      base.push('!border-accent shadow-[0_0_0_3px_var(--accent-soft)]');
    }
    return base.join(' ');
  }

  onDrop(e: CdkDragDrop<any, any, any>) {
    // Drop from palette → create new stage at currentIndex
    if (e.previousContainer !== e.container) {
      const chip = e.item.data as PaletteChip;
      if (chip && 'kind' in chip && 'title' in chip) {
        this.addFromPalette.emit({ chip, index: e.currentIndex });
      }
      return;
    }
    // Reorder within the canvas
    if (e.previousIndex === e.currentIndex) return;
    this.reorder.emit({ previousIndex: e.previousIndex, currentIndex: e.currentIndex });
  }
}
