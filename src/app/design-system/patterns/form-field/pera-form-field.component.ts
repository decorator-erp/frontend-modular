import { ChangeDetectionStrategy, Component, input } from '@angular/core';

@Component({
  selector: 'pera-form-field',
  changeDetection: ChangeDetectionStrategy.OnPush,
  host: { class: 'block' },
  template: `
    <div class="flex flex-col gap-1">
      @if (label()) {
        <label class="fs-body-sm font-medium text-text-secondary" [attr.for]="for() || null">
          {{ label() }}
          @if (required()) {
            <span class="text-danger ms-0.5" aria-hidden="true">*</span>
          }
        </label>
      }
      <ng-content />
      @if (error()) {
        <span class="text-xs text-danger" role="alert">{{ error() }}</span>
      } @else if (hint()) {
        <span class="text-xs text-text-muted">{{ hint() }}</span>
      }
    </div>
  `,
})
export class PeraFormFieldComponent {
  readonly label = input<string | undefined>(undefined);
  readonly required = input(false);
  readonly hint = input<string | undefined>(undefined);
  readonly error = input<string | undefined>(undefined);
  readonly for = input<string | undefined>(undefined);
}
