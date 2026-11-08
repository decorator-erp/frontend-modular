import { ChangeDetectionStrategy, Component, inject, input, signal } from '@angular/core';
import { CatalogService } from '@platform/i18n/catalog.service';
import { ToastService } from '@platform/feedback/toast.service';
import { PeraButtonComponent, PeraEmptyComponent, PeraIconComponent } from '@ds';
import { CrmPortalContentService } from '../../../data/crm-portal-content.service';
import type { PortalFile } from '../../../model/portal.model';
import { formatFileSize, saveBlob } from './portal-format';

/**
 * crmp P2-B: a list of shared files (the Files section, and an update's attachments): title,
 * size and a download button. The download is an authed blob from the client stream route, so a
 * plain link would not carry the token. `readonly` (the office preview) shows no download: the
 * office cannot open the client route.
 */
@Component({
  selector: 'app-crm-portal-files',
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [PeraButtonComponent, PeraEmptyComponent, PeraIconComponent],
  host: { class: 'block' },
  template: `
    @if (files().length) {
      <ul class="flex flex-col gap-2 m-0 p-0 list-none">
        @for (f of files(); track f.shareId) {
          <li
            class="flex items-center gap-3 p-2 border border-border fs-body-sm"
            data-testid="portal-file"
          >
            <pera-icon name="file-text" [size]="16" class="text-text-muted shrink-0" />
            <div class="min-w-0 flex-1">
              <div class="text-text-primary truncate" dir="auto">{{ f.title || f.fileName }}</div>
              <div class="fs-caption text-text-muted">
                <span dir="auto">{{ f.fileName }}</span> · {{ size(f.fileSizeBytes) }}
              </div>
              @if (f.note) {
                <div class="fs-caption text-text-secondary" dir="auto">{{ f.note }}</div>
              }
            </div>
            @if (!readonly()) {
              <pera-button
                variant="secondary"
                size="sm"
                [loading]="downloading() === f.shareId"
                [disabled]="downloading() !== null"
                (click)="download(f)"
                >{{ catalog.t('cportal.download')
                }}<span class="sr-only" dir="auto"> {{ f.title || f.fileName }}</span></pera-button
              >
            }
          </li>
        }
      </ul>
    } @else if (emptyTitle()) {
      <pera-empty [title]="emptyTitle()" />
    }
  `,
})
export class CrmPortalFilesComponent {
  private readonly content = inject(CrmPortalContentService);
  private readonly toast = inject(ToastService);
  protected readonly catalog = inject(CatalogService);

  readonly files = input<PortalFile[]>([]);
  readonly projectId = input.required<string>();
  readonly readonly = input(false);
  readonly emptyTitle = input('');

  /** The share being downloaded: one at a time (in-flight guard). */
  protected readonly downloading = signal<string | null>(null);

  protected size(bytes: number): string {
    return formatFileSize(bytes, this.catalog);
  }

  download(file: PortalFile): void {
    if (this.readonly() || this.downloading()) return;
    this.downloading.set(file.shareId);
    this.content.fileBlob(this.projectId(), file.shareId).subscribe({
      next: (blob) => {
        this.downloading.set(null);
        saveBlob(blob, file.fileName || file.title);
      },
      error: () => {
        this.downloading.set(null);
        this.toast.show({ tone: 'danger', message: this.catalog.t('cportal.downloadFailed') });
      },
    });
  }
}
