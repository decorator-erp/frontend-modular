import { ChangeDetectionStrategy, Component, inject, signal } from '@angular/core';
import { FormsModule } from '@angular/forms';
import {
  PERA_MODAL_DATA,
  PeraButtonComponent,
  PeraFormFieldComponent,
  PeraModalComponent,
  PeraModalFooterDirective,
  PeraModalRef,
  PeraSelectComponent,
  SelectOption,
} from '@ds';

export interface PickEmployeeDialogData {
  title: string;
  options: SelectOption[];
}

/**
 * Pick one employee. Used for assigning a department head, which has no dedicated picker anywhere
 * else — the head is a plain employee id on the department.
 */
@Component({
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [
    FormsModule,
    PeraModalComponent,
    PeraModalFooterDirective,
    PeraFormFieldComponent,
    PeraSelectComponent,
    PeraButtonComponent,
  ],
  template: `
    <pera-modal [title]="data.title" size="sm">
      <pera-form-field label="Employee" [required]="true">
        <pera-select
          [options]="data.options"
          [ngModel]="selected()"
          (ngModelChange)="selected.set($event)"
          placeholder="Select an employee"
        />
      </pera-form-field>
      <div peraModalFooter class="flex gap-2">
        <pera-button variant="ghost" (click)="close()">Cancel</pera-button>
        <pera-button variant="primary" [disabled]="!selected()" (click)="confirm()">
          Assign
        </pera-button>
      </div>
    </pera-modal>
  `,
})
export class PickEmployeeDialogComponent {
  private readonly modalRef = inject(PeraModalRef) as PeraModalRef<string | null>;
  readonly data = inject(PERA_MODAL_DATA) as PickEmployeeDialogData;

  readonly selected = signal<string | null>(null);

  close(): void {
    this.modalRef.close(null);
  }

  confirm(): void {
    this.modalRef.close(this.selected());
  }
}
