import { ChangeDetectionStrategy, Component, computed, input } from '@angular/core';

const SIZE_PX = { xs: 20, sm: 24, md: 32, lg: 40 } as const;
const TEXT_CLASS = { xs: 'fs-micro', sm: 'fs-label', md: 'text-xs', lg: 'text-sm' } as const;

@Component({
  selector: 'pera-avatar',
  changeDetection: ChangeDetectionStrategy.OnPush,
  host: { class: 'inline-flex shrink-0' },
  template: `
    @if (src()) {
      <img
        [src]="src()"
        [alt]="alt() || name() || ''"
        class="rounded-full object-cover"
        [style.width.px]="px()"
        [style.height.px]="px()"
      />
    } @else {
      <span
        class="rounded-full bg-accent-soft text-accent font-semibold inline-flex items-center justify-center uppercase select-none {{
          textClass()
        }}"
        [style.width.px]="px()"
        [style.height.px]="px()"
        [attr.aria-label]="alt() || name() || null"
        >{{ initials() }}</span
      >
    }
  `,
})
export class PeraAvatarComponent {
  readonly name = input<string | undefined>(undefined);
  readonly src = input<string | undefined>(undefined);
  readonly size = input<'xs' | 'sm' | 'md' | 'lg'>('md');
  readonly alt = input<string | undefined>(undefined);

  readonly px = computed(() => SIZE_PX[this.size()]);
  readonly textClass = computed(() => TEXT_CLASS[this.size()]);

  readonly initials = computed(() => {
    const n = (this.name() ?? '').trim();
    if (!n) return '?';
    const words = n.split(/\s+/);
    const first = words[0]?.charAt(0) ?? '';
    const last = words.length > 1 ? words[words.length - 1].charAt(0) : '';
    return first + last || first || '?';
  });
}
