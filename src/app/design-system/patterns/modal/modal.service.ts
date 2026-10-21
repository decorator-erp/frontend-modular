import { Injectable, InjectionToken, Injector, inject } from '@angular/core';
import { Overlay, OverlayRef } from '@angular/cdk/overlay';
import { ComponentPortal, ComponentType } from '@angular/cdk/portal';

export const PERA_MODAL_DATA = new InjectionToken<unknown>('PERA_MODAL_DATA');

export interface ModalConfig {
  size?: 'sm' | 'md' | 'lg' | 'xl';
  data?: unknown;
  dismissable?: boolean;
  /**
   * Parent injector for the dialog. Dialogs are created off the ROOT injector by default, so a
   * route-provided store (e.g. `SpacesStore`) is invisible to them — pass the host component's
   * own injector to lend it. Omit for the root behaviour.
   */
  injector?: Injector;
}

export class PeraModalRef<T = unknown> {
  private resolve!: (value: T | undefined) => void;
  private readonly result = new Promise<T | undefined>((res) => (this.resolve = res));

  constructor(private readonly overlayRef: OverlayRef) {}

  close(result?: T): void {
    this.overlayRef.dispose();
    this.resolve(result);
  }

  afterClosed(): Promise<T | undefined> {
    return this.result;
  }
}

@Injectable({ providedIn: 'root' })
export class ModalService {
  private readonly overlay = inject(Overlay);
  private readonly injector = inject(Injector);

  open<T = unknown, C = unknown>(
    component: ComponentType<C>,
    config: ModalConfig = {},
  ): PeraModalRef<T> {
    const dismissable = config.dismissable ?? true;

    const overlayRef = this.overlay.create({
      hasBackdrop: true,
      backdropClass: ['bg-black/40'],
      panelClass: ['flex', 'items-center', 'justify-center'],
      positionStrategy: this.overlay.position().global().centerHorizontally().centerVertically(),
      scrollStrategy: this.overlay.scrollStrategies.block(),
      maxWidth: '90vw',
    });

    const modalRef = new PeraModalRef<T>(overlayRef);

    const injector = Injector.create({
      parent: config.injector ?? this.injector,
      providers: [
        { provide: PeraModalRef, useValue: modalRef },
        { provide: PERA_MODAL_DATA, useValue: config.data ?? null },
      ],
    });

    overlayRef.attach(new ComponentPortal(component, null, injector));

    if (dismissable) {
      overlayRef.backdropClick().subscribe(() => modalRef.close());
      overlayRef.keydownEvents().subscribe((event) => {
        if (event.key === 'Escape') modalRef.close();
      });
    }

    return modalRef;
  }
}
