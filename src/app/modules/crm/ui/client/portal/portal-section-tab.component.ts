import { HttpErrorResponse } from '@angular/common/http';
import {
  ChangeDetectionStrategy,
  Component,
  effect,
  inject,
  input,
  signal,
  untracked,
} from '@angular/core';
import type { Observable } from 'rxjs';
import { CatalogService } from '@platform/i18n/catalog.service';
import type { CatalogKey } from '@platform/i18n/catalog/en';
import { PeraAlertComponent, PeraButtonComponent, PeraSkeletonComponent } from '@ds';
import { CrmPortalContentService } from '../../../data/crm-portal-content.service';
import type { PortalFile, PortalTask, PortalUpdate } from '../../../model/portal.model';
import { CrmPortalFilesComponent } from './portal-files.component';
import { CrmPortalGalleryComponent } from './portal-gallery.component';
import { CrmPortalTasksComponent } from './portal-tasks.component';
import { CrmPortalUpdatesComponent } from './portal-updates.component';

export type PortalListSection = 'files' | 'gallery' | 'tasks' | 'updates';

type LoadState = 'loading' | 'ready' | 'error' | 'notFound' | 'forbidden';

/**
 * crmp P2-B: one list section of the client's project (Files, Gallery, Tasks, Updates). Loads its
 * own list and shows loading, empty, error (with retry), 404 (the section was switched off, or the
 * project is not the caller's) and 403 states, then the shared presentational component.
 */
@Component({
  selector: 'app-crm-portal-section-tab',
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [
    PeraAlertComponent,
    PeraButtonComponent,
    PeraSkeletonComponent,
    CrmPortalFilesComponent,
    CrmPortalGalleryComponent,
    CrmPortalTasksComponent,
    CrmPortalUpdatesComponent,
  ],
  host: { class: 'block' },
  template: `
    @switch (state()) {
      @case ('loading') {
        <div class="flex flex-col gap-2" data-testid="section-loading">
          <pera-skeleton [height]="40" />
          <pera-skeleton [height]="40" />
        </div>
      }
      @case ('notFound') {
        <pera-alert tone="info" data-testid="section-unavailable">{{
          catalog.t('cportal.unavailable')
        }}</pera-alert>
      }
      @case ('forbidden') {
        <pera-alert tone="warning">{{ catalog.t('cportal.forbidden') }}</pera-alert>
      }
      @case ('error') {
        <pera-alert tone="danger" data-testid="section-error">
          <div class="flex items-center gap-3">
            <span class="flex-1">{{ catalog.t('cportal.loadFailed') }}</span>
            <pera-button variant="secondary" size="xs" (click)="load()">{{
              catalog.t('common.retry')
            }}</pera-button>
          </div>
        </pera-alert>
      }
      @default {
        @switch (section()) {
          @case ('files') {
            <app-crm-portal-files
              [files]="files()"
              [projectId]="projectId()"
              [emptyTitle]="catalog.t(EMPTY.files)"
            />
          }
          @case ('gallery') {
            <app-crm-portal-gallery [items]="files()" [projectId]="projectId()" />
          }
          @case ('tasks') {
            <app-crm-portal-tasks [tasks]="tasks()" />
          }
          @case ('updates') {
            <app-crm-portal-updates [updates]="updates()" [projectId]="projectId()" />
          }
        }
      }
    }
  `,
})
export class CrmPortalSectionTabComponent {
  private readonly content = inject(CrmPortalContentService);
  protected readonly catalog = inject(CatalogService);
  protected readonly EMPTY: Record<PortalListSection, CatalogKey> = {
    files: 'cportal.empty.files',
    gallery: 'cportal.empty.gallery',
    tasks: 'cportal.empty.tasks',
    updates: 'cportal.empty.updates',
  };

  readonly projectId = input.required<string>();
  readonly section = input.required<PortalListSection>();

  protected readonly state = signal<LoadState>('loading');
  protected readonly files = signal<PortalFile[]>([]);
  protected readonly tasks = signal<PortalTask[]>([]);
  protected readonly updates = signal<PortalUpdate[]>([]);
  private generation = 0;

  constructor() {
    effect(() => {
      this.projectId();
      this.section();
      untracked(() => this.load());
    });
  }

  load(): void {
    const projectId = this.projectId();
    const section = this.section();
    const gen = ++this.generation;
    this.state.set('loading');
    const done = <T>(set: (v: T) => void) => ({
      next: (v: T) => {
        if (gen !== this.generation) return;
        set(v);
        this.state.set('ready');
      },
      error: (err: unknown) => {
        if (gen !== this.generation) return;
        const status = err instanceof HttpErrorResponse ? err.status : 0;
        this.state.set(status === 404 ? 'notFound' : status === 403 ? 'forbidden' : 'error');
      },
    });
    switch (section) {
      case 'files':
        this.subscribe(
          this.content.getFiles(projectId),
          done((v) => this.files.set(v)),
        );
        break;
      case 'gallery':
        this.subscribe(
          this.content.getGallery(projectId),
          done((v) => this.files.set(v)),
        );
        break;
      case 'tasks':
        this.subscribe(
          this.content.getTasks(projectId),
          done((v) => this.tasks.set(v)),
        );
        break;
      case 'updates':
        this.subscribe(
          this.content.getUpdates(projectId),
          done((v) => this.updates.set(v)),
        );
        break;
    }
  }

  private subscribe<T>(
    source: Observable<T>,
    observer: { next: (v: T) => void; error: (e: unknown) => void },
  ): void {
    source.subscribe(observer);
  }
}
