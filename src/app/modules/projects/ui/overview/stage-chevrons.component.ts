import { ChangeDetectionStrategy, Component, computed, input, output } from '@angular/core';
import { ProjectStage } from '../../model/project.model';

/**
 * OS-5 (Ocean Studio): the stage timeline as chevron segments — done, current, upcoming (and
 * rejected). One segment per stage in `order`; each opens its stage. `clip-path` does not mirror,
 * so the arrow shape has its own `rtl:` polygon. Scrolls sideways when the stages do not fit.
 */
@Component({
  selector: 'app-stage-chevrons',
  changeDetection: ChangeDetectionStrategy.OnPush,
  host: { class: 'block' },
  template: `
    <ol class="m-0 p-0 list-none flex overflow-x-auto gap-0.5 pb-1" data-stage-chevrons>
      @for (s of ordered(); track s.id; let first = $first) {
        <li class="flex-1 min-w-[var(--w-column-sm)]">
          <button
            type="button"
            (click)="stageClick.emit(s)"
            [attr.data-chevron]="kind(s)"
            [attr.aria-current]="s.status === 'Active' ? 'step' : null"
            class="w-full h-[var(--space-16)] flex flex-col justify-center text-start cursor-pointer outline-none focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-accent transition-opacity hover:opacity-90"
            [class]="shape(first) + ' ' + tone(s)"
          >
            <span class="fs-label font-bold uppercase tracking-[0.08em] opacity-80 truncate"
              >{{ pad(s.order) }} · {{ sub(s) }}</span
            >
            <span class="fs-body-sm font-extrabold truncate">{{ s.name }}</span>
          </button>
        </li>
      }
    </ol>
  `,
})
export class StageChevronsComponent {
  readonly stages = input<ProjectStage[]>([]);
  readonly stageClick = output<ProjectStage>();

  readonly ordered = computed(() => [...this.stages()].sort((a, b) => a.order - b.order));

  kind(s: ProjectStage): 'done' | 'current' | 'upcoming' | 'rejected' {
    if (s.status === 'Completed') return 'done';
    if (s.status === 'Active') return 'current';
    if (s.status === 'Rejected') return 'rejected';
    return 'upcoming';
  }

  protected tone(s: ProjectStage): string {
    switch (this.kind(s)) {
      case 'done':
        return 'bg-accent-soft text-accent';
      case 'current':
        return 'bg-sidebar text-sidebar-active-text';
      case 'rejected':
        return 'bg-danger-soft text-danger';
      default:
        return 'bg-surface-muted text-text-muted';
    }
  }

  /** The first segment has a flat start edge; the rest are notched. Mirrored under RTL. */
  protected shape(first: boolean): string {
    return first
      ? 'ps-4 pe-6 rounded-s-[var(--radius-control)] [clip-path:polygon(0_0,calc(100%-var(--space-3))_0,100%_50%,calc(100%-var(--space-3))_100%,0_100%)] rtl:[clip-path:polygon(var(--space-3)_0,100%_0,100%_100%,var(--space-3)_100%,0_50%)]'
      : 'ps-7 pe-6 [clip-path:polygon(0_0,calc(100%-var(--space-3))_0,100%_50%,calc(100%-var(--space-3))_100%,0_100%,var(--space-3)_50%)] rtl:[clip-path:polygon(var(--space-3)_0,100%_0,calc(100%-var(--space-3))_50%,100%_100%,var(--space-3)_100%,0_50%)]';
  }

  protected sub(s: ProjectStage): string {
    switch (this.kind(s)) {
      case 'done':
        return 'Done';
      case 'current':
        return `${s.progressPercent}%`;
      case 'rejected':
        return 'Rejected';
      default:
        return 'Upcoming';
    }
  }

  protected pad(n: number): string {
    return String(n).padStart(2, '0');
  }
}
