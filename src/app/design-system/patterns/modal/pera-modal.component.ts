import {
  ChangeDetectionStrategy,
  Component,
  Directive,
  computed,
  contentChild,
  inject,
  input,
  output,
} from '@angular/core';
import { A11yModule } from '@angular/cdk/a11y';
import { PeraIconComponent } from '../../components/icon/pera-icon.component';
import { PeraButtonComponent } from '../../components/button/pera-button.component';
import { PeraModalRef } from './modal.service';

/** Marks projected content as the modal footer (overrides the default one). */
@Directive({ selector: '[peraModalFooter]' })
export class PeraModalFooterDirective {}

const WIDTHS = { sm: 400, md: 560, lg: 760, xl: 960 } as const;

@Component({
  selector: 'pera-modal',
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [A11yModule, PeraIconComponent, PeraButtonComponent],
  host: { class: 'block' },
  template: `
    <div
      cdkTrapFocus
      cdkTrapFocusAutoCapture
      class="bg-surface border border-border rounded-md shadow-lg flex flex-col max-h-[85vh] max-w-[90vw]"
      [style.width.px]="width()"
      role="dialog"
      aria-modal="true"
      [attr.aria-label]="title()"
    >
      <header
        class="flex items-center justify-between gap-4 px-4 py-3 border-b border-border shrink-0"
      >
        <h2 class="m-0 text-base font-semibold">{{ title() }}</h2>
        @if (dismissable()) {
          <button
            type="button"
            class="inline-flex p-1 rounded-sm text-text-muted hover:text-text-primary hover:bg-surface-muted
                   cursor-pointer outline-none focus-visible:outline-2 focus-visible:outline-accent"
            aria-label="Close"
            (click)="dismiss()"
          >
            <pera-icon name="x" [size]="16" />
          </button>
        }
      </header>

      <div class="p-4 overflow-auto">
        <ng-content />
      </div>

      <footer class="flex justify-end gap-2 px-4 py-3 border-t border-border shrink-0">
        @if (customFooter()) {
          <ng-content select="[peraModalFooter]" />
        } @else {
          <pera-button variant="ghost" (click)="cancel.emit(); dismiss()">{{
            cancelLabel()
          }}</pera-button>
          <pera-button variant="primary" [loading]="confirmLoading()" (click)="confirm.emit()">
            {{ confirmLabel() }}
          </pera-button>
        }
      </footer>
    </div>
  `,
})
export class PeraModalComponent {
  private readonly modalRef = inject(PeraModalRef, { optional: true });

  readonly title = input('');
  readonly size = input<'sm' | 'md' | 'lg' | 'xl'>('md');
  readonly dismissable = input(true);
  readonly cancelLabel = input('Cancel');
  readonly confirmLabel = input('Confirm');
  readonly confirmLoading = input(false);

  readonly confirm = output<void>();
  readonly cancel = output<void>();

  readonly customFooter = contentChild(PeraModalFooterDirective);
  readonly width = computed(() => WIDTHS[this.size()]);

  dismiss(): void {
    this.modalRef?.close();
  }
}
