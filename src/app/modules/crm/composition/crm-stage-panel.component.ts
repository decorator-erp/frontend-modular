import {
  ChangeDetectionStrategy,
  Component,
  computed,
  effect,
  inject,
  input,
  signal,
} from '@angular/core';
import { RouterLink } from '@angular/router';
import { EmployeeService } from '@modules/people';
import { CatalogService } from '@platform/i18n/catalog.service';
import type { WorkspaceHost } from '@platform/composition/task-workspace.token';
import { PeraEmptyComponent } from '@ds';
import { CrmPeriodCardComponent } from '../ui/dashboard/period-card.component';
import { BriefStore } from '../stores/brief.store';
import { ItemsStore } from '../stores/items.store';
import { PeriodStore } from '../stores/period.store';

interface EmployeeRollupRow {
  employeeId: string;
  employeeName: string;
  entryCount: number;
  itemCount: number;
}

interface TaskRollupRow {
  taskId: string;
  entryCount: number;
  itemCount: number;
}

/**
 * The CRM stage panel (T091) — registered into `TASK_WORKSPACE` at `stage-main`.
 * Accepts EXACTLY one input, `host`, per the registry contract; fetches everything
 * else from its OWN feature-scoped stores (a panel must not reach into the host's
 * model). Composes the period card (T036, reused as-is), a per-employee gathering
 * rollup attributing work to its author, and a per-task rollup. The linked-meetings
 * card lives at `stage-rail` (`CrmMeetingsRailComponent`) — the two-column host layout
 * gives it its own sidebar slot rather than stacking it under this wide content.
 */
@Component({
  selector: 'app-crm-stage-panel',
  changeDetection: ChangeDetectionStrategy.OnPush,
  providers: [PeriodStore, BriefStore, ItemsStore],
  imports: [RouterLink, PeraEmptyComponent, CrmPeriodCardComponent],
  host: { class: 'flex flex-col gap-3.5' },
  template: `
    <app-crm-period-card />

    <div class="bg-surface border border-border">
      <div class="px-4 py-3 border-b border-border font-semibold fs-body-sm text-text-primary">
        {{ catalog.t('ws.rollupTitle') }}
        <span class="fs-caption text-text-muted font-normal">{{ catalog.t('ws.rollupSub') }}</span>
      </div>
      <div class="p-4">
        @if (employeeRollup().length) {
          <ul class="flex flex-col gap-2">
            @for (row of employeeRollup(); track row.employeeId) {
              <li class="flex items-center justify-between fs-body-sm">
                <span class="text-text-primary">{{ row.employeeName }}</span>
                <span class="fs-caption text-text-muted"
                  >{{ row.entryCount }} {{ catalog.t('ws.briefItems') }} · {{ row.itemCount }}
                  {{ catalog.t('ws.items') }}</span
                >
              </li>
            }
          </ul>
        } @else {
          <pera-empty [title]="catalog.t('ws.rollupTitle')" />
        }
      </div>
    </div>

    <div class="bg-surface border border-border">
      <div class="px-4 py-3 border-b border-border font-semibold fs-body-sm text-text-primary">
        {{ catalog.t('ws.tasksTitle') }}
      </div>
      <div class="p-4">
        @if (taskRollup().length) {
          <ul class="flex flex-col gap-2">
            @for (row of taskRollup(); track row.taskId) {
              <li class="flex items-center justify-between fs-body-sm">
                <a
                  [routerLink]="['/projects', host().projectId, 'tasks', row.taskId]"
                  class="text-accent hover:underline"
                  >{{ catalog.t('ws.taskCol') }}</a
                >
                <span class="fs-caption text-text-muted"
                  >{{ row.entryCount }} {{ catalog.t('ws.briefItems') }} · {{ row.itemCount }}
                  {{ catalog.t('ws.items') }}</span
                >
              </li>
            }
          </ul>
        } @else {
          <pera-empty [title]="catalog.t('ws.tasksTitle')" />
        }
      </div>
    </div>
  `,
})
export class CrmStagePanelComponent {
  private readonly employeesApi = inject(EmployeeService);
  protected readonly catalog = inject(CatalogService);
  protected readonly period = inject(PeriodStore);
  protected readonly brief = inject(BriefStore);
  protected readonly items = inject(ItemsStore);

  readonly host = input.required<WorkspaceHost>();

  private readonly employeeNames = signal<Record<string, string>>({});

  protected readonly employeeRollup = computed<EmployeeRollupRow[]>(() => {
    const counts = new Map<string, { entryCount: number; itemCount: number }>();
    for (const space of this.brief.spaces()) {
      const row = counts.get(space.createdById) ?? { entryCount: 0, itemCount: 0 };
      row.entryCount++;
      counts.set(space.createdById, row);
    }
    for (const item of this.items.items()) {
      const employeeId = item.createdByEmployeeId;
      if (!employeeId) continue; // client-authored — not part of an EMPLOYEE rollup
      const row = counts.get(employeeId) ?? { entryCount: 0, itemCount: 0 };
      row.itemCount++;
      counts.set(employeeId, row);
    }
    const names = this.employeeNames();
    return [...counts.entries()].map(([employeeId, c]) => ({
      employeeId,
      employeeName: names[employeeId] ?? employeeId.slice(0, 8),
      ...c,
    }));
  });

  protected readonly taskRollup = computed<TaskRollupRow[]>(() => {
    const counts = new Map<string, { entryCount: number; itemCount: number }>();
    for (const space of this.brief.spaces()) {
      if (!space.projectTaskId) continue;
      const row = counts.get(space.projectTaskId) ?? { entryCount: 0, itemCount: 0 };
      row.entryCount++;
      counts.set(space.projectTaskId, row);
    }
    for (const item of this.items.items()) {
      if (!item.projectTaskId) continue;
      const row = counts.get(item.projectTaskId) ?? { entryCount: 0, itemCount: 0 };
      row.itemCount++;
      counts.set(item.projectTaskId, row);
    }
    return [...counts.entries()].map(([taskId, c]) => ({ taskId, ...c }));
  });

  constructor() {
    let loaded = false;
    effect(() => {
      const h = this.host();
      if (loaded || !h.projectId) return;
      loaded = true;
      this.period.load(h.projectId);
      this.brief.load(h.projectId);
      this.items.load(h.projectId);
    });

    // Resolve employee display names for whichever authors show up — a small, bounded
    // set per stage, so one-call-per-id is acceptable (no batch endpoint exists).
    effect(() => {
      const ids = new Set<string>();
      for (const space of this.brief.spaces()) ids.add(space.createdById);
      for (const item of this.items.items()) {
        if (item.createdByEmployeeId) ids.add(item.createdByEmployeeId);
      }
      const known = this.employeeNames();
      const missing = [...ids].filter((id) => !(id in known));
      if (!missing.length) return;
      for (const id of missing) {
        this.employeesApi.getFull(id).subscribe((employee) => {
          this.employeeNames.update((names) => ({ ...names, [id]: employee.fullName }));
        });
      }
    });
  }
}
