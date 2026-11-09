import { ChangeDetectionStrategy, Component, input, signal } from '@angular/core';
import { CdkConnectedOverlay, CdkOverlayOrigin } from '@angular/cdk/overlay';

/**
 * CDK-overlay popover — same square, hairline-bordered wrapper as the
 * dropdown but with a free-form content slot. Drives KPI info tooltips and
 * chip filter popups. Click toggles; backdrop/Escape close.
 */
@Component({
  selector: 'pera-popover',
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [CdkConnectedOverlay, CdkOverlayOrigin],
  host: { class: 'inline-flex' },
  template: `
    <span cdkOverlayOrigin #origin="cdkOverlayOrigin" class="inline-flex" (click)="toggle()">
      <ng-content select="[trigger]"></ng-content>
    </span>

    <ng-template
      cdkConnectedOverlay
      [cdkConnectedOverlayOrigin]="origin"
      [cdkConnectedOverlayOpen]="open()"
      [cdkConnectedOverlayHasBackdrop]="true"
      cdkConnectedOverlayBackdropClass="cdk-overlay-transparent-backdrop"
      (backdropClick)="close()"
      (detach)="close()"
      (overlayKeydown)="onKeydown($event)"
    >
      <div
        class="bg-surface border border-border rounded-lg shadow-md p-3 max-w-xs text-xs leading-normal"
        role="dialog"
      >
        <ng-content></ng-content>
      </div>
    </ng-template>
  `,
})
export class PeraPopoverComponent {
  readonly disabled = input(false);
  readonly open = signal(false);

  toggle(): void {
    if (this.disabled()) return;
    this.open.update((o) => !o);
  }

  close(): void {
    this.open.set(false);
  }

  onKeydown(event: KeyboardEvent): void {
    if (event.key === 'Escape') {
      event.preventDefault();
      this.close();
    }
  }
}
