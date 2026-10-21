import { ChangeDetectionStrategy, Component, computed, input } from '@angular/core';

@Component({
  selector: 'pera-skeleton',
  changeDetection: ChangeDetectionStrategy.OnPush,
  host: { class: 'block' },
  template: `
    <div
      class="animate-pulse bg-surface-muted {{ roundedClass() }}"
      [style.height.px]="height()"
      [style.width]="widthStyle()"
      aria-hidden="true"
    ></div>
  `,
})
export class PeraSkeletonComponent {
  readonly height = input(16);
  readonly width = input<string | number>('100%');
  readonly rounded = input<'xs' | 'sm' | 'md' | 'lg' | 'full'>('sm');

  readonly widthStyle = computed(() => {
    const w = this.width();
    return typeof w === 'number' ? `${w}px` : w;
  });

  readonly roundedClass = computed(() => `rounded-${this.rounded()}`);
}
