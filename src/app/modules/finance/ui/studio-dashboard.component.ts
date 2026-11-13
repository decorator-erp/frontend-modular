import { ChangeDetectionStrategy, Component } from '@angular/core';
import { RouterLink } from '@angular/router';
import { CanDirective, PERM } from '@platform/permissions';
import { PeraButtonComponent, PeraCardComponent, PeraPageHeaderComponent } from '@ds';

/**
 * `/finance` — studio-wide finance landing.
 *
 * `api-docs/11-finance.md` does not expose a portfolio-aggregating endpoint;
 * every quantitative view is per-project. This page therefore acts as the
 * Finance hub: it points the user at the project picker (where the per-
 * project dashboard lives at `/finance/projects/:projectId`) and the
 * org-wide cost-categories catalog.
 *
 * Future portfolio rollup (sums across projects, KPIs at studio level) would
 * land here when the backend grows the matching endpoint — until then,
 * surfacing fake numbers would actively mislead.
 */
@Component({
  selector: 'app-finance-studio-dashboard',
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [
    RouterLink,
    CanDirective,
    PeraPageHeaderComponent,
    PeraCardComponent,
    PeraButtonComponent,
  ],
  host: { class: 'block bg-bg min-h-full' },
  template: `
    <pera-page-header title="Finance">
      <pera-button
        actions
        variant="secondary"
        size="sm"
        routerLink="/finance/cost-categories"
        *peraCan="cap.read"
      >
        Cost categories
      </pera-button>
    </pera-page-header>

    <div class="px-8 py-7 grid grid-cols-1 lg:grid-cols-2 gap-5 max-w-5xl">
      <pera-card padding="none" class="flex flex-col h-full">
        <div class="flex items-center gap-2.5 px-5 py-3 border-b border-border">
          <h3 class="font-medium text-sm text-text-primary truncate">Per-project finance</h3>
        </div>
        <div class="flex-1 min-h-0">
          <div
            class="px-5 py-5 text-text-secondary leading-relaxed"
            [style.fontSize]="'var(--fs-body)'"
          >
            The Financial API is per-project: KPIs, stage funding, budget lines, invoices,
            variations and BOQ snapshots are all scoped to one project and one currency. Open a
            project to see its financial picture.
          </div>
        </div>
        <div
          class="px-5 py-2.5 border-t border-border flex justify-between items-center font-mono text-xs text-text-muted"
        >
          <a routerLink="/projects" class="text-text-primary hover:underline">
            Open the projects list →
          </a>
        </div>
      </pera-card>

      <pera-card padding="none" class="flex flex-col h-full" *peraCan="cap.read">
        <div class="flex items-center gap-2.5 px-5 py-3 border-b border-border">
          <h3 class="font-medium text-sm text-text-primary truncate">Cost categories catalog</h3>
        </div>
        <div class="flex-1 min-h-0">
          <div
            class="px-5 py-5 text-text-secondary leading-relaxed"
            [style.fontSize]="'var(--fs-body)'"
          >
            The org-wide catalog of cost categories that all projects' budget lines hang off. Manage
            it once here — the codes propagate to every project's budget editor.
          </div>
        </div>
        <div
          class="px-5 py-2.5 border-t border-border flex justify-between items-center font-mono text-xs text-text-muted"
        >
          <a routerLink="/finance/cost-categories" class="text-text-primary hover:underline">
            Open the catalog →
          </a>
        </div>
      </pera-card>

      <pera-card padding="none" class="flex flex-col h-full">
        <div class="flex items-center gap-2.5 px-5 py-3 border-b border-border">
          <h3 class="font-medium text-sm text-text-primary truncate">Money in this app</h3>
        </div>
        <div class="flex-1 min-h-0">
          <div
            class="px-5 py-5 text-text-secondary leading-relaxed"
            [style.fontSize]="'var(--fs-body)'"
          >
            Every amount is a <code class="font-mono">decimal(19,4)</code> string end-to-end and is
            formatted by <code class="font-mono">MoneyService</code> in the project's currency.
            Ledger is append-only — corrections post a reversal entry. See
            <code class="font-mono">api-docs/11-finance.md</code>
            for the full contract.
          </div>
        </div>
      </pera-card>
    </div>
  `,
})
export class FinanceStudioDashboardComponent {
  protected readonly cap = PERM.finance;
}
