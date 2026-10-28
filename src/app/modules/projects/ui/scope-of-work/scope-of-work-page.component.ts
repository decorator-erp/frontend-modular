import { ChangeDetectionStrategy, Component, inject, input } from '@angular/core';
import { PeraPageHeaderComponent } from '@ds';
import { CatalogService } from '@platform/i18n/catalog.service';

/**
 * The project's scope of work (نطاق العمل) — NEW-FEATURE-1, specs/sow-scope-of-work.md.
 * Routed at `projects/:id/scope-of-work` behind `scope.read` (§3). `id` is the route param,
 * bound by `withComponentInputBinding()` (a param, so INHERITED-TRAP-1 does not bite).
 */
@Component({
  selector: 'app-scope-of-work-page',
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [PeraPageHeaderComponent],
  host: { class: 'block' },
  template: ` <pera-page-header [title]="catalog.t('sow.title')" /> `,
})
export class ScopeOfWorkPageComponent {
  protected readonly catalog = inject(CatalogService);

  /** The project id (`:id`). */
  readonly id = input('');
}
