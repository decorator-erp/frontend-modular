import { Directive, ElementRef, OnDestroy, inject, input } from '@angular/core';
import { ConnectedPosition, Overlay, OverlayRef } from '@angular/cdk/overlay';
import { ComponentPortal } from '@angular/cdk/portal';
import { ChangeDetectionStrategy, Component, signal } from '@angular/core';

@Component({
  changeDetection: ChangeDetectionStrategy.OnPush,
  template: `
    <div
      class="bg-surface text-text-primary border border-border shadow-md px-2 py-1 text-xs rounded-sm max-w-60"
      role="tooltip"
    >
      {{ text() }}
    </div>
  `,
})
export class PeraTooltipPanelComponent {
  readonly text = signal('');
}

type TooltipPosition = 'top' | 'bottom' | 'start' | 'end';

const POSITIONS: Record<TooltipPosition, ConnectedPosition> = {
  top: { originX: 'center', originY: 'top', overlayX: 'center', overlayY: 'bottom', offsetY: -6 },
  bottom: { originX: 'center', originY: 'bottom', overlayX: 'center', overlayY: 'top', offsetY: 6 },
  start: { originX: 'start', originY: 'center', overlayX: 'end', overlayY: 'center', offsetX: -6 },
  end: { originX: 'end', originY: 'center', overlayX: 'start', overlayY: 'center', offsetX: 6 },
};

@Directive({
  selector: '[peraTooltip]',
  host: {
    '(mouseenter)': 'scheduleShow()',
    '(focus)': 'scheduleShow()',
    '(mouseleave)': 'hide()',
    '(blur)': 'hide()',
  },
})
export class PeraTooltipDirective implements OnDestroy {
  private readonly overlay = inject(Overlay);
  private readonly elementRef = inject(ElementRef);

  readonly peraTooltip = input('');
  readonly peraTooltipPosition = input<TooltipPosition>('top');

  private overlayRef: OverlayRef | null = null;
  private showTimer: ReturnType<typeof setTimeout> | null = null;

  scheduleShow(): void {
    if (!this.peraTooltip()) return;
    this.showTimer = setTimeout(() => this.show(), 200);
  }

  private show(): void {
    if (this.overlayRef) return;
    const positionStrategy = this.overlay
      .position()
      .flexibleConnectedTo(this.elementRef)
      .withPositions([POSITIONS[this.peraTooltipPosition()], POSITIONS.bottom, POSITIONS.top]);

    this.overlayRef = this.overlay.create({
      positionStrategy,
      scrollStrategy: this.overlay.scrollStrategies.close(),
    });
    const ref = this.overlayRef.attach(new ComponentPortal(PeraTooltipPanelComponent));
    ref.instance.text.set(this.peraTooltip());
  }

  hide(): void {
    if (this.showTimer) {
      clearTimeout(this.showTimer);
      this.showTimer = null;
    }
    this.overlayRef?.dispose();
    this.overlayRef = null;
  }

  ngOnDestroy(): void {
    this.hide();
  }
}
