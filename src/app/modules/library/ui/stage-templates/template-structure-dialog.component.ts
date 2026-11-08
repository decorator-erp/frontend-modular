import { ChangeDetectionStrategy, Component, computed, inject, signal } from '@angular/core';
import { FormsModule } from '@angular/forms';
import { HttpErrorResponse } from '@angular/common/http';
import { Observable } from 'rxjs';
import {
  PERA_MODAL_DATA,
  PeraCheckboxComponent,
  PeraFormFieldComponent,
  PeraFormModalComponent,
  PeraInputComponent,
  PeraModalRef,
  PeraSelectComponent,
  PeraTextareaComponent,
  SelectOption,
} from '@ds';
import { ErrorHandlerService, friendly } from '@platform/http/error-handler.service';
import { CatalogService } from '@platform/i18n/catalog.service';
import type { CatalogKey } from '@platform/i18n/catalog/en';
import { PERM } from '@platform/permissions';
import { StageTemplateStructureService } from '../../data/stage-template-structure.service';
import type {
  TemplateStage,
  TemplateStageTask,
  TemplateSubTask,
} from '../../model/stage-template.model';

/**
 * One level of the template structure (sync F1). `parentId` is the template id for a stage, the
 * stage id for a task and the task id for a sub-task. `item` present → edit it.
 */
export type TemplateStructureDialogData =
  | { kind: 'stage'; parentId: string; item?: TemplateStage; nextOrder: number }
  | {
      kind: 'task';
      parentId: string;
      item?: TemplateStageTask;
      nextOrder: number;
      departments: readonly { id: string; name: string }[];
    }
  | { kind: 'subTask'; parentId: string; item?: TemplateSubTask; nextOrder: number };

const TITLES: Record<TemplateStructureDialogData['kind'], [CatalogKey, CatalogKey]> = {
  stage: ['tplx.dlg.newStage', 'tplx.dlg.editStage'],
  task: ['tplx.dlg.newTask', 'tplx.dlg.editTask'],
  subTask: ['tplx.dlg.newSub', 'tplx.dlg.editSub'],
};

const EYEBROWS: Record<TemplateStructureDialogData['kind'], [string, string]> = {
  stage: ['POST /api/stage-templates/{id}/stages', 'PUT /api/stages/{id}'],
  task: ['POST /api/stages/{id}/tasks', 'PUT /api/stage-tasks/{id}'],
  subTask: ['POST /api/stage-tasks/{id}/sub-tasks', 'PUT /api/stage-sub-tasks/{id}'],
};

/**
 * Add or edit a template stage, stage task or sub-task (dms TemplateEndpoints.cs:66-192). A stage
 * carries `weightPercent` (0–100) and an optional default fee; a task carries a relative `weight`
 * and an optional department; a sub-task carries a title and whether it is required. Closes with
 * `true` after a save; a refusal shows its catalog message in the banner.
 */
