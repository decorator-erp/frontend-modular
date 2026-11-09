import { ChangeDetectionStrategy, Component, Injector, effect, inject, input } from '@angular/core';
import { CatalogService } from '@platform/i18n/catalog.service';
import { ModalService, PeraEmptyComponent, PeraIconComponent } from '@ds';
import { CrmPortalContentService } from '../../../data/crm-portal-content.service';
import { PortalShareKind, type PortalFile } from '../../../model/portal.model';
import { PortalBlobUrls } from './portal-format';
import { CrmPortalLightboxComponent, type PortalLightboxData } from './portal-lightbox.component';

/**
 * crmp P2-B: the client's Gallery — shared images and site photos as a thumbnail grid. Thumbnails
 * are authed blobs (object URLs revoked on destroy); a tile opens the lightbox. `readonly` (the
 * office preview) fetches nothing and shows placeholders: the office cannot open the client route.
 */
@Component({
  selector: 'app-crm-portal-gallery',
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [PeraEmptyComponent, PeraIconComponent],
  providers: [PortalBlobUrls],
  host: { class: 'block' },
  template: `
    @if (items().length) {
      <ul class="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 gap-2 m-0 p-0 list-none">
        @for (item of items(); track item.shareId; let i = $index) {
          <li>
            <button
              type="button"
              class="group flex flex-col w-full text-start border border-border bg-surface rounded-card cursor-pointer
                     outline-none focus-visible:outline-2 focus-visible:outline-accent"
              [attr.aria-label]="
                catalog.t('cportal.openPhoto', { name: item.title || item.fileName })
              "
              [disabled]="readonly()"
              data-testid="portal-tile"
              (click)="open(i)"
            >
              <span
                class="flex items-center justify-center aspect-square w-full overflow-hidden bg-surface-muted"
              >
                @if (blobs.url(item.shareId); as src) {
                  <img
                    [src]="src"
                    [alt]="item.title || item.fileName"
                    class="w-full h-full object-cover"
                  />
                } @else {
                  <pera-icon name="file" [size]="24" class="text-text-muted" />
                }
              </span>
              <span class="p-2 fs-caption text-text-primary truncate" dir="auto">{{
                item.title || item.fileName
              }}</span>
              @if (item.kind === PortalShareKind.SitePhoto) {
                <span class="px-2 pb-2 fs-caption text-text-muted">{{
                  catalog.t('cportal.sitePhoto')
                }}</span>
              }
            </button>
          </li>
        }
      </ul>
    } @else {
      <pera-empty [title]="catalog.t('cportal.empty.gallery')" />
    }
  `,
})
export class CrmPortalGalleryComponent {
  private readonly content = inject(CrmPortalContentService);
  private readonly modal = inject(ModalService);
  private readonly injector = inject(Injector);
  protected readonly blobs = inject(PortalBlobUrls);
  protected readonly catalog = inject(CatalogService);
  protected readonly PortalShareKind = PortalShareKind;

  readonly items = input<PortalFile[]>([]);
  readonly projectId = input.required<string>();
  readonly readonly = input(false);

  constructor() {
    effect(() => {
      if (this.readonly()) return;
      const projectId = this.projectId();
      for (const item of this.items()) {
        if (!item.isImage) continue;
        this.blobs.ensure(item.shareId, () => this.content.fileBlob(projectId, item.shareId));
      }
    });
  }

  open(index: number): void {
    if (this.readonly()) return;
    const data: PortalLightboxData = {
      items: this.items(),
      index,
      projectId: this.projectId(),
      blobs: this.blobs,
    };
    // The gallery's injector carries its PortalBlobUrls, so the lightbox reuses the thumbnails.
    this.modal.open(CrmPortalLightboxComponent, { size: 'xl', data, injector: this.injector });
  }
}
