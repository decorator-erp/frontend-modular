import { ChangeDetectionStrategy, Component, computed, inject, input } from '@angular/core';
import { PermissionsService } from '@platform/permissions/permissions.service';
import { PeraIconComponent } from '../../components/icon/pera-icon.component';
import { PeraButtonComponent } from '../../components/button/pera-button.component';

export interface EmptyCta {
  label: string;
  action: () => void;
  capability?: string;
}

@Component({
  selector: 'pera-empty',
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [PeraIconComponent, PeraButtonComponent],
  host: { class: 'block' },
  template: `
    <div class="flex flex-col items-center justify-center text-center gap-2 py-12 max-w-70 mx-auto">
      <pera-icon [name]="iconName()" [size]="32" class="text-text-muted" />
      <p class="m-0 text-sm font-medium text-text-primary">{{ title() }}</p>
      @if (description()) {
        <p class="m-0 fs-body-sm text-text-muted">{{ description() }}</p>
      }
      @if (cta() && ctaAllowed()) {
        <pera-button variant="secondary" size="sm" class="mt-2" (click)="cta()!.action()">
          {{ cta()!.label }}
        </pera-button>
      }
    </div>
  `,
})
export class PeraEmptyComponent {
  private readonly permissions = inject(PermissionsService);

  readonly title = input.required<string>();
  readonly description = input<string | undefined>(undefined);
  readonly iconName = input('inbox');
  readonly cta = input<EmptyCta | undefined>(undefined);

  readonly ctaAllowed = computed(() => {
    const capability = this.cta()?.capability;
    return !capability || this.permissions.can(capability);
  });
}