@Component({
  selector: 'app-template-structure-dialog',
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [
    FormsModule,
    PeraCheckboxComponent,
    PeraFormFieldComponent,
    PeraFormModalComponent,
    PeraInputComponent,
    PeraSelectComponent,
    PeraTextareaComponent,
  ],
  template: `
    <pera-form-modal
      size="md"
      [eyebrow]="eyebrow"
      [title]="t(titleKey)"
      [permission]="perm"
      [cancelLabel]="t('tplx.dlg.cancel')"
      [submitLabel]="t(isEdit ? 'tplx.dlg.save' : 'tplx.dlg.create')"
      [submittingLabel]="t('tplx.dlg.saving')"
      [submitting]="busy()"
      [errorMessage]="serverError()"
      (submitted)="submit()"
      (cancelled)="close(false)"
    >
      <div class="flex flex-col gap-4" data-structure-form>
        <pera-form-field
          [label]="t(data.kind === 'subTask' ? 'tplx.dlg.title' : 'tplx.dlg.name')"
          [required]="true"
          [error]="shown('name')"
        >
          <pera-input
            [ngModel]="name()"
            (ngModelChange)="name.set($event ?? '')"
            [error]="shown('name')"
            data-name
          />
        </pera-form-field>

        <div class="grid grid-cols-1 sm:grid-cols-2 gap-3">
          <pera-form-field [label]="t('tplx.dlg.order')" [required]="true" [error]="shown('order')">
            <pera-input
              type="number"
              [ngModel]="order()"
              (ngModelChange)="order.set($event ?? '')"
              [error]="shown('order')"
              data-order
            />
          </pera-form-field>

          @if (data.kind === 'stage') {
            <pera-form-field
              [label]="t('tplx.dlg.weightPercent')"
              [required]="true"
              [error]="shown('weight')"
            >
              <pera-input
                type="number"
                [ngModel]="weight()"
                (ngModelChange)="weight.set($event ?? '')"
                [error]="shown('weight')"
                data-weight
              />
            </pera-form-field>
          } @else if (data.kind === 'task') {
            <pera-form-field
              [label]="t('tplx.dlg.weight')"
              [required]="true"
              [hint]="t('tplx.dlg.weightHint')"
              [error]="shown('weight')"
            >
              <pera-input
                type="number"
                [ngModel]="weight()"
                (ngModelChange)="weight.set($event ?? '')"
                [error]="shown('weight')"
                data-weight
              />
            </pera-form-field>
          }
        </div>

        @if (data.kind === 'stage') {
          <pera-form-field
            [label]="t('tplx.dlg.defaultFee')"
            [hint]="t('tplx.dlg.defaultFeeHint')"
            [error]="shown('fee')"
          >
            <pera-input
              type="number"
              [ngModel]="fee()"
              (ngModelChange)="fee.set($event ?? '')"
              [error]="shown('fee')"
              data-fee
            />
          </pera-form-field>
        }

        @if (data.kind === 'task') {
          <pera-form-field [label]="t('tplx.dlg.department')">
            <pera-select
              [options]="departmentOptions()"
              [placeholder]="t('tplx.dlg.noDepartment')"
              [ngModel]="departmentId()"
              (ngModelChange)="departmentId.set($event ?? '')"
              data-department
            />
          </pera-form-field>
        }

        @if (data.kind === 'subTask') {
          <pera-checkbox
            [ngModel]="isRequired()"
            (ngModelChange)="isRequired.set(!!$event)"
            data-required
            >{{ t('tplx.dlg.isRequired') }}</pera-checkbox
          >
        }

        <pera-form-field [label]="t('tplx.dlg.description')">
          <pera-textarea
            [rows]="3"
            [ngModel]="description()"
            (ngModelChange)="description.set($event ?? '')"
            data-description
          />
        </pera-form-field>
      </div>
    </pera-form-modal>
  `,
})
export class TemplateStructureDialogComponent {
  private readonly api = inject(StageTemplateStructureService);
  private readonly errors = inject(ErrorHandlerService);
  private readonly catalog = inject(CatalogService);
  private readonly modalRef = inject(PeraModalRef) as PeraModalRef<boolean>;
  readonly data = inject(PERA_MODAL_DATA) as TemplateStructureDialogData;

  readonly isEdit = !!this.data.item;
  readonly titleKey = TITLES[this.data.kind][this.isEdit ? 1 : 0];
  readonly eyebrow = EYEBROWS[this.data.kind][this.isEdit ? 1 : 0];
  readonly perm = PERM.stages.manage;

  readonly name = signal(this.initialName());
  readonly order = signal(String(this.data.item?.order ?? this.data.nextOrder));
  readonly weight = signal(this.initialWeight());
  readonly fee = signal(
    this.data.kind === 'stage' && this.data.item?.defaultFee != null
      ? String(this.data.item.defaultFee)
      : '',
  );
  readonly departmentId = signal(
    this.data.kind === 'task' ? (this.data.item?.departmentId ?? '') : '',
  );
  readonly isRequired = signal(
    this.data.kind === 'subTask' ? (this.data.item?.isRequired ?? true) : true,
  );
  readonly description = signal(this.data.item?.description ?? '');

