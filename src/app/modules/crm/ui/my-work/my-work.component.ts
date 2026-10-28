import { ChangeDetectionStrategy, Component, inject } from '@angular/core';
import { CatalogService } from '@platform/i18n/catalog.service';
import { PeraEmptyComponent, PeraPageHeaderComponent } from '@ds';

/**
 * Full-page list of the logged-in employee's assigned gathering tasks (minimal house-styled screen).
 *
 * 009b #N-4: `GET /api/crm/my-gathering-work` has no backend route, so the page renders the
 * not-available state and reads nothing. `CrmMyGatheringWorkService` stays for the 010 dashboard
 * "My gathering tasks" widget port, which will meet the same gap.
 */
@Component({
  selector: 'app-crm-my-work',
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [PeraEmptyComponent, PeraPageHeaderComponent],
  host: { class: 'block' },
  template: `
    <pera-page-header [title]="catalog.t('dash.wTasksTitle')" />
    <div class="p-4 flex flex-col gap-3 max-w-[var(--w-form)]">
      <pera-empty [title]="catalog.t('dash.tasksNotAvailable')" />
    </div>
  `,
})
export class CrmMyWorkComponent {
  protected readonly catalog = inject(CatalogService);
}
