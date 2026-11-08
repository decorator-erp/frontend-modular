import { ChangeDetectionStrategy, Component, inject, input } from '@angular/core';
import { CatalogService } from '@platform/i18n/catalog.service';
import { formatCairoDate } from '@platform/i18n/intl-locale';
import { PeraEmptyComponent, PeraStatusBadgeComponent } from '@ds';
import type { PortalTask } from '../../../model/portal.model';
import { statusChip } from './portal-format';

/** crmp P2-B: the client's shared tasks (title, stage, status chip, due and done dates in Cairo time). */
@Component({
  selector: 'app-crm-portal-tasks',
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [PeraEmptyComponent, PeraStatusBadgeComponent],
  host: { class: 'block' },
  template: `
    @if (tasks().length) {
      <ul class="flex flex-col gap-2 m-0 p-0 list-none">
        @for (t of tasks(); track t.shareId) {
          <li
            class="flex flex-col gap-1 p-2 border border-border fs-body-sm"
            data-testid="portal-task"
          >
            <div class="flex flex-wrap items-center justify-between gap-2">
              <span class="text-text-primary font-medium" dir="auto">{{ t.title }}</span>
              <pera-status-badge [tone]="chip(t).tone" [label]="chip(t).label" />
            </div>
            @if (t.stageName) {
              <span class="fs-caption text-text-secondary" dir="auto">{{ t.stageName }}</span>
            }
            @if (t.note) {
              <span class="fs-caption text-text-secondary" dir="auto">{{ t.note }}</span>
            }
            <span class="fs-caption text-text-muted">
              @if (t.completedAtUtc) {
                {{ catalog.t('cportal.completedOn', { date: date(t.completedAtUtc) }) }}
              } @else if (t.dueDate) {
                {{ catalog.t('cportal.due', { date: date(t.dueDate) }) }}
              } @else if (t.startedAtUtc) {
                {{ catalog.t('cportal.startedOn', { date: date(t.startedAtUtc) }) }}
              }
            </span>
          </li>
        }
      </ul>
    } @else {
      <pera-empty [title]="catalog.t('cportal.empty.tasks')" />
    }
  `,
})
export class CrmPortalTasksComponent {
  protected readonly catalog = inject(CatalogService);
  readonly tasks = input<PortalTask[]>([]);

  protected chip(task: PortalTask) {
    return statusChip(task.status, this.catalog);
  }

  protected date(iso: string): string {
    return formatCairoDate(iso, this.catalog.locale());
  }
}