  readonly busy = signal(false);
  readonly serverError = signal<string | null>(null);
  private readonly attempted = signal(false);

  readonly departmentOptions = computed<SelectOption[]>(() => [
    { value: '', label: this.t('tplx.dlg.noDepartment') },
    ...(this.data.kind === 'task' ? this.data.departments : []).map((d) => ({
      value: d.id,
      label: d.name,
    })),
  ]);

  /** Field → error message, or '' when valid. */
  readonly problems = computed<Record<string, string>>(() => {
    const out: Record<string, string> = {};
    const name = this.name().trim();
    if (!name || name.length > 200) out['name'] = this.t('tplx.dlg.errName');
    const order = Number(this.order());
    if (this.order() === '' || !Number.isInteger(order) || order < 1)
      out['order'] = this.t('tplx.dlg.errOrder');
    if (this.data.kind !== 'subTask') {
      const w = Number(this.weight());
      const bad = this.weight() === '' || !Number.isFinite(w) || w < 0;
      if (this.data.kind === 'stage' && (bad || w > 100))
        out['weight'] = this.t('tplx.dlg.errWeightPercent');
      if (this.data.kind === 'task' && bad) out['weight'] = this.t('tplx.dlg.errWeight');
    }
    if (this.data.kind === 'stage' && this.fee() !== '') {
      const f = Number(this.fee());
      if (!Number.isFinite(f) || f < 0 || f > 1_000_000_000_000)
        out['fee'] = this.t('tplx.dlg.errFee');
    }
    return out;
  });

  t(key: CatalogKey, params?: Record<string, string | number>): string {
    return this.catalog.t(key, params);
  }

  shown(field: string): string {
    return this.attempted() ? (this.problems()[field] ?? '') : '';
  }

  close(result: boolean): void {
    this.modalRef.close(result);
  }

  submit(): void {
    this.attempted.set(true);
    if (Object.keys(this.problems()).length || this.busy()) return;
    this.busy.set(true);
    this.serverError.set(null);
    this.call().subscribe({
      next: () => {
        this.busy.set(false);
        this.close(true);
      },
      error: (err: HttpErrorResponse) => {
        this.busy.set(false);
        this.serverError.set(friendly(this.errors.parse(err)));
      },
    });
  }

  private call(): Observable<unknown> {
    const name = this.name().trim();
    const order = Number(this.order());
    const description = this.description().trim() || null;
    const d = this.data;
    switch (d.kind) {
      case 'stage': {
        const body = {
          name,
          order,
          weightPercent: Number(this.weight()),
          description,
          defaultFee: this.fee() === '' ? null : Number(this.fee()),
        };
        return d.item
          ? this.api.updateStage(d.item.id, body)
          : this.api.createStage(d.parentId, body);
      }
      case 'task': {
        const body = {
          name,
          order,
          weight: Number(this.weight()),
          description,
          departmentId: this.departmentId() || null,
        };
        return d.item
          ? this.api.updateStageTask(d.item.id, body)
          : this.api.createStageTask(d.parentId, body);
      }
      case 'subTask': {
        const body = { title: name, order, isRequired: this.isRequired(), description };
        return d.item
          ? this.api.updateSubTask(d.item.id, body)
          : this.api.createSubTask(d.parentId, body);
      }
    }
  }

  private initialName(): string {
    const d = this.data;
    if (d.kind === 'subTask') return d.item?.title ?? '';
    return d.item?.name ?? '';
  }

  private initialWeight(): string {
    const d = this.data;
    if (d.kind === 'stage') return d.item ? String(d.item.weightPercent) : '';
    if (d.kind === 'task') return String(d.item?.weight ?? 1);
    return '';
  }
}
