import { ChangeDetectionStrategy, Component, computed, inject, input } from '@angular/core';
import { PeraAlertComponent } from '@ds';
import { CatalogService } from '@platform/i18n/catalog.service';
import type { CatalogKey } from '@platform/i18n/catalog/en';
import type { ProjectStatus } from '../../model/project.model';
import { isProjectClosed } from '../../model/project-actions';

/**
 * crmp P-9: the read-only banner on a closed project's work screens. A project is closed when it is
 * inactive, OnHold, Completed or Cancelled; its work writes answer 409 `projects.Closed` (contract
 * §2.17), so the screens hide them and say why. Renders nothing for an open project.
 */
@Component({
  selector: 'app-project-closed-banner',
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [PeraAlertComponent],
  template: `
    @if (closed()) {
      <pera-alert tone="warning" data-closed-banner>{{ message() }}</pera-alert>
    }
  `,
})
export class ProjectClosedBannerComponent {
  readonly project = input.required<{ status: ProjectStatus; isActive: boolean }>();
  private readonly catalog = inject(CatalogService);

  readonly closed = computed(() => isProjectClosed(this.project()));
  readonly message = computed(() => {
    const p = this.project();
    const status = !p.isActive
      ? this.catalog.t('pm.inactive')
      : this.catalog.t(`projects.status.${p.status}` as CatalogKey);
    return this.catalog.t('pm.closedBanner', { status });
  });
}
