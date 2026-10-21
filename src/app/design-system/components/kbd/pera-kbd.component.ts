import { ChangeDetectionStrategy, Component, computed, input } from '@angular/core';

/**
 * `.kbd` — keyboard hint (⌘K, ⌘P…). Use `onAccent` when placed inside a
 * primary button so it reads against the accent fill.
 */
@Component({
  selector: 'pera-kbd',
  changeDetection: ChangeDetectionStrategy.OnPush,
  host: { class: 'inline-flex' },
  template: `
    <kbd class="font-mono fs-label not-italic leading-none px-1 py-px border" [class]="classes()">
      <ng-content></ng-content>
    </kbd>
  `,
})
export class PeraKbdComponent {
  readonly onAccent = input(false);

  protected readonly classes = computed(() =>
    this.onAccent()
      ? 'text-white/85 border-white/30 bg-white/15'
      : 'text-text-muted border-border bg-selected',
  );
}
