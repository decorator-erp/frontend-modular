import {
  ChangeDetectionStrategy,
  Component,
  computed,
  effect,
  inject,
  signal,
} from '@angular/core';
import { CatalogService } from '@platform/i18n/catalog.service';
import { LocaleService } from '@platform/i18n/locale.service';
import {
  PERA_MODAL_DATA,
  PeraButtonComponent,
  PeraIconComponent,
  PeraModalComponent,
  PeraModalFooterDirective,
  PeraModalRef,
} from '@ds';
import { CrmPortalContentService } from '../../../data/crm-portal-content.service';
import type { PortalFile } from '../../../model/portal.model';
import type { PortalBlobUrls } from './portal-format';

export interface PortalLightboxData {
  items: PortalFile[];
  index: number;
  projectId: string;
  /** The gallery's object URLs: shown at once, revoked with the gallery. */
  blobs: PortalBlobUrls;
}

/**
 * crmp P2-B: the gallery lightbox (`pera-modal`). Previous / Next buttons and the arrow keys move
 * through the photos; the arrows follow the reading direction (in RTL, ArrowLeft is "next").
 * Escape closes (the modal service's own handling), and focus stays trapped in the dialog.
 */
@Component({
  selector: 'app-crm-portal-lightbox',
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [PeraModalComponent, PeraModalFooterDirective, PeraButtonComponent, PeraIconComponent],
  host: { '(keydown)': 'onKey($event)' },
  template: `
    <pera-modal [title]="current().title || current().fileName" size="xl">
      <figure class="m-0 flex flex-col items-center gap-2">
        <div class="flex items-center justify-center w-full min-h-64 bg-surface-muted">
          @if (data.blobs.url(current().shareId); as src) {
            <img
              [src]="src"
              [alt]="current().title || current().fileName"
              class="max-w-full max-h-[70vh] object-contain"
              data-testid="lightbox-image"
            />
          } @else if (data.blobs.hasFailed(current().shareId)) {
            <span class="fs-body-sm text-text-muted">{{ catalog.t('cportal.imageFailed') }}</span>
          } @else {
            <pera-icon name="file" [size]="32" class="text-text-muted" />
          }
        </div>
        <figcaption class="flex flex-col items-center gap-1 fs-body-sm">
          <span class="text-text-secondary" aria-live="polite" data-testid="lightbox-position">{{
            catalog.t('cportal.photoOf', { n: index() + 1, total: data.items.length })
          }}</span>
          @if (current().note) {
            <span class="text-text-secondary" dir="auto">{{ current().note }}</span>
          }
        </figcaption>
      </figure>
      <div peraModalFooter class="flex items-center justify-between w-full gap-2">
        <pera-button
          variant="secondary"
          [disabled]="index() === 0"
          data-testid="lightbox-prev"
          (click)="prev()"
        >
          <pera-icon name="chevron-left" [size]="16" class="rtl:rotate-180" />
          {{ catalog.t('cportal.prev') }}
        </pera-button>
        <pera-button variant="ghost" (click)="close()">{{
          catalog.t('cportal.close')
        }}</pera-button>
        <pera-button
          variant="secondary"
          [disabled]="index() === data.items.length - 1"
          data-testid="lightbox-next"
          (click)="next()"
        >
          {{ catalog.t('cportal.next') }}
          <pera-icon name="chevron-right" [size]="16" class="rtl:rotate-180" />
        </pera-button>
      </div>
    </pera-modal>
  `,
})
export class CrmPortalLightboxComponent {
  protected readonly data = inject(PERA_MODAL_DATA) as PortalLightboxData;
  private readonly modalRef = inject(PeraModalRef);
  private readonly content = inject(CrmPortalContentService);
  protected readonly catalog = inject(CatalogService);
  private readonly locale = inject(LocaleService);

  readonly index = signal(this.data.index);
  protected readonly current = computed(() => this.data.items[this.index()]);

  constructor() {
    // A tile whose thumbnail has not landed yet (or is not an image) is fetched on open.
    effect(() => {
      const item = this.current();
      this.data.blobs.ensure(item.shareId, () =>
        this.content.fileBlob(this.data.projectId, item.shareId),
      );
    });
  }

  prev(): void {
    if (this.index() > 0) this.index.update((i) => i - 1);
  }

  next(): void {
    if (this.index() < this.data.items.length - 1) this.index.update((i) => i + 1);
  }

  close(): void {
    this.modalRef.close();
  }

  onKey(event: KeyboardEvent): void {
    const rtl = this.locale.direction() === 'rtl';
    if (event.key === 'ArrowRight') {
      event.preventDefault();
      if (rtl) this.prev();
      else this.next();
    } else if (event.key === 'ArrowLeft') {
      event.preventDefault();
      if (rtl) this.next();
      else this.prev();
    }
  }
}
