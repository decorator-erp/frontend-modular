import { ChangeDetectionStrategy, Component, OnInit, inject, signal } from '@angular/core';
import { ActivatedRoute } from '@angular/router';
import { ProjectService } from '@modules/projects';
import { CatalogService } from '@platform/i18n/catalog.service';
import { Project } from '@modules/projects';
import { PeraPageHeaderComponent, PeraSkeletonComponent } from '@ds';
import { BriefStore } from '../../stores/brief.store';
import { CrmBriefAttachmentsComponent } from './brief-attachments.component';
import { CrmBriefHeadComponent } from './brief-head.component';
import { CrmGatheringLedgerComponent } from './gathering-ledger.component';

/**
 * `/crm/projects/:projectId/brief` — the design brief form (T061/T062/T065 composed).
 * Provides `BriefStore` fresh per visit.
 */
@Component({
  selector: 'app-crm-brief-page',
  changeDetection: ChangeDetectionStrategy.OnPush,
  providers: [BriefStore],
  imports: [
    PeraPageHeaderComponent,
    PeraSkeletonComponent,
    CrmBriefHeadComponent,
    CrmGatheringLedgerComponent,
    CrmBriefAttachmentsComponent,
  ],
  host: { class: 'block bg-bg min-h-full' },
  template: `
    @if (project(); as p) {
      <pera-page-header [title]="catalog.t('brief.title')">
        <div toolbar class="fs-caption text-text-secondary">{{ p.name }}</div>
      </pera-page-header>
    } @else {
      <div class="p-6"><pera-skeleton [height]="28" [width]="256" /></div>
    }

    <div class="p-6 flex flex-col gap-4">
      <app-crm-brief-head />
      <app-crm-gathering-ledger />
      <app-crm-brief-attachments [projectId]="projectId()" />
    </div>
  `,
})
export class CrmBriefPageComponent implements OnInit {
  private readonly route = inject(ActivatedRoute);
  private readonly projects = inject(ProjectService);
  protected readonly catalog = inject(CatalogService);
  protected readonly store = inject(BriefStore);

  protected readonly projectId = signal('');
  protected readonly project = signal<Project | null>(null);

  ngOnInit(): void {
    const id = this.route.snapshot.paramMap.get('projectId') ?? '';
    this.projectId.set(id);
    this.store.load(id);
    this.projects.getById(id).subscribe((p) => this.project.set(p));
  }
}
