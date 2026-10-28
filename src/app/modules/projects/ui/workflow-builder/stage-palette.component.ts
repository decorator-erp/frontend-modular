import { ChangeDetectionStrategy, Component, input } from '@angular/core';
import { CdkDrag, CdkDropList } from '@angular/cdk/drag-drop';
import { PALETTE_CHIPS, PaletteChip } from './builder.types';

/** Translates prototype .wb-pal — left column with draggable stage-type chips. */
@Component({
  selector: 'app-stage-palette',
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [CdkDrag, CdkDropList],
  host: { class: 'block border-e border-border bg-surface p-3.5 overflow-y-auto w-[200px]' },
  template: `
    <div class="font-mono fs-micro text-text-muted tracking-wide mx-1 mt-1 mb-3 uppercase">
      Stage types — drag to canvas
    </div>
    <div
      cdkDropList
      [cdkDropListData]="chips"
      [cdkDropListConnectedTo]="connectedTo()"
      cdkDropListSortingDisabled
    >
      @for (chip of chips; track chip.kind) {
        <div
          cdkDrag
          [cdkDragData]="chip"
          class="flex items-start gap-2.5 p-2.5 border border-border bg-surface mb-2 cursor-grab
                 hover:border-text-muted hover:bg-surface-muted transition-colors active:cursor-grabbing"
        >
          <div
            class="w-icon-md h-icon-md border-[length:var(--hairline-strong)] border-text-primary flex items-center justify-center shrink-0 text-text-primary"
          >
            @switch (chip.kind) {
              @case ('Task') {
                <span
                  class="w-icon-2xs h-icon-2xs border-[length:var(--hairline-strong)] border-current"
                ></span>
              }
              @case ('Gate') {
                <span
                  class="w-icon-2xs h-icon-2xs rotate-45 border-[length:var(--hairline-strong)] border-current"
                ></span>
              }
              @case ('Approval') {
                <svg
                  width="11"
                  height="11"
                  viewBox="0 0 24 24"
                  fill="none"
                  stroke="currentColor"
                  stroke-width="2.4"
                >
                  <path d="M5 12l4 4L19 6" />
                </svg>
              }
              @case ('Milestone') {
                <span
                  class="w-icon-2xs h-icon-2xs rotate-45 bg-current border-[length:var(--hairline-strong)] border-current"
                ></span>
              }
            }
          </div>
          <div>
            <div class="fs-caption font-medium">{{ chip.title }}</div>
            <div class="font-mono fs-micro text-text-muted mt-0.5 leading-snug">
              {{ chip.description }}
            </div>
          </div>
        </div>
      }
    </div>
    <p
      class="font-mono fs-micro text-text-muted leading-relaxed mx-1 mt-3.5 pt-3 border-t border-border"
    >
      Drop a chip on the canvas to create a stage at that position.
    </p>
  `,
})
export class StagePaletteComponent {
  readonly chips: PaletteChip[] = PALETTE_CHIPS;
  /** CDK drop-list ids that accept drops from this palette (typically the canvas). */
  readonly connectedTo = input<string[]>([]);
}
