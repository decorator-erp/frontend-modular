import {
  ChangeDetectionStrategy,
  Component,
  Injectable,
  Injector,
  inject,
  input,
} from '@angular/core';
import { Overlay } from '@angular/cdk/overlay';
import { ComponentPortal, ComponentType } from '@angular/cdk/portal';
import { A11yModule } from '@angular/cdk/a11y';
import { PeraIconComponent } from '../../components/icon/pera-icon.component';
import { PERA_MODAL_DATA, PeraModalRef } from '../modal/modal.service';

export interface DrawerConfig {
  data?: unknown;
  dismissable?: boolean;
}

/**
 * Side drawer service — same ref/data contract as ModalService (PeraModalRef +
 * PERA_MODAL_DATA) but the panel is anchored to the inline-end edge and fills
 * the viewport height. Backdrop click and ESC close it.
 */
@Injectable({ providedIn: 'root' })
export class DrawerService {
  private readonly overlay = inject(Overlay);
  private readonly injector = inject(Injector);

  open<T = unknown, C = unknown>(
    component: ComponentType<C>,
    config: DrawerConfig = {},
  ): PeraModalRef<T> {
    const dismissable = config.dismissable ?? true;

    const overlayRef = this.overlay.create({
      hasBackdrop: true,
      backdropClass: ['bg-black/40'],
      positionStrategy: this.overlay.position().global().end('0').top('0'),
      scrollStrategy: this.overlay.scrollStrategies.block(),
      height: '100vh',
      maxWidth: '100vw',
    });

    const drawerRef = new PeraModalRef<T>(overlayRef);

    const injector = Injector.create({
      parent: this.injector,
      providers: [
        { provide: PeraModalRef, useValue: drawerRef },
        { provide: PERA_MODAL_DATA, useValue: config.data ?? null },
      ],
    });

    overlayRef.attach(new ComponentPortal(component, null, injector));

    if (dismissable) {
      overlayRef.backdropClick().subscribe(() => drawerRef.close());
      overlayRef.keydownEvents().subscribe((event) => {
        if (event.key === 'Escape') drawerRef.close();
      });
    }

    return drawerRef;
  }
}

/**
 * Drawer shell — header (title + close X) and a body that fills the remaining
 * height. No default footer: actions live inline next to their context.
 */
@Component({
  selector: 'pera-drawer',
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [A11yModule, PeraIconComponent],
  host: { class: 'block h-full' },
  template: `
    <div
      cdkTrapFocus
      cdkTrapFocusAutoCapture
      class="bg-surface border-s border-border shadow-lg flex flex-col h-screen w-screen sm:w-[var(--w-drawer)] lg:w-[var(--w-drawer-lg)]"
      role="dialog"
      aria-modal="true"
      [attr.aria-label]="title()"
    >
      <header
        class="flex items-center justify-between gap-4 px-5 py-3.5 border-b border-border shrink-0"
      >
        <h2 class="m-0 fs-body font-semibold truncate">{{ title() }}</h2>
        <button
          type="button"
          class="inline-flex p-1 rounded-sm text-text-muted hover:text-text-primary hover:bg-surface-muted
                 cursor-pointer outline-none focus-visible:outline-2 focus-visible:outline-accent"
          aria-label="Close"
          (click)="dismiss()"
        >
          <pera-icon name="x" [size]="16" />
        </button>
      </header>
      <div class="flex-1 overflow-y-auto px-5 py-4">
        <ng-content />
      </div>
    </div>
  `,
})
export class PeraDrawerComponent {
  private readonly drawerRef = inject(PeraModalRef, { optional: true });

  readonly title = input('');

  dismiss(): void {
    this.drawerRef?.close();
  }
}
