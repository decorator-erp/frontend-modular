import {
  ChangeDetectionStrategy,
  Component,
  computed,
  effect,
  inject,
  input,
  signal,
  untracked,
} from '@angular/core';
import { CatalogService } from '@platform/i18n/catalog.service';
import type { CatalogKey } from '@platform/i18n/catalog/en';
import {
  PeraAlertComponent,
  PeraButtonComponent,
  PeraSkeletonComponent,
  PeraTabsComponent,
  type TabDef,
} from '@ds';
import { CrmPortalVisibilityService } from '../../data/crm-portal-visibility.service';
import type { PortalPreview } from '../../model/portal.model';
import { CrmPortalFilesComponent } from '../client/portal/portal-files.component';
import { CrmPortalGalleryComponent } from '../client/portal/portal-gallery.component';
import { CrmPortalProgressComponent } from '../client/portal/portal-progress.component';
import { CrmPortalTasksComponent } from '../client/portal/portal-tasks.component';
import { CrmPortalUpdatesComponent } from '../client/portal/portal-updates.component';

type PreviewTab = 'progress' | 'files' | 'gallery' | 'tasks' | 'updates';

const TAB_KEYS: Readonly<Record<PreviewTab, CatalogKey>> = {
  progress: 'cportal.tab.progress',
  files: 'cportal.tab.files',
  gallery: 'cportal.tab.gallery',
  tasks: 'cportal.tab.tasks',
  updates: 'cportal.tab.updates',
};

/**
 * crmp P2-B: "Preview as client" — `GET …/portal/preview`, built by the client routes' own code, shown
 * through the client's own section components in read-only mode (no file opens: the stream route is
 * the client's). Only the sections that are on get a tab, exactly as on the client's profile.
 */
@Component({
  selector: 'app-crm-portal-preview-panel',
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [
    PeraAlertComponent,
    PeraButtonComponent,
    PeraSkeletonComponent,
    PeraTabsComponent,
    CrmPortalFilesComponent,
    CrmPortalGalleryComponent,
    CrmPortalProgressComponent,
    CrmPortalTasksComponent,
    CrmPortalUpdatesComponent,
  ],
  host: { class: 'flex flex-col gap-4' },
  template: `
    <div class="flex flex-wrap items-center justify-between gap-3">
      <p class="m-0 fs-caption text-text-secondary">{{ catalog.t('pportal.previewHint') }}</p>
      <pera-button variant="secondary" size="sm" [disabled]="loading()" (click)="load()">{{
        catalog.t('pportal.refresh')
      }}</pera-button>
    </div>
    @if (loading()) {
      <div class="flex flex-col gap-2" data-testid="preview-loading">
        <pera-skeleton [height]="40" />
        <pera-skeleton [height]="120" />
      </div>
    } @else if (failed()) {
      <pera-alert tone="danger">{{ catalog.t('pportal.loadFailed') }}</pera-alert>
    } @else if (preview(); as p) {
      <h3 class="m-0 fs-body font-semibold text-text-primary" dir="auto">
        {{ p.overview.projectName }}
      </h3>
      @if (tabs().length) {
        <pera-tabs [tabs]="tabDefs()" [activeId]="active() ?? ''" (activeChange)="select($event)" />
        <div data-testid="preview-body">
          @switch (active()) {
            @case ('progress') {
              <app-crm-portal-progress [progress]="p.overview.progress" />
            }
            @case ('files') {
              <app-crm-portal-files
                [files]="p.files"
                [projectId]="projectId()"
                [readonly]="true"
                [emptyTitle]="catalog.t('cportal.empty.files')"
              />
            }
            @case ('gallery') {
              <app-crm-portal-gallery
                [items]="p.gallery"
                [projectId]="projectId()"
                [readonly]="true"
              />
            }
            @case ('tasks') {
              <app-crm-portal-tasks [tasks]="p.tasks" />
            }
            @case ('updates') {
              <app-crm-portal-updates
                [updates]="p.updates"
                [projectId]="projectId()"
                [readonly]="true"
              />
            }
          }
        </div>
      } @else {
        <pera-alert tone="info" data-testid="preview-none">{{
          catalog.t('pportal.previewNoSections')
        }}</pera-alert>
      }
    }
  `,
})
export class CrmPortalPreviewPanelComponent {
  private readonly api = inject(CrmPortalVisibilityService);
  protected readonly catalog = inject(CatalogService);

  readonly projectId = input.required<string>();
  /** Bumped by the page after any write, so an open preview re-reads. */
  readonly version = input(0);

  readonly preview = signal<PortalPreview | null>(null);
  readonly loading = signal(true);
  readonly failed = signal(false);
  private readonly selected = signal<PreviewTab | null>(null);
  private generation = 0;

  /** The tabs the client sees: a section that is off has none (its list is empty too). */
  readonly tabs = computed<PreviewTab[]>(() => {
    const s = this.preview()?.overview.sections;
    if (!s) return [];
    const tabs: PreviewTab[] = [];
    if (s.progress) tabs.push('progress');
    if (s.documents) tabs.push('files');
    if (s.gallery || s.siteSurveys) tabs.push('gallery');
    if (s.tasks) tabs.push('tasks');
    if (s.updates) tabs.push('updates');
    return tabs;
  });
  protected readonly tabDefs = computed<TabDef[]>(() =>
    this.tabs().map((t) => ({ id: t, label: this.catalog.t(TAB_KEYS[t]) })),
  );
  protected readonly active = computed<PreviewTab | null>(() => {
    const tab = this.selected();
    const tabs = this.tabs();
    return tab && tabs.includes(tab) ? tab : (tabs[0] ?? null);
  });

  constructor() {
    effect(() => {
      this.projectId();
      this.version();
      untracked(() => this.load());
    });
  }

  select(id: string): void {
    this.selected.set(id as PreviewTab);
  }

  load(): void {
    const gen = ++this.generation;
    this.loading.set(true);
    this.failed.set(false);
    this.api.getPreview(this.projectId()).subscribe({
      next: (p) => {
        if (gen !== this.generation) return;
        this.preview.set(p);
        this.loading.set(false);
      },
      error: () => {
        if (gen !== this.generation) return;
        this.failed.set(true);
        this.loading.set(false);
      },
    });
  }
}
