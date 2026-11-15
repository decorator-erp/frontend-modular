import { ChangeDetectionStrategy, Component, input } from '@angular/core';
import { PeraEmptyComponent, PeraPageHeaderComponent } from '@ds';

/**
 * Generic stub used by the Finance feature pages that haven't been built yet
 * (budget editor, ledger, invoices, variations, BOQ). Renders the standard
 * page header for nav consistency and an `Empty state` callout pointing the
 * reviewer at the prompt that scopes the missing work.
 *
 * Each stub route binds `[title]` so the breadcrumb and document title stay
 * accurate while the page is being built out.
 */
@Component({
  selector: 'app-finance-placeholder',
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [PeraPageHeaderComponent, PeraEmptyComponent],
  host: { class: 'block bg-bg min-h-full' },
  template: `
    <pera-page-header [title]="title()"></pera-page-header>
    <div class="px-4 md:px-6 lg:px-8 py-8">
      <pera-empty
        iconName="package"
        [title]="title() + ' — coming next'"
        description="Wiring under FEATURE_PROMPT_FINANCE.md Phase F3. The HTTP service and models are already in place; the UI for this route is the next slice."
      ></pera-empty>
    </div>
  `,
})
export class FinancePlaceholderComponent {
  readonly title = input.required<string>();
}
