import { ChangeDetectionStrategy, Component, inject, signal } from '@angular/core';
import { HttpErrorResponse } from '@angular/common/http';
import { FormsModule } from '@angular/forms';
import {
  PERA_MODAL_DATA,
  PeraFormFieldComponent,
  PeraFormModalComponent,
  PeraInputComponent,
  PeraModalRef,
  PeraRadioComponent,
  RadioOption,
} from '@ds';
import { ErrorHandlerService, friendly } from '@platform/http/error-handler.service';
import { CatalogService } from '@platform/i18n/catalog.service';
import type { CatalogKey } from '@platform/i18n/catalog/en';
import { PERM } from '@platform/permissions';
import { CrmClientChildrenService } from '../../data/crm-client-children.service';
import type { CrmClientChild } from '../../model';

export interface ClientChildFormData {
  clientId: string;
  /** Present → edit that child. */
  child?: CrmClientChild;
}

const CHILD_ERRORS: Record<string, CatalogKey> = {
  'crm.client_children.InvalidAge': 'kids.err.InvalidAge',
  'crm.client_children.InvalidGender': 'kids.err.InvalidGender',
};

/**
 * Sync F4b: add or edit one child of a client — `POST /clients/{id}/children` or
 * `PUT /clients/{id}/children/{childId}`, body `{ gender: 'M'|'F', age }` (dms ClientEndpoints.cs:73,86;
 * `clients.manage_children`). Age 0–120. Closes with `true` after a save.
 */
@Component({
  selector: 'app-crm-client-child-form',
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [
    FormsModule,
    PeraFormFieldComponent,
    PeraFormModalComponent,
    PeraInputComponent,
    PeraRadioComponent,
  ],
  template: `
    <pera-form-modal
      size="sm"
      [eyebrow]="
        data.child ? 'PUT /api/clients/{id}/children/{childId}' : 'POST /api/clients/{id}/children'
      "
      [title]="t(data.child ? 'kids.editTitle' : 'kids.newTitle')"
      [permission]="perm"
      [cancelLabel]="t('common.cancel')"
      [submitLabel]="t('kids.save')"
      [submittingLabel]="t('common.saving')"
      [submitting]="busy()"
      [errorMessage]="serverError()"
      (submitted)="submit()"
      (cancelled)="ref.close(false)"
    >
      <div class="flex flex-col gap-4">
        <pera-form-field [label]="t('kids.gender')" [required]="true" [error]="shown('gender')">
          <pera-radio
            [inline]="true"
            [options]="genderOptions"
            [ngModel]="gender()"
            (ngModelChange)="gender.set($event)"
            data-gender
          />
        </pera-form-field>
        <pera-form-field [label]="t('kids.age')" [required]="true" [error]="shown('age')">
          <pera-input
            type="number"
            [ngModel]="age()"
            (ngModelChange)="age.set($event ?? '')"
            [error]="shown('age')"
            data-age
          />
        </pera-form-field>
      </div>
    </pera-form-modal>
  `,
})
export class CrmClientChildFormComponent {
  private readonly api = inject(CrmClientChildrenService);
  private readonly errors = inject(ErrorHandlerService);
  private readonly catalog = inject(CatalogService);
  readonly ref = inject(PeraModalRef) as PeraModalRef<boolean>;
  readonly data = inject(PERA_MODAL_DATA) as ClientChildFormData;

  readonly perm = PERM.clients.manageChildren;
  readonly genderOptions: RadioOption[] = [
    { value: 'M', label: this.t('kids.male') },
    { value: 'F', label: this.t('kids.female') },
  ];
  readonly gender = signal<string>(this.data.child?.gender ?? '');
  readonly age = signal<string>(this.data.child ? String(this.data.child.age) : '');
  readonly busy = signal(false);
  readonly serverError = signal<string | null>(null);
  private readonly attempted = signal(false);

  t(key: string): string {
    return this.catalog.t(key as CatalogKey);
  }

  shown(field: 'gender' | 'age'): string {
    if (!this.attempted()) return '';
    if (field === 'gender' && this.gender() !== 'M' && this.gender() !== 'F')
      return this.t('kids.errGender');
    const age = Number(this.age());
    if (field === 'age' && (this.age() === '' || !Number.isInteger(age) || age < 0 || age > 120))
      return this.t('kids.errAge');
    return '';
  }

  submit(): void {
    this.attempted.set(true);
    if (this.shown('gender') || this.shown('age') || this.busy()) return;
    const body = { gender: this.gender() as 'M' | 'F', age: Number(this.age()) };
    const call = this.data.child
      ? this.api.updateChild(this.data.clientId, this.data.child.id, body)
      : this.api.addChild(this.data.clientId, body);
    this.busy.set(true);
    this.serverError.set(null);
    call.subscribe({
      next: () => {
        this.busy.set(false);
        this.ref.close(true);
      },
      error: (err: HttpErrorResponse) => {
        this.busy.set(false);
        const parsed = this.errors.parse(err);
        const key = parsed.code ? CHILD_ERRORS[parsed.code] : undefined;
        this.serverError.set(key ? this.t(key) : friendly(parsed));
      },
    });
  }
}
