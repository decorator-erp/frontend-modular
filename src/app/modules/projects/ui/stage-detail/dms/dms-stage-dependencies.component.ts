import { ChangeDetectionStrategy, Component, computed, input } from '@angular/core';
import { RouterLink } from '@angular/router';
import { ProjectStage } from '../../../model/project.model';
import { PNL, PNL_H, PNL_H_C, PNL_H_T } from './dms-stage-chrome';
import { DmsStageStatusPillComponent, STAGE_STATUS_LABEL } from './dms-stage-status-pill.component';

interface DepRow {
  id: string;
  code: string;
  name: string;
  status: string;
  /** Human label for the status — kept alongside `status` for callers and tests. */
  label: string;
}

/** Mirrors the backend `StageStatus` enum (Locked · Active · Completed · Rejected). */

/**
 * Stage dependencies rail — the `.dep-*` block from the DMS Stage Detail design.
 * Two groups: **Depends on** (lower-order stages, must complete first) and
 * **Blocks** (higher-order stages, waiting on this one). Each row links to that
 * stage's DMS route.
 *
 * Backend gap: there is **no stage-dependency endpoint**. This is a presentational
 * derivation from the project's stage `order` (the honest approximation — the real
 * gating is gate-driven). See docs/DMS_TASK_DETAIL_BACKEND_GAPS.md.
 */
@Component({
  selector: 'app-dms-stage-dependencies',
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [RouterLink, DmsStageStatusPillComponent],
  template: `
    <div [class]="PNL">
      <div [class]="PNL_H">
        <div [class]="PNL_H_T">
          Dependencies
          <span [class]="PNL_H_C"
            >{{ upstream().length }} upstream · {{ downstream().length }} downstream</span
          >
        </div>
      </div>

      <div class="border-t border-border-soft first-of-type:border-t-0">
        <div
          class="flex items-center gap-2 px-4 pt-2.5 pb-1 fs-label font-semibold uppercase tracking-[0.04em] text-text-muted"
        >
          <span class="flex text-text-muted"
            ><svg
              width="13"
              height="13"
              viewBox="0 0 24 24"
              fill="none"
              stroke="currentColor"
              stroke-width="1.7"
            >
              <path d="M19 12H5M11 18l-6-6 6-6" /></svg
          ></span>
          Depends on<span
            class="ms-auto fs-label font-normal normal-case tracking-normal text-text-muted"
            >must complete first</span
          >
        </div>
        @for (d of upstream(); track d.id) {
          <a
            data-dep-row
            class="flex items-center gap-2.5 px-4 py-2.5 cursor-pointer no-underline text-inherit transition-colors hover:bg-hover"
            [routerLink]="['/projects', projectId(), 'stages', d.id]"
          >
            <span class="fs-label text-text-muted tabular-nums shrink-0 w-12">{{ d.code }}</span>
            <span class="fs-caption font-medium flex-1 min-w-0 truncate">{{ d.name }}</span>
            <app-dms-stage-status-pill [status]="d.status" />
          </a>
        } @empty {
          <div class="px-4 pt-2 pb-3 fs-label text-text-muted">First stage — nothing upstream.</div>
        }
      </div>

      <div class="border-t border-border-soft first-of-type:border-t-0">
        <div
          class="flex items-center gap-2 px-4 pt-2.5 pb-1 fs-label font-semibold uppercase tracking-[0.04em] text-text-muted"
        >
          <span class="flex text-text-muted"
            ><svg
              width="13"
              height="13"
              viewBox="0 0 24 24"
              fill="none"
              stroke="currentColor"
              stroke-width="1.7"
            >
              <path d="M5 12h14M13 6l6 6-6 6" /></svg
          ></span>
          Blocks<span
            class="ms-auto fs-label font-normal normal-case tracking-normal text-text-muted"
            >waiting on this stage</span
          >
        </div>
        @for (d of downstream(); track d.id) {
          <a
            data-dep-row
            class="flex items-center gap-2.5 px-4 py-2.5 cursor-pointer no-underline text-inherit transition-colors hover:bg-hover"
            [routerLink]="['/projects', projectId(), 'stages', d.id]"
          >
            <span class="fs-label text-text-muted tabular-nums shrink-0 w-12">{{ d.code }}</span>
            <span class="fs-caption font-medium flex-1 min-w-0 truncate">{{ d.name }}</span>
            <app-dms-stage-status-pill [status]="d.status" />
          </a>
        } @empty {
          <div class="px-4 pt-2 pb-3 fs-label text-text-muted">
            Final stage — nothing downstream.
          </div>
        }
      </div>
    </div>
  `,
})
export class DmsStageDependenciesComponent {
  protected readonly PNL = PNL;
  protected readonly PNL_H = PNL_H;
  protected readonly PNL_H_T = PNL_H_T;
  protected readonly PNL_H_C = PNL_H_C;

  readonly stages = input.required<ProjectStage[]>();
  readonly currentStageId = input.required<string>();
  readonly projectId = input.required<string>();

  private readonly current = computed(
    () => this.stages().find((s) => s.id === this.currentStageId()) ?? null,
  );

  readonly upstream = computed<DepRow[]>(() =>
    this.derive((s) => s.order < (this.current()?.order ?? 0)),
  );
  readonly downstream = computed<DepRow[]>(() =>
    this.derive((s) => s.order > (this.current()?.order ?? 0)),
  );

  private derive(pred: (s: ProjectStage) => boolean): DepRow[] {
    if (!this.current()) return [];
    return this.stages()
      .filter(pred)
      .sort((a, b) => a.order - b.order)
      .map((s) => {
        return {
          id: s.id,
          code: `Stage ${String(s.order).padStart(2, '0')}`,
          name: s.name,
          status: s.status,
          label: STAGE_STATUS_LABEL[s.status] ?? s.status,
        };
      });
  }
}
