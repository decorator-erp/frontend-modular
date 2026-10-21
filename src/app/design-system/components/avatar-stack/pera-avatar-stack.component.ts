import { ChangeDetectionStrategy, Component, computed, input } from '@angular/core';

import { PeraAvatarComponent } from '../avatar/pera-avatar.component';

/** A single person rendered inside a {@link PeraAvatarStackComponent}. */
export interface AvatarStackPerson {
  readonly name: string;
  readonly imageUrl?: string;
}

/**
 * `pera-avatar-stack` — an overlapping row of `pera-avatar`s.
 *
 * Renders up to `max` avatars (size `sm`); any beyond `max` collapse into a
 * `+N` overflow chip. When `unassigned` is set and there are no people, a
 * single dashed-border placeholder is shown instead.
 *
 * Overlap is achieved with a negative *logical* margin (`-ms-2`) on every item
 * after the first, and each avatar gets a `ring-2 ring-surface` for separation.
 */
@Component({
  selector: 'pera-avatar-stack',
  changeDetection: ChangeDetectionStrategy.OnPush,
  host: { class: 'inline-flex items-center' },
  imports: [PeraAvatarComponent],
  template: `
    @if (visiblePeople().length > 0) {
      @for (person of visiblePeople(); track $index) {
        <span class="inline-flex rounded-full ring-2 ring-surface {{ $first ? '' : '-ms-2' }}">
          <pera-avatar size="sm" [name]="person.name" [src]="person.imageUrl" />
        </span>
      }
      @if (overflowCount() > 0) {
        <span
          class="-ms-2 inline-flex h-6 w-6 items-center justify-center rounded-full border border-surface bg-surface-muted text-xs font-semibold text-text-secondary ring-2 ring-surface"
          >+{{ overflowCount() }}</span
        >
      }
    } @else if (unassigned()) {
      <span
        data-unassigned
        aria-label="Unassigned"
        class="inline-flex h-6 w-6 items-center justify-center rounded-full border-2 border-dashed border-border-strong text-text-muted"
      ></span>
    }
  `,
})
export class PeraAvatarStackComponent {
  readonly people = input<AvatarStackPerson[]>([]);
  readonly max = input<number>(4);
  readonly unassigned = input<boolean>(false);

  readonly visiblePeople = computed(() => this.people().slice(0, this.max()));
  readonly overflowCount = computed(() => Math.max(0, this.people().length - this.max()));
}
