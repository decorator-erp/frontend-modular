import { ChangeDetectionStrategy, Component, inject, input, signal } from '@angular/core';
import { FormBuilder, ReactiveFormsModule, Validators } from '@angular/forms';
import { CrmItemService } from '../../data/crm-item.service';
import { ErrorHandlerService, friendly } from '@platform/http/error-handler.service';
import { CatalogService } from '@platform/i18n/catalog.service';
import type { CatalogKey } from '@platform/i18n/catalog/en';
import { RequirementCategory, RequirementPriority } from '../../model/crm-enums';
import { ToastService } from '@platform/feedback/toast.service';
import { ParsedApiError } from '@platform/types';
import { ServerErrorsDirective, firstErrorMessage } from '@shared/forms';
import {
  PeraAlertComponent,
  PeraButtonComponent,
  PeraCardComponent,
  PeraFormFieldComponent,
  PeraInputComponent,
  PeraSelectComponent,
  SelectOption,
} from '@ds';

const CATEGORY_KEYS: Record<RequirementCategory, CatalogKey> = {
  [RequirementCategory.SpaceLayout]: 'item.catLayout',
  [RequirementCategory.Style]: 'item.catSelStyle',
  [RequirementCategory.ColorPalette]: 'item.catSelColorPalette',
  [RequirementCategory.Materials]: 'item.catSelMaterials',
  [RequirementCategory.Furniture]: 'item.catFurn1',
  [RequirementCategory.Lighting]: 'item.catLighting',
  [RequirementCategory.Budget]: 'item.catSelBudget',
  [RequirementCategory.Timeline]: 'item.catSelTimeline',
  [RequirementCategory.Technical]: 'item.catSelTechnical',
  [RequirementCategory.Other]: 'common.other',
};
const PRIORITY_KEYS: Record<RequirementPriority, CatalogKey> = {
  [RequirementPriority.Low]: 'item.prLow',
  [RequirementPriority.Medium]: 'item.prMed',
  [RequirementPriority.High]: 'item.prHigh',
  [RequirementPriority.Urgent]: 'item.prUrgent',
};

/**
 * The client mobile add-requirement form (T087, T088) — phone-first, produces a
 * **Trusted** item with no approval step (FR-012). `POST /portal/requirement-items`
 * carries NO source fields at all — a client-written requirement never cites a
 * meeting/brief/note.
 *
 * **Closed-period edge case (T088, US4 scenario 5)**: when `periodId` is absent (the
 * host resolves it from the project's open period and passes `null` when there is
 * none), the client is told the period is closed and how to have it reopened — never a
 * generic error, and never allowed to add into it.
 */
