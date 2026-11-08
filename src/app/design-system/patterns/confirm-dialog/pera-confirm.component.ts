import { ChangeDetectionStrategy, Component, Injectable, inject, signal } from '@angular/core';
import { FormsModule } from '@angular/forms';
import { ModalService, PERA_MODAL_DATA, PeraModalRef } from '../modal/modal.service';
import { PeraButtonComponent } from '../../components/button/pera-button.component';
import { A11yModule } from '@angular/cdk/a11y';
import { PeraIconComponent } from '../../components/icon/pera-icon.component';
import { PeraTextareaComponent } from '../../components/textarea/pera-textarea.component';
import { PeraFormFieldComponent } from '../form-field/pera-form-field.component';

export interface ConfirmOptions {
  title: string;
  body: string;
  confirmLabel?: string;
  cancelLabel?: string;
  tone?: 'default' | 'danger';
  /**
   * An optional free-text reason under the body (`ConfirmService.openWithReason`). The confirm
   * stays enabled when it is empty: the reason is optional.
   */
  reason?: { label: string; placeholder?: string; maxLength?: number };
}

/** The answer of `ConfirmService.openWithReason`: confirmed or not, and the trimmed reason. */
export interface ConfirmWithReason {
  confirmed: boolean;
  reason: string;
}

@Component({
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [
    A11yModule,
    FormsModule,
    PeraButtonComponent,
    PeraIconComponent,
    PeraTextareaComponent,
    PeraFormFieldComponent,
  ],
  template: `
    <div
      cdkTrapFocus
      cdkTrapFocusAutoCapture
      class="bg-surface border border-border rounded-md shadow-lg w-100 max-w-[90vw]"
      role="alertdialog"
      aria-modal="true"
      [attr.aria-label]="opts.title"
    >
      <div class="flex items-start gap-3 p-4">
        <span
          class="inline-flex p-2 rounded-full shrink-0"
          [class.bg-danger-soft]="opts.tone === 'danger'"
          [class.text-danger]="opts.tone === 'danger'"
          [class.bg-accent-soft]="opts.tone !== 'danger'"
          [class.text-accent]="opts.tone !== 'danger'"
        >
          <pera-icon [name]="opts.tone === 'danger' ? 'alert-triangle' : 'info'" [size]="18" />
        </span>
        <div class="flex flex-col gap-1 min-w-0">
          <h2 class="m-0 text-base font-semibold">{{ opts.title }}</h2>
          <p class="m-0 text-sm text-text-secondary">{{ opts.body }}</p>
        </div>
      </div>
      @if (opts.reason; as r) {
        <div class="px-4 pb-4" data-confirm-reason>
          <pera-form-field [label]="r.label">
            <pera-textarea
              [rows]="3"
              [placeholder]="r.placeholder ?? ''"
              [ngModel]="reason()"
              (ngModelChange)="setReason($event)"
            />
          </pera-form-field>
        </div>
      }
      <footer class="flex justify-end gap-2 px-4 py-3 border-t border-border">
        <pera-button variant="ghost" (click)="close(false)">{{
          opts.cancelLabel || 'Cancel'
        }}</pera-button>
        <pera-button
          [variant]="opts.tone === 'danger' ? 'danger' : 'primary'"
          (click)="close(true)"
        >
          {{ opts.confirmLabel || 'Confirm' }}
        </pera-button>
      </footer>
    </div>
  `,
})
export class PeraConfirmComponent {
  readonly opts = inject(PERA_MODAL_DATA) as ConfirmOptions;
  private readonly modalRef = inject(PeraModalRef) as PeraModalRef<boolean | ConfirmWithReason>;
  readonly reason = signal('');

  setReason(value: string | null): void {
    const max = this.opts.reason?.maxLength;
    const text = value ?? '';
    this.reason.set(max ? text.slice(0, max) : text);
  }

  close(result: boolean): void {
    this.modalRef.close(
      this.opts.reason ? { confirmed: result, reason: this.reason().trim() } : result,
    );
  }
}

@Injectable({ providedIn: 'root' })
export class ConfirmService {
  private readonly modal = inject(ModalService);

  async open(options: ConfirmOptions): Promise<boolean> {
    const ref = this.modal.open<boolean>(PeraConfirmComponent, { data: options });
    return (await ref.afterClosed()) ?? false;
  }

  /** `open` with an optional free-text reason (`options.reason`); dismissing is not confirming. */
  async openWithReason(
    options: ConfirmOptions & { reason: NonNullable<ConfirmOptions['reason']> },
  ): Promise<ConfirmWithReason> {
    const ref = this.modal.open<ConfirmWithReason | boolean>(PeraConfirmComponent, {
      data: options,
    });
    const result = await ref.afterClosed();
    return typeof result === 'object' && result
      ? result
      : { confirmed: result === true, reason: '' };
  }
}
