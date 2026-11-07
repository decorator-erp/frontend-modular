import {
  ChangeDetectionStrategy,
  Component,
  OnInit,
  computed,
  inject,
  signal,
} from '@angular/core';
import { FormsModule } from '@angular/forms';
import { ActivatedRoute } from '@angular/router';
import { of } from 'rxjs';
import { catchError } from 'rxjs/operators';
import { ProjectService, ProjectStageService } from '@modules/projects';
import { CatalogService } from '@platform/i18n/catalog.service';
import { Project } from '@modules/projects';
import {
  PeraPageHeaderComponent,
  PeraSelectComponent,
  PeraSkeletonComponent,
  SelectOption,
} from '@ds';
import { BriefStore } from '../../stores/brief.store';
import { CrmBriefAttachmentsComponent } from './brief-attachments.component';
import { CrmBriefCreateComponent } from './brief-create.component';
import { CrmBriefHeadComponent } from './brief-head.component';
import { CrmBriefRoundsComponent } from './brief-rounds.component';
import { CrmGatheringLedgerComponent } from './gathering-ledger.component';
import { CrmArtifactLinksComponent } from '../artifacts/artifact-links.component';

/**
 * `/crm/projects/:projectId/brief` — the design brief form (T061/T062/T065 composed).
 * Provides `BriefStore` fresh per visit.
 *
 * One brief per stage (009b #9, C §8.2.1): the stage selector lists the project's stages from
 * Projects (`ProjectStageService.getByProject`, 008b #24). Until a stage is picked the page shows the
 * project's latest brief through the obsolete project route (N-11) and selects that brief's stage.
 */
@Component({
  selector: 'app-crm-brief-page',
  changeDetection: ChangeDetectionStrategy.OnPush,
  providers: [BriefStore],
  imports: [
    FormsModule,
    PeraPageHeaderComponent,
    PeraSelectComponent,
    PeraSkeletonComponent,
    CrmBriefHeadComponent,
    CrmBriefRoundsComponent,
    CrmGatheringLedgerComponent,
    CrmBriefAttachmentsComponent,
    CrmBriefCreateComponent,
    CrmArtifactLinksComponent,
  ],
  host: { class: 'block bg-bg min-h-full' },
  template: `
    @if (project(); as p) {
      <pera-page-header [title]="catalog.t('brief.title')">
        <div toolbar class="flex items-center gap-3 flex-wrap">
          <span class="fs-caption text-text-secondary">{{ p.name }}</span>
          @if (stageOptions().length) {
            <pera-select
              variant="chip"
              [attr.aria-label]="catalog.t('brief.stageL')"
              [placeholder]="catalog.t('brief.stageL')"
              [options]="stageOptions()"
              [ngModel]="selectedStageId()"
              (ngModelChange)="selectStage($event)"
            />
          }
        </div>
      </pera-page-header>
    } @else {
      <div class="p-6"><pera-skeleton [height]="28" [width]="256" /></div>
    }

    <div class="p-6 flex flex-col gap-4">
      @if (store.noBrief()) {
        <app-crm-brief-create [stageId]="selectedStageId()" />
      } @else {
        <app-crm-brief-head />
        <app-crm-brief-rounds />
        <app-crm-gathering-ledger />
        <app-crm-brief-attachments [projectId]="projectId()" />
        <!-- crmp C-7: documents linked to this brief (#70, paged; unlink #120). -->
        @if (store.head(); as head) {
          @if (head.id) {
            <app-crm-artifact-links
              subject="brief"
              [subjectId]="head.id"
              [projectId]="projectId()"
            />
          }
        }
      }
    </div>
  `,
})
export class CrmBriefPageComponent implements OnInit {
  private readonly route = inject(ActivatedRoute);
  private readonly projects = inject(ProjectService);
  private readonly stagesApi = inject(ProjectStageService);
  protected readonly catalog = inject(CatalogService);
  protected readonly store = inject(BriefStore);

  protected readonly projectId = signal('');
  protected readonly project = signal<Project | null>(null);
  protected readonly stageOptions = signal<SelectOption[]>([]);

  /** The picked stage; until one is picked, the stage of the brief the fallback route returned. */
  private readonly pickedStageId = signal<string | null>(null);
  protected readonly selectedStageId = computed(
    () => this.pickedStageId() ?? this.store.head()?.projectStageId ?? null,
  );

  ngOnInit(): void {
    const id = this.route.snapshot.paramMap.get('projectId') ?? '';
    this.projectId.set(id);
    this.store.load(id);
    this.projects.getById(id).subscribe((p) => this.project.set(p));
    this.stagesApi
      .getByProject(id)
      .pipe(catchError(() => of([])))
      .subscribe((stages) =>
        this.stageOptions.set(stages.map((s) => ({ value: s.id, label: s.name }))),
      );
  }

  protected selectStage(stageId: string | null): void {
    if (!stageId || stageId === this.selectedStageId()) return;
    this.pickedStageId.set(stageId);
    this.store.load(this.projectId(), stageId);
  }
}
