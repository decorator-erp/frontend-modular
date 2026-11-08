import { ChangeDetectionStrategy, Component, computed, inject, input } from '@angular/core';
import { PeraAlertComponent } from '@ds';
import { CatalogService } from '@platform/i18n/catalog.service';
import type { CatalogKey } from '@platform/i18n/catalog/en';
import { formatCairoDateTime } from '@platform/i18n/intl-locale';
import type { ProjectAccess } from '../../model/access-grant.model';
import { isGrantAccess } from '../../model/project-access';

/**
 * crmp P1-B: on a project page opened through a grant, "Temporary access: Read only · Documents,
 * Stage 1 · until 1 Dec 2026, 12:00" (Cairo time) or "· no end". Renders nothing for members and
 * read_all. `stages` names the grant's stages; an unknown id is shown as-is.
 */
@Component({
  selector: 'app-project-grant-banner',
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [PeraAlertComponent],
  template: `
    @if (text(); as message) {
      <pera-alert tone="info" data-grant-banner>{{ message }}</pera-alert>
    }
  `,
})
export class ProjectGrantBannerComponent {
  readonly access = input<ProjectAccess | null | undefined>(null);
  readonly stages = input<readonly { id: string; name: string }[]>([]);
  private readonly catalog = inject(CatalogService);

  readonly text = computed<string | null>(() => {
    const a = this.access();
    if (!isGrantAccess(a)) return null;
    const t = (key: string, params?: Record<string, string>) =>
      this.catalog.t(key as CatalogKey, params);
    const names = new Map(this.stages().map((s) => [s.id, s.name]));
    const scope = [
      ...a.areas.map((area) => t(`grants.area.${area}`)),
      ...(a.stageIds.length
        ? a.stageIds.map((id) => names.get(id) || id)
        : [t('grants.wholeProject')]),
    ].join(t('grants.listSep'));
    const until = a.expiresAtUtc
      ? t('grants.banner.until', {
          date: formatCairoDateTime(a.expiresAtUtc, this.catalog.locale()),
        })
      : t('grants.banner.noEnd');
    return t('grants.banner', { level: t(`grants.level.${a.level}`), scope, until });
  });
}
