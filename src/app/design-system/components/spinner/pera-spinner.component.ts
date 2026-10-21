import { ChangeDetectionStrategy, Component, computed, input } from '@angular/core';

const SIZE_PX = { xs: 12, sm: 16, md: 24 } as const;

@Component({
  selector: 'pera-spinner',
  changeDetection: ChangeDetectionStrategy.OnPush,
  host: { class: 'inline-flex', role: 'status', '[attr.aria-label]': '"Loading"' },
  template: `
    <span
      class="block border-2 border-current border-t-transparent rounded-full animate-spin"
      [class.text-accent]="tone() === 'accent'"
      [style.width.px]="px()"
      [style.height.px]="px()"
    ></span>
  `,
})
export class PeraSpinnerComponent {
  readonly size = input<'xs' | 'sm' | 'md'>('sm');
  readonly tone = input<'current' | 'accent'>('current');

  readonly px = computed(() => SIZE_PX[this.size()]);
}
