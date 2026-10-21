import { Injectable, signal } from '@angular/core';

/**
 * Per-project currency context. The project shell calls `set()` on
 * `ProjectDetails` load so every Finance component (ledger, invoices,
 * variations, BOQ, dashboard cards) formats money in the project's currency
 * instead of hard-coding `EGP`.
 *
 * The current value is exposed as a signal so component templates and reactive
 * effects pick up changes automatically when the user navigates between
 * projects in different currencies.
 *
 * Default: `EGP` (the studio's home currency) — used outside a project
 * sub-tree (e.g. on `/finance` portfolio dashboards).
 */
@Injectable({ providedIn: 'root' })
export class CurrencyContextService {
  private readonly DEFAULT = 'EGP';
  private readonly _currency = signal<string>(this.DEFAULT);

  /** Current ISO 4217 currency code (e.g. `EGP`, `AED`, `USD`). */
  readonly currency = this._currency.asReadonly();

  /** Set the currency for the current project sub-tree. */
  set(currency: string | null | undefined): void {
    const code = (currency ?? '').trim().toUpperCase();
    this._currency.set(code || this.DEFAULT);
  }

  /** Reset to the studio default (call on project sub-tree exit). */
  reset(): void {
    this._currency.set(this.DEFAULT);
  }
}
