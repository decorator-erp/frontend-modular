import { ChangeDetectionStrategy, Component, computed, inject, signal } from '@angular/core';
import { FormsModule } from '@angular/forms';
import {
  PERA_MODAL_DATA,
  PeraAlertComponent,
  PeraCheckboxComponent,
  PeraFormFieldComponent,
  PeraFormModalComponent,
  PeraInputComponent,
  PeraModalRef,
  PeraSelectComponent,
  PeraTextareaComponent,
  type SelectOption,
} from '@ds';
import { CatalogService } from '@platform/i18n/catalog.service';
import type { WriteOutcome } from '../../model/site-errors';

export type DefValue = string | number | boolean | null;
export type DefValues = Record<string, DefValue>;

/** One field of a definitions form. `show` hides it for the current values (e.g. limits by type). */
export interface DefField {
  key: string;
  label: string;
  kind: 'text' | 'number' | 'textarea' | 'select' | 'checkbox';
  required?: boolean;
  disabled?: boolean;
  hint?: string;
  dir?: 'ltr' | 'rtl' | 'auto';
  options?: SelectOption[];
  /** Spans both grid columns. */
  wide?: boolean;
  show?: (v: DefValues) => boolean;
}

export interface DefFormData {
  title: string;
  subtitle?: string;
  submitLabel: string;
  fields: DefField[];
  initial: DefValues;
  /** An info note under the form (system rename rule, shape lock…). */
  note?: string;
  noteTone?: 'info' | 'warning';
  /** Client checks (spec §5): field key → message. */
  validate: (v: DefValues) => Record<string, string>;
  save: (v: DefValues) => Promise<WriteOutcome<unknown>>;
}

/**
 * sites S-10: one form dialog for the definitions admin (module, item, shape, option, attach —
 * prototype `moduleForm` / `itemForm` / `optForm`, `sites.js:822-947`). The caller describes the
 * fields; the dialog validates (§5 limits), saves, and shows the refusal inline with its code
 * (`sites.CodeTaken`, `SystemDefinitionNotRenameable`, `LimitNotLegalForType`, `ItemLocked`,
 * `OptionsRequireSelect`, `AlreadyLinked`…) or per field for a `Request.<Field>` validation error.
 */
@Component({
  selector: 'app-site-def-form-dialog',
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [
    FormsModule,
    PeraAlertComponent,
    PeraCheckboxComponent,
    PeraFormFieldComponent,
    PeraFormModalComponent,
    PeraInputComponent,
    PeraSelectComponent,
    PeraTextareaComponent,
  ],
  template: `
    <pera-form-modal
      size="lg"
      [title]="data.title"
      [subtitle]="data.subtitle ?? ''"
      [submitLabel]="data.submitLabel"
      [cancelLabel]="catalog.t('sv.cancel')"
      [submitting]="saving()"
      [errorMessage]="banner()"
      [errorCode]="bannerCode()"
      (submitted)="submit()"
      (cancelled)="ref.close()"
    >
      <div class="grid gap-4 sm:grid-cols-2">
        @for (f of visibleFields(); track f.key) {
          <div [class]="f.wide ? 'sm:col-span-2' : ''">
            @if (f.kind === 'checkbox') {
              <div class="flex items-center h-full">
                <pera-checkbox
                  [disabled]="!!f.disabled"
                  [ngModel]="!!values()[f.key]"
                  (ngModelChange)="set(f.key, $event)"
                  [attr.data-def-field]="f.key"
                  >{{ f.label }}</pera-checkbox
                >
              </div>
            } @else {
              <pera-form-field
                [label]="f.label"
                [required]="!!f.required"
                [hint]="f.hint"
                [error]="errors()[f.key]"
              >
                @switch (f.kind) {
                  @case ('select') {
                    <pera-select
                      [options]="f.options ?? []"
                      placeholder="—"
                      [disabled]="!!f.disabled"
                      [ngModel]="values()[f.key]"
                      (ngModelChange)="set(f.key, $event)"
                      [attr.data-def-field]="f.key"
                    />
                  }
                  @case ('textarea') {
                    <pera-textarea
                      [rows]="3"
                      [attr.dir]="f.dir ?? 'auto'"
                      [disabled]="!!f.disabled"
                      [ngModel]="values()[f.key] ?? ''"
                      (ngModelChange)="set(f.key, $event)"
                      [attr.data-def-field]="f.key"
                    />
                  }
                  @default {
                    <pera-input
                      [type]="f.kind === 'number' ? 'number' : 'text'"
                      [attr.dir]="f.dir ?? (f.kind === 'number' ? 'ltr' : 'auto')"
                      [disabled]="!!f.disabled"
                      [error]="errors()[f.key]"
                      [ngModel]="values()[f.key] ?? ''"
                      (ngModelChange)="set(f.key, $event)"
                      [attr.data-def-field]="f.key"
                    />
                  }
                }
              </pera-form-field>
            }
          </div>
        }
      </div>
      @if (data.note) {
        <pera-alert class="block mt-4" [tone]="data.noteTone ?? 'info'" data-def-note>{{
          data.note
        }}</pera-alert>
      }
    </pera-form-modal>
  `,
})
export class SiteDefFormDialogComponent {
  readonly ref = inject(PeraModalRef) as PeraModalRef<boolean>;
  readonly data = inject(PERA_MODAL_DATA) as DefFormData;
  protected readonly catalog = inject(CatalogService);

  readonly values = signal<DefValues>({ ...this.data.initial });
  readonly errors = signal<Record<string, string>>({});
  readonly saving = signal(false);
  readonly banner = signal<string | null>(null);
  readonly bannerCode = signal<string | null>(null);

  protected readonly visibleFields = computed(() => {
    const v = this.values();
    return this.data.fields.filter((f) => !f.show || f.show(v));
  });

  set(key: string, value: DefValue): void {
    this.values.update((v) => ({ ...v, [key]: value }));
  }

  async submit(): Promise<void> {
    if (this.saving()) return;
    const v = this.values();
    const errors = this.data.validate(v);
    this.errors.set(errors);
    if (Object.keys(errors).length) return;
    this.banner.set(null);
    this.bannerCode.set(null);
    this.saving.set(true);
    const outcome = await this.data.save(v);
    this.saving.set(false);
    if (outcome.ok) return this.ref.close(true);
    if (outcome.reloaded) return this.ref.close(false);
    this.errors.set(outcome.fieldErrors ?? {});
    this.banner.set(outcome.message ?? null);
    this.bannerCode.set(outcome.code ?? null);
  }
}
