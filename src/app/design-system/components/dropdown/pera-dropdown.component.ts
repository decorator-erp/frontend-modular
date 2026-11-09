import { ChangeDetectionStrategy, Component, input, output, signal } from '@angular/core';
import { CdkConnectedOverlay, CdkOverlayOrigin } from '@angular/cdk/overlay';

/**
 * CDK-overlay dropdown menu. Square corners, hairline border, mono items.
 * Project a `[trigger]` and the menu body as default content.
 *
 * ```html
 * <pera-dropdown>
 *   <pera-button trigger iconOnly iconStart="more-horizontal" size="sm" variant="ghost" />
 *   <button role="menuitem" class="…">Edit</button>
 * </pera-dropdown>
 * ```
 */
@Component({
  selector: 'pera-dropdown',
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
      [cdkConnectedOverlayMinWidth]="minWidth()"
      [cdkConnectedOverlayHasBackdrop]="true"
      cdkConnectedOverlayBackdropClass="cdk-overlay-transparent-backdrop"
      (backdropClick)="close()"
      (detach)="close()"
      (overlayKeydown)="onKeydown($event)"
    >
      <div
        class="bg-surface border border-border rounded-lg shadow-md py-1 max-h-80 overflow-auto font-mono text-xs leading-normal"
        role="menu"
        (click)="onPanelClick()"
      >
        <ng-content></ng-content>
      </div>
    </ng-template>
  `,
})
export class PeraDropdownComponent {
  readonly minWidth = input(176);
  readonly closeOnSelect = input(true);
  readonly openChange = output<boolean>();

  readonly open = signal(false);

  toggle(): void {
    this.open() ? this.close() : this.openMenu();
  }

  openMenu(): void {
    this.open.set(true);
    this.openChange.emit(true);
  }

  close(): void {
    if (!this.open()) return;
    this.open.set(false);
    this.openChange.emit(false);
  }

  onPanelClick(): void {
    if (this.closeOnSelect()) this.close();
  }

  onKeydown(event: KeyboardEvent): void {
    if (event.key === 'Escape') {
      event.preventDefault();
      this.close();
    }
  }
}
