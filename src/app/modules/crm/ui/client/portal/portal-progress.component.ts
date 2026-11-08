import { ChangeDetectionStrategy, Component, inject, input } from '@angular/core';
import { CatalogService } from '@platform/i18n/catalog.service';
import { formatCairoDate } from '@platform/i18n/intl-locale';
import { PeraEmptyComponent, PeraProgressBarComponent, PeraStatusBadgeComponent } from '@ds';
import type { PortalProgress, PortalStage } from '../../../model/portal.model';
import { statusChip } from './portal-format';

/**
 * crmp P2-B: the client's Progress section — the project % and the stage timeline (status chip,
 * planned and actual dates in Cairo time). Presentational: the profile tab and the office preview
 * both pass the overview's `progress` in.
 */
@Component({
  selector: 'app-crm-portal-progress',
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [PeraEmptyComponent, PeraProgressBarComponent, PeraStatusBadgeComponent],
  host: { class: 'flex flex-col gap-4' },
  template: `
    @if (progress(); as p) {
      <div class="flex flex-col gap-1">
        <div class="flex items-center justify-between gap-3 fs-body-sm">
          <span class="text-text-secondary">{{ catalog.t('cportal.overall') }}</span>
          <span class="font-semibold text-text-primary" data-testid="portal-percent" dir="ltr"
            >{{ percent(p.progressPercentage) }}%</span
          >
        </div>
        <pera-progress-bar [value]="p.progressPercentage" />
        @if (p.activeStageName) {
          <p class="fs-caption text-text-secondary m-0">
            {{ catalog.t('cportal.activeStage') }}: <span dir="auto">{{ p.activeStageName }}</span>
          </p>
        }
      </div>

      <section class="flex flex-col gap-2" [attr.aria-label]="catalog.t('cportal.timeline')">
        <h3 class="m-0 fs-body-sm font-semibold text-text-primary">
          {{ catalog.t('cportal.timeline') }}
        </h3>
        @if (p.limitedToSharedStages) {
          <p class="fs-caption text-text-muted m-0">{{ catalog.t('cportal.sharedStagesOnly') }}</p>
        }
        @if (p.stages.length) {
          <ol class="flex flex-col gap-0 m-0 p-0 list-none border-s-2 border-border ms-2">
            @for (stage of p.stages; track $index) {
              <li class="relative ps-4 pb-4" data-testid="portal-stage">
                <span
                  class="absolute -start-2 top-1 w-3 h-3 rounded-full border-2 border-surface"
                  [class.bg-accent]="stage.status === 'Active' || stage.status === 'InProgress'"
                  [class.bg-success]="stage.status === 'Completed'"
                  [class.bg-border-strong]="
                    stage.status !== 'Active' &&
                    stage.status !== 'InProgress' &&
                    stage.status !== 'Completed'
                  "
                  aria-hidden="true"
                ></span>
                <div class="flex flex-wrap items-center justify-between gap-2">
                  <span class="fs-body-sm font-medium text-text-primary" dir="auto">{{
                    stage.name
                  }}</span>
                  <pera-status-badge [tone]="chip(stage).tone" [label]="chip(stage).label" />
                </div>
                @if (stage.note) {
                  <p class="fs-caption text-text-secondary m-0 mt-1" dir="auto">{{ stage.note }}</p>
                }
                @if (stage.plannedStartDate || stage.plannedEndDate) {
                  <p class="fs-caption text-text-muted m-0 mt-1" data-testid="planned">
                    {{ range('cportal.planned', stage.plannedStartDate, stage.plannedEndDate) }}
                  </p>
                }
                @if (stage.actualStartDate || stage.actualEndDate) {
                  <p class="fs-caption text-text-muted m-0" data-testid="actual">
                    {{ range('cportal.actual', stage.actualStartDate, stage.actualEndDate) }}
                  </p>
                }
                <p class="fs-caption text-text-muted m-0">
                  {{
                    catalog.t('cportal.stageProgress', {
                      percent: percent(stage.progressPercentage),
                    })
                  }}
                </p>
              </li>
            }
          </ol>
        } @else {
          <pera-empty [title]="catalog.t('cportal.empty.progress')" />
        }
      </section>
    } @else {
      <pera-empty [title]="catalog.t('cportal.empty.progress')" />
    }
  `,
})
export class CrmPortalProgressComponent {
  protected readonly catalog = inject(CatalogService);
  readonly progress = input<PortalProgress | null>(null);

  protected chip(stage: PortalStage) {
    return statusChip(stage.status, this.catalog);
  }

  protected percent(value: number): string {
    return new Intl.NumberFormat(this.catalog.locale() === 'ar' ? 'ar-EG' : 'en-GB', {
      maximumFractionDigits: 0,
    }).format(value);
  }

  protected range(
    key: 'cportal.planned' | 'cportal.actual',
    from: string | null,
    to: string | null,
  ): string {
    const locale = this.catalog.locale();
    return this.catalog.t(key, {
      from: from ? formatCairoDate(from, locale) : '—',
      to: to ? formatCairoDate(to, locale) : '—',
    });
  }
}
