import { ChangeDetectionStrategy, Component, inject } from '@angular/core';
import { CatalogService } from '@platform/i18n/catalog.service';
import { PeraEmptyComponent, PeraPageHeaderComponent } from '@ds';

/**
 * `…/spaces/provisioning` — the buy list.
 *
 * 009b #N-6: `GET …/spaces/provisioning[/summary]` have no backend route (only four space
 * routes exist, `EP/CrmSpaceEndpoints.cs:25-71`), so the page renders the not-available state
 * and reads nothing.
 */
@Component({
  selector: 'app-crm-provisioning-page',
  changeDetection: ChangeDetectionStrategy.OnPush,
  host: { class: 'block bg-bg min-h-full' },
  imports: [PeraEmptyComponent, PeraPageHeaderComponent],
  template: `
    <pera-page-header [title]="catalog.t('space.provTitle')" />

    <div class="p-6 flex flex-col gap-4">
      <pera-empty [title]="catalog.t('space.provNotAvailable')" />
    </div>
  `,
})
export class CrmProvisioningPageComponent {
  protected readonly catalog = inject(CatalogService);
}