@Component({
  selector: 'app-crm-add-requirement',
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [
    ReactiveFormsModule,
    ServerErrorsDirective,
    PeraAlertComponent,
    PeraButtonComponent,
    PeraCardComponent,
    PeraFormFieldComponent,
    PeraInputComponent,
    PeraSelectComponent,
  ],
  host: { class: 'block max-w-full' },
  template: `
    @if (!periodId()) {
      <pera-card>
        <pera-alert tone="warning">{{ catalog.t('client.caPeriodClosed') }}</pera-alert>
      </pera-card>
    } @else if (done()) {
      <pera-card>
        <div class="flex flex-col gap-2 p-1">
          <div class="font-semibold text-text-primary">{{ catalog.t('client.caDoneT') }}</div>
          <p class="fs-body-sm text-text-secondary m-0">{{ catalog.t('client.caDoneB') }}</p>
          <pera-button variant="secondary" size="sm" (click)="reset()">{{
            catalog.t('client.caReq')
          }}</pera-button>
        </div>
      </pera-card>
    } @else {
      <pera-card>
        <form [formGroup]="form" [serverErrors]="serverError()" class="flex flex-col gap-4 p-1">
          <p class="fs-caption text-text-secondary m-0">{{ catalog.t('client.caSub') }}</p>

          <pera-form-field
            [label]="catalog.t('client.caReq')"
            [required]="true"
            [error]="errorOf('title')"
          >
            <pera-input formControlName="title" [error]="errorOf('title')" />
          </pera-form-field>

          <pera-form-field [label]="catalog.t('brief.fCategory')" [required]="true">
            <pera-select formControlName="category" [options]="categoryOptions" />
          </pera-form-field>

          <div class="grid grid-cols-2 gap-x-4 gap-y-4">
            <pera-form-field
              [label]="catalog.t('brief.room')"
              [hint]="catalog.t('common.optionalLbl')"
            >
              <pera-input formControlName="room" />
            </pera-form-field>
            <pera-form-field [label]="catalog.t('item.priority')">
              <pera-select formControlName="priority" [options]="priorityOptions" />
            </pera-form-field>
          </div>

          <pera-form-field
            [label]="catalog.t('brief.entryReqsL')"
            [hint]="catalog.t('common.optionalLbl')"
          >
            <pera-input formControlName="details" />
          </pera-form-field>

          @if (serverError()) {
            <pera-alert tone="danger">{{ serverError()?.generalMessage }}</pera-alert>
          }

          <pera-button variant="primary" [loading]="submitting()" (click)="submit()">{{
            catalog.t('client.caReq')
          }}</pera-button>
        </form>
      </pera-card>
    }
  `,
})
export class CrmAddRequirementComponent {
  private readonly fb = inject(FormBuilder);
  private readonly items = inject(CrmItemService);
  private readonly errorHandler = inject(ErrorHandlerService);
  private readonly toast = inject(ToastService);
  protected readonly catalog = inject(CatalogService);

  readonly projectId = input.required<string>();
  /** `null` ⇒ the period is closed (T088) — the form does not render. */
  readonly periodId = input.required<string | null>();

  protected readonly categoryOptions: SelectOption[] = Object.keys(CATEGORY_KEYS)
    .map(Number)
    .map((value) => ({
      value: String(value),
      label: this.catalog.t(CATEGORY_KEYS[value as RequirementCategory]),
    }));
  protected readonly priorityOptions: SelectOption[] = Object.keys(PRIORITY_KEYS)
    .map(Number)
    .map((value) => ({
      value: String(value),
      label: this.catalog.t(PRIORITY_KEYS[value as RequirementPriority]),
    }));

  readonly form = this.fb.nonNullable.group({
    title: ['', [Validators.required, Validators.maxLength(200)]],
    category: [String(RequirementCategory.SpaceLayout), [Validators.required]],
    room: [''],
    priority: [String(RequirementPriority.Medium)],
    details: ['', [Validators.maxLength(2000)]],
  });

  readonly serverError = signal<ParsedApiError | null>(null);
  readonly submitting = signal(false);
  readonly done = signal(false);

  errorOf(name: string): string {
    const control = this.form.get(name);
    return control && control.touched && control.errors ? firstErrorMessage(control.errors) : '';
  }

  reset(): void {
    this.done.set(false);
    this.form.reset({
      title: '',
      category: String(RequirementCategory.SpaceLayout),
      room: '',
      priority: String(RequirementPriority.Medium),
      details: '',
    });
  }

  submit(): void {
    const periodId = this.periodId();
    if (!periodId || this.form.invalid) {
      this.form.markAllAsTouched();
      return;
    }
    this.submitting.set(true);
    this.serverError.set(null);
    const v = this.form.getRawValue();

    this.items
      .portalCreate({
        projectId: this.projectId(),
        periodId,
        category: Number(v.category),
        title: v.title.trim(),
        priority: Number(v.priority),
        room: v.room.trim() || null,
        description: v.details.trim() || null,
      })
      .subscribe({
        next: () => {
          this.submitting.set(false);
          this.done.set(true);
          this.toast.show({ tone: 'success', message: this.catalog.t('toast.itemAdded') });
        },
        error: (err) => {
          const parsed = this.errorHandler.parse(err);
          this.serverError.set({ ...parsed, generalMessage: friendly(parsed) });
          this.submitting.set(false);
        },
      });
  }
}
