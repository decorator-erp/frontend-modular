import { ChangeDetectionStrategy, Component, inject, input } from '@angular/core';
import { CatalogService } from '@platform/i18n/catalog.service';
import { formatCairoDateTime } from '@platform/i18n/intl-locale';
import { PeraEmptyComponent } from '@ds';
import type { PortalUpdate } from '../../../model/portal.model';
import { CrmPortalFilesComponent } from './portal-files.component';

/** crmp P2-B: the client's published updates, newest first, each with its attachments. */
@Component({
  selector: 'app-crm-portal-updates',
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [PeraEmptyComponent, CrmPortalFilesComponent],
  host: { class: 'block' },
  template: `
    @if (sorted().length) {
      <ul class="flex flex-col gap-3 m-0 p-0 list-none">
        @for (u of sorted(); track u.id) {
          <li class="flex flex-col gap-2 p-3 border border-border" data-testid="portal-update">
            <div class="flex flex-wrap items-baseline justify-between gap-2">
              <h3 class="m-0 fs-body-sm font-semibold text-text-primary" dir="auto">
                {{ u.title }}
              </h3>
              <span class="fs-caption text-text-muted">{{
                catalog.t('cportal.postedOn', { date: when(u.publishedAtUtc) })
              }}</span>
            </div>
            @if (u.body) {
              <p class="m-0 fs-body-sm text-text-secondary whitespace-pre-line" dir="auto">
                {{ u.body }}
              </p>
            }
            @if (u.attachments.length) {
              <span class="fs-caption text-text-muted">{{ catalog.t('cportal.attachments') }}</span>
              <app-crm-portal-files
                [files]="u.attachments"
                [projectId]="projectId()"
                [readonly]="readonly()"
              />
            }
          </li>
        }
      </ul>
    } @else {
      <pera-empty [title]="catalog.t('cportal.empty.updates')" />
    }
  `,
})
export class CrmPortalUpdatesComponent {
  protected readonly catalog = inject(CatalogService);
  readonly updates = input<PortalUpdate[]>([]);
  readonly projectId = input.required<string>();
  readonly readonly = input(false);

  /** Newest first, whatever order the list arrives in. */
  protected sorted(): PortalUpdate[] {
    return [...this.updates()].sort((a, b) => b.publishedAtUtc.localeCompare(a.publishedAtUtc));
  }

  protected when(iso: string): string {
    return iso ? formatCairoDateTime(iso, this.catalog.locale()) : '—';
  }
}
