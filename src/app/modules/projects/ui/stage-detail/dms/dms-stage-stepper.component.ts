import { ChangeDetectionStrategy, Component, computed, inject, input } from '@angular/core';
import { RouterLink } from '@angular/router';
import { LocaleService } from '@platform/i18n';
import { ProjectStage } from '../../../model/project.model';
import { formatShortDate } from '@shared/ui/status';

/**
 * Stage stepper — the horizontal `.stepper` strip from the DMS Stage Detail
 * design. Renders every stage in the workflow with done / current / locked
 * affordances; each step links to its own DMS stage page.
 *
 * **Batch 4b**: owns its own styling (Tailwind + scale tokens) instead of relying
 * on the parent page's unencapsulated `.dms-stage .stepper` rules.
 */
@Component({
  selector: 'app-dms-stage-stepper',
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [RouterLink],
  template: `
    <div class="flex items-stretch border border-border bg-surface overflow-hidden">
      @for (st of steps(); track st.id) {
        <a
          class="relative flex-1 block min-w-0 px-3.5 py-3 border-e border-border last:border-e-0
                 no-underline cursor-pointer transition-colors hover:bg-hover
                 after:absolute after:inset-x-0 after:bottom-0 after:h-0.5"
          [class.bg-accent-soft]="st.current"
          [class.after:bg-accent]="st.current"
          [routerLink]="['/projects', projectId(), 'stages', st.id]"
        >
          <div
            class="flex items-center gap-1.5 fs-micro font-semibold tracking-[0.05em] tabular-nums"
            [class.text-success]="st.done"
            [class.text-accent]="st.current"
            [class.text-text-muted]="!st.done && !st.current"
          >
            <span class="flex">
              @if (st.done) {
                <svg
                  width="11"
                  height="11"
                  viewBox="0 0 24 24"
                  fill="none"
                  stroke="currentColor"
                  stroke-width="2.4"
                >
                  <path d="M5 12l4 4L19 6" />
                </svg>
              } @else if (st.current) {
                <svg
                  width="11"
                  height="11"
                  viewBox="0 0 24 24"
                  fill="none"
                  stroke="currentColor"
                  stroke-width="1.8"
                >
                  <circle cx="12" cy="12" r="9" />
                  <path d="M12 7v5l3 2" />
                </svg>
              } @else if (st.locked) {
                <svg
                  width="11"
                  height="11"
                  viewBox="0 0 24 24"
                  fill="none"
                  stroke="currentColor"
                  stroke-width="1.8"
                >
                  <rect x="5" y="11" width="14" height="9" />
                  <path d="M8 11V8a4 4 0 0 1 8 0v3" />
                </svg>
              } @else {
                <svg
                  width="11"
                  height="11"
                  viewBox="0 0 24 24"
                  fill="none"
                  stroke="currentColor"
                  stroke-width="1.8"
                >
                  <circle cx="12" cy="12" r="9" />
                </svg>
              }</span
            >{{ st.num }}
          </div>
          <div
            class="mt-1.5 truncate fs-caption"
            [class.font-semibold]="st.current"
            [class.font-medium]="!st.current"
            [class.text-text-muted]="st.locked"
            [class.text-text-primary]="!st.locked"
          >
            {{ st.name }}
          </div>
          <div class="mt-0.5 fs-label text-text-muted tabular-nums">{{ st.meta }}</div>
        </a>
      }
    </div>
  `,
})
export class DmsStageStepperComponent {
  readonly stages = input.required<ProjectStage[]>();
  readonly currentStageId = input.required<string>();
  readonly projectId = input.required<string>();

  private readonly locale = inject(LocaleService);

  protected readonly steps = computed(() => {
    const ordered = [...this.stages()].sort((a, b) => a.order - b.order);
    const cur = this.currentStageId();
    return ordered.map((s) => ({
      id: s.id,
      num: String(s.order).padStart(2, '0'),
      name: s.name,
      done: s.status === 'Completed',
      current: s.id === cur,
      locked: s.status === 'Locked',
      meta: this.meta(s),
    }));
  });

  private meta(s: ProjectStage): string {
    switch (s.status) {
      case 'Completed':
        return s.completedOnUtc
          ? `Completed · ${formatShortDate(s.completedOnUtc, this.locale.locale())}`
          : 'Completed';
      case 'Active':
        return `In progress · ${s.progressPercent}%`;
      case 'Rejected':
        return 'Sent back';
      default:
        return 'Locked';
    }
  }
}
