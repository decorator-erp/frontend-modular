import {
  ChangeDetectionStrategy,
  Component,
  DestroyRef,
  computed,
  effect,
  inject,
  output,
  signal,
} from '@angular/core';
import { CanDirective, PERM } from '@platform/permissions';
import { CatalogService } from '@platform/i18n/catalog.service';
import { formatCairoDateTime } from '@platform/i18n/intl-locale';
import { CLOSED_CHIP } from '../trust/trust-chip';
import {
  ModalService,
  PeraAlertComponent,
  PeraButtonComponent,
  PeraSkeletonComponent,
  PeraStatusBadgeComponent,
} from '@ds';
import { PeriodStore } from '../../stores/period.store';
import { CrmPeriodFormComponent } from './forms/period-form.component';

/**
 * The period card (T036) — status, close date, a **live** countdown (ticks on its own
 * timer; `PeriodStore.daysRemaining` is only a load-time snapshot), Extend + Close.
 * Extend/Open route through `CrmPeriodFormComponent` (T042); Close is direct, matching
 * the prototype (no confirmation step) — the resulting client notification is surfaced
 * as a banner by the parent dashboard (FR-020), via the `closed` output below.
 */
@Component({
  selector: 'app-crm-period-card',
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [
    CanDirective,
    PeraButtonComponent,
    PeraStatusBadgeComponent,
    PeraAlertComponent,
    PeraSkeletonComponent,
  ],
  host: { class: 'block' },
  template: `
    <div class="bg-surface border border-border rounded-card p-4 flex flex-col gap-3">
      @if (store.loading()) {
        <pera-skeleton [height]="24" [width]="160" />
      } @else if (store.openPeriod(); as period) {
        <div class="flex items-center gap-3 flex-wrap">
          <div class="flex-1 min-w-0">
            <div class="font-semibold text-text-primary">{{ catalog.t('period.title') }}</div>
            <div class="fs-caption text-text-secondary mt-0.5">
              <span dir="ltr">{{ openedClosesLine() }}</span>
            </div>
          </div>
          <pera-status-badge [tone]="'success'" [label]="catalog.t('period.open')" />
          <div class="text-end">
            <div class="text-2xl font-semibold tabular-nums text-text-primary" dir="ltr">
              {{ liveDaysRemaining() }}
            </div>
            <div class="fs-label text-text-muted">{{ catalog.t('period.daysLeft') }}</div>
          </div>
          <div class="flex items-center gap-2">
            <pera-button
              variant="secondary"
              *peraCan="PERM.crm.periods.extend"
              (click)="extend()"
              >{{ catalog.t('period.extend') }}</pera-button
            >
            <pera-button
              variant="danger"
              *peraCan="PERM.crm.periods.close"
              [loading]="store.closing()"
              (click)="close(period.id)"
              >{{ catalog.t('period.closePeriod') }}</pera-button
            >
          </div>
        </div>
      } @else {
        <div class="flex items-center gap-3 flex-wrap">
          <div class="flex-1 min-w-0">
            <div class="font-semibold text-text-primary">{{ catalog.t('period.title') }}</div>
          </div>
          <pera-status-badge [tone]="CLOSED_CHIP.tone" [label]="catalog.t(CLOSED_CHIP.key)" />
          <pera-button variant="primary" *peraCan="PERM.crm.periods.open" (click)="open()">{{
            catalog.t('period.openPeriodBtn')
          }}</pera-button>
        </div>
      }

      @if (store.notFound()) {
        <!-- FINDING-5-6 (X-5): a 404 on load is "not found", never "Could not load". -->
        <pera-alert tone="warning">{{ catalog.t('period.notFound') }}</pera-alert>
      }
      @if (store.error(); as error) {
        <pera-alert tone="danger">{{ error }}</pera-alert>
      }
    </div>
  `,
})
export class CrmPeriodCardComponent {
  protected readonly store = inject(PeriodStore);
  protected readonly catalog = inject(CatalogService);
  protected readonly PERM = PERM;
  protected readonly CLOSED_CHIP = CLOSED_CHIP;
  private readonly modal = inject(ModalService);

  /** Fires once, when a `close()` call this card triggered completes successfully (FR-020). */
  readonly closed = output<void>();

  private readonly now = signal(Date.now());

  constructor() {
    const ticker = setInterval(() => this.now.set(Date.now()), 30_000);
    inject(DestroyRef).onDestroy(() => clearInterval(ticker));

    let wasClosing = false;
    effect(() => {
      const closing = this.store.closing();
      if (wasClosing && !closing && !this.store.error()) {
        this.closed.emit();
      }
      wasClosing = closing;
    });
  }

  protected readonly openedClosesLine = computed(() => {
    const period = this.store.openPeriod();
    if (!period) return '';
    const locale = this.catalog.locale();
    // 009b #25: the response has no opened-at date, so only the close date is shown.
    return this.catalog.t('period.closesAt', {
      closesAt: formatCairoDateTime(period.closesAtUtc, locale),
    });
  });

  protected readonly liveDaysRemaining = computed(() => {
    const period = this.store.openPeriod();
    if (!period) return 0;
    const ms = new Date(period.closesAtUtc).getTime() - this.now();
    return Math.max(0, Math.ceil(ms / 86_400_000));
  });

  protected async open(): Promise<void> {
    const projectId = this.store.projectId();
    if (!projectId) return;
    const ref = this.modal.open<boolean>(CrmPeriodFormComponent, {
      size: 'md',
      data: { mode: 'open', projectId },
    });
    if (await ref.afterClosed()) this.store.load(projectId);
  }

  protected async extend(): Promise<void> {
    const projectId = this.store.projectId();
    const period = this.store.openPeriod();
    if (!projectId || !period) return;
    const ref = this.modal.open<boolean>(CrmPeriodFormComponent, {
      size: 'md',
      data: {
        mode: 'extend',
        projectId,
        periodId: period.id,
        currentClosesAtUtc: period.closesAtUtc,
      },
    });
    if (await ref.afterClosed()) this.store.load(projectId);
  }

  protected close(periodId: string): void {
    this.store.close(periodId);
  }
}
