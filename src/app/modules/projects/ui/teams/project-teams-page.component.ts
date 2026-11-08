import { ChangeDetectionStrategy, Component, inject } from '@angular/core';
import { ActivatedRoute, RouterLink } from '@angular/router';
import { PeraPageHeaderComponent } from '@ds';
import { CatalogService } from '@platform/i18n/catalog.service';
import { ProjectAccessStore } from '../../stores/project-access.store';
import { ProjectTeamsComponent } from '../project-teams.component';
import { ProjectClosedBannerComponent } from '../shared/project-closed-banner.component';

/**
 * crmp P-7 (DEVIATION-4: no tabs on the project page): the project's stage teams — head, member count,
 * a team made by hand for a stage, adding and removing members — on its own route. The panel is the
 * ported `app-project-teams`, now gated on claim AND level through the ProjectAccessStore.
 */
@Component({
  selector: 'app-project-teams-page',
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [
    RouterLink,
    PeraPageHeaderComponent,
    ProjectTeamsComponent,
    ProjectClosedBannerComponent,
  ],
  template: `
    <div class="flex flex-col gap-4 p-6 max-w-5xl">
      <a class="fs-label text-text-muted hover:text-accent" [routerLink]="['/projects', projectId]">
        {{ catalog.t('pm.back') }}
      </a>
      <pera-page-header [title]="catalog.t('pteam.title')" />
      @if (access.project(projectId)(); as p) {
        <app-project-closed-banner [project]="p" />
      }
      <app-project-teams [projectId]="projectId" />
    </div>
  `,
})
export class ProjectTeamsPageComponent {
  private readonly route = inject(ActivatedRoute);
  protected readonly access = inject(ProjectAccessStore);
  protected readonly catalog = inject(CatalogService);
  readonly projectId = this.route.snapshot.paramMap.get('id') ?? '';

  constructor() {
    this.access.ensure(this.projectId);
  }
}
