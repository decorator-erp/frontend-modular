import { ChangeDetectionStrategy, Component, inject, signal } from '@angular/core';
import { FormBuilder, ReactiveFormsModule } from '@angular/forms';
import {
  PERA_MODAL_DATA,
  PeraDateInputComponent,
  PeraFormFieldComponent,
  PeraFormModalComponent,
  PeraInputComponent,
  PeraModalRef,
  PeraSelectComponent,
  PeraTextareaComponent,
  type SelectOption,
} from '@ds';
import type { Project } from '@modules/projects';
import { CatalogService } from '@platform/i18n/catalog.service';
import type { CatalogKey } from '@platform/i18n/catalog/en';
import {
  BUILDING_KIND_LABEL,
  ELEVATOR_STATUS_LABEL,
  UNIT_CONDITION_LABEL,
  UNIT_POSITION_LABEL,
  UNIT_TYPE_LABEL,
} from '../../model/site-enums';
import type { WriteOutcome } from '../../model/site-errors';
import { validateUnitData } from '../../model/site-validation';
import { EMPTY_UNIT_DATA, type SiteUnitData } from '../../model/site.model';

export interface SiteUnitDialogData {
  mode: 'create' | 'edit';
  /** Create: the Editor+ open projects; the picker's initial value is `projectId`. */
  projects?: Project[];
  projectId?: string | null;
  /** Edit: the survey's code and current unit data (a PUT replaces all of it). */
  code?: string;
  initial?: SiteUnitData;
  /** Runs the write; the dialog closes on `ok`, otherwise shows the outcome inline. */
  save: (projectId: string, data: SiteUnitData) => Promise<WriteOutcome<string | void>>;
}

type Field = keyof SiteUnitData;

/** Today in the app's time zone (Africa/Cairo) as `YYYY-MM-DD`. */
export function cairoToday(now = new Date()): string {
  return new Intl.DateTimeFormat('en-CA', { timeZone: 'Africa/Cairo' }).format(now);
}

/**
 * sites S-2 / S-3: the unit-data form (prototype `unitFields`, `sites.js:299-315`), as the create modal
 * (with the project picker) and the edit modal (a full-replace PUT). Limits per spec §5; `surveyedOn`
 * is a `DateOnly` sent as `YYYY-MM-DD` (DEVIATION-19).
 */
@Component({
  selector: 'app-site-unit-dialog',
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [
    ReactiveFormsModule,
    PeraFormModalComponent,
    PeraFormFieldComponent,
    PeraInputComponent,
    PeraSelectComponent,
    PeraTextareaComponent,
    PeraDateInputComponent,
  ],
  template: `
    <pera-form-modal
      size="lg"
      [title]="title"
      [subtitle]="subtitle"
      [submitLabel]="t(isCreate ? 'sv.create' : 'sv.saveChanges')"
      [cancelLabel]="t('sv.cancel')"
      [submitting]="saving()"
      [errorMessage]="banner()"
      [errorCode]="bannerCode()"
      (submitted)="submit()"
      (cancelled)="close()"
    >
      <div
        [formGroup]="form"
        class="grid grid-cols-1 sm:grid-cols-2 gap-x-4 gap-y-4"
        data-unit-form
      >
        @if (isCreate) {
          <pera-form-field
            class="sm:col-span-2"
            [label]="t('sv.project')"
            [required]="true"
            [error]="err('projectId')"
          >
            <pera-select formControlName="projectId" [options]="projectOptions" />
          </pera-form-field>
        }
        <pera-form-field
          class="sm:col-span-2"
          [label]="t('sv.address')"
          [hint]="t('sv.addressHint')"
          [error]="err('address')"
        >
          <pera-input formControlName="address" dir="auto" [error]="err('address')" />
        </pera-form-field>
        <pera-form-field [label]="t('sv.f.unitType')">
          <pera-select formControlName="unitType" [options]="opts.unitType" />
        </pera-form-field>
        <pera-form-field [label]="t('sv.f.unitCondition')">
          <pera-select formControlName="unitCondition" [options]="opts.unitCondition" />
        </pera-form-field>
        <pera-form-field
          [label]="t('sv.f.areaSqm') + ' (' + t('sv.unitM2') + ')'"
          [error]="err('areaSqm')"
        >
          <pera-input type="number" dir="ltr" formControlName="areaSqm" [error]="err('areaSqm')" />
        </pera-form-field>
        <pera-form-field [label]="t('sv.surveyedOn')" [error]="err('surveyedOn')">
          <pera-date-input formControlName="surveyedOn" />
        </pera-form-field>
        <pera-form-field [label]="t('sv.f.floorNo')" [error]="err('floorNo')">
          <pera-input type="number" dir="ltr" formControlName="floorNo" [error]="err('floorNo')" />
        </pera-form-field>
        <pera-form-field [label]="t('sv.f.unitsPerFloor')" [error]="err('unitsPerFloor')">
          <pera-input
            type="number"
            dir="ltr"
            formControlName="unitsPerFloor"
            [error]="err('unitsPerFloor')"
          />
        </pera-form-field>
        <pera-form-field [label]="t('sv.f.buildingKind')">
          <pera-select formControlName="buildingKind" [options]="opts.buildingKind" />
        </pera-form-field>
        <pera-form-field [label]="t('sv.f.position')">
          <pera-select formControlName="position" [options]="opts.position" />
        </pera-form-field>
        <pera-form-field [label]="t('sv.f.elevatorStatus')">
          <pera-select formControlName="elevatorStatus" [options]="opts.elevatorStatus" />
        </pera-form-field>
        <pera-form-field [label]="t('sv.f.isLicensed')">
          <pera-select formControlName="isLicensed" [options]="opts.bool" />
        </pera-form-field>
        <pera-form-field [label]="t('sv.f.isRented')">
          <pera-select formControlName="isRented" [options]="opts.bool" />
        </pera-form-field>
        <pera-form-field
          class="sm:col-span-2"
          [label]="t('sv.f.utilityMetersNote')"
          [error]="err('utilityMetersNote')"
        >
          <pera-textarea formControlName="utilityMetersNote" dir="auto" [rows]="2" />
        </pera-form-field>
        <pera-form-field class="sm:col-span-2" [label]="t('sv.f.notes')" [error]="err('notes')">
          <pera-textarea formControlName="notes" dir="auto" [rows]="3" />
        </pera-form-field>
      </div>
    </pera-form-modal>
  `,
})
export class SiteUnitDialogComponent {
  private readonly fb = inject(FormBuilder);
  private readonly ref = inject(PeraModalRef) as PeraModalRef<string | true>;
  private readonly catalog = inject(CatalogService);
  readonly data = inject(PERA_MODAL_DATA) as SiteUnitDialogData;

  readonly isCreate = this.data.mode === 'create';
  readonly saving = signal(false);
  readonly banner = signal<string | null>(null);
  readonly bannerCode = signal<string | null>(null);
  readonly errors = signal<Record<string, string>>({});

  protected t(key: CatalogKey, params?: Record<string, string | number>): string {
    return this.catalog.t(key, params);
  }

  readonly title = this.isCreate ? this.t('sv.newSurvey') : this.t('sv.editUnit');
  readonly subtitle = this.isCreate ? this.t('sv.newSurveySub') : (this.data.code ?? '');

  private enumOptions(labels: Record<number, CatalogKey>): SelectOption[] {
    return [
      { value: null, label: this.t('sv.none') },
      ...Object.entries(labels).map(([v, k]) => ({ value: Number(v), label: this.t(k) })),
    ];
  }

  readonly opts = {
    unitType: this.enumOptions(UNIT_TYPE_LABEL),
    unitCondition: this.enumOptions(UNIT_CONDITION_LABEL),
    buildingKind: this.enumOptions(BUILDING_KIND_LABEL),
    position: this.enumOptions(UNIT_POSITION_LABEL),
    elevatorStatus: this.enumOptions(ELEVATOR_STATUS_LABEL),
    bool: [
      { value: null, label: this.t('sv.none') },
      { value: true, label: this.t('sv.yes') },
      { value: false, label: this.t('sv.no') },
    ] as SelectOption[],
  };

  readonly projectOptions: SelectOption[] = (this.data.projects ?? []).map((p) => ({
    value: p.id,
    label: `${p.code} · ${p.name}`,
  }));

  private readonly start: SiteUnitData = this.data.initial ?? {
    ...EMPTY_UNIT_DATA,
    surveyedOn: cairoToday(),
  };

  readonly form = this.fb.group({
    projectId: [
      this.data.projectId && this.projectOptions.some((o) => o.value === this.data.projectId)
        ? this.data.projectId
        : ((this.projectOptions[0]?.value as string | undefined) ?? null),
    ],
    address: [this.start.address ?? ''],
    unitType: [this.start.unitType as number | null],
    unitCondition: [this.start.unitCondition as number | null],
    areaSqm: [this.start.areaSqm == null ? '' : String(this.start.areaSqm)],
    floorNo: [this.start.floorNo == null ? '' : String(this.start.floorNo)],
    unitsPerFloor: [this.start.unitsPerFloor == null ? '' : String(this.start.unitsPerFloor)],
    buildingKind: [this.start.buildingKind as number | null],
    position: [this.start.position as number | null],
    elevatorStatus: [this.start.elevatorStatus as number | null],
    isLicensed: [this.start.isLicensed as boolean | null],
    isRented: [this.start.isRented as boolean | null],
    utilityMetersNote: [this.start.utilityMetersNote ?? ''],
    surveyedOn: [this.start.surveyedOn ?? ''],
    notes: [this.start.notes ?? ''],
  });

  protected err(field: Field | 'projectId'): string | undefined {
    return this.errors()[field];
  }

  /** The form as a `SiteUnitDataRequest`: blanks → null, numbers parsed (NaN kept to fail validation). */
  read(): SiteUnitData {
    const v = this.form.getRawValue();
    const text = (s: string | null | undefined) => (s ?? '').trim() || null;
    const n = (s: string | number | null | undefined) =>
      s === '' || s == null ? null : typeof s === 'number' ? s : Number(s);
    return {
      address: text(v.address),
      unitType: (v.unitType ?? null) as SiteUnitData['unitType'],
      unitCondition: (v.unitCondition ?? null) as SiteUnitData['unitCondition'],
      areaSqm: n(v.areaSqm),
      floorNo: n(v.floorNo),
      unitsPerFloor: n(v.unitsPerFloor),
      buildingKind: (v.buildingKind ?? null) as SiteUnitData['buildingKind'],
      position: (v.position ?? null) as SiteUnitData['position'],
      elevatorStatus: (v.elevatorStatus ?? null) as SiteUnitData['elevatorStatus'],
      isLicensed: v.isLicensed ?? null,
      isRented: v.isRented ?? null,
      utilityMetersNote: text(v.utilityMetersNote),
      surveyedOn: v.surveyedOn || null,
      notes: text(v.notes),
    };
  }

  async submit(): Promise<void> {
    if (this.saving()) return;
    this.banner.set(null);
    this.bannerCode.set(null);
    const data = this.read();
    const local = validateUnitData(data);
    const errs: Record<string, string> = {};
    for (const [k, e] of Object.entries(local)) if (e) errs[k] = this.t(e.key, e.params);
    const projectId = this.isCreate ? (this.form.getRawValue().projectId ?? '') : '';
    if (this.isCreate && !projectId) errs['projectId'] = this.t('sv.err.required');
    this.errors.set(errs);
    if (Object.keys(errs).length) return;

    this.saving.set(true);
    const outcome = await this.data.save(projectId, data);
    this.saving.set(false);
    if (outcome.ok) {
      this.ref.close(typeof outcome.value === 'string' ? outcome.value : true);
      return;
    }
    if (outcome.reloaded) {
      this.ref.close();
      return;
    }
    this.errors.set(outcome.fieldErrors ?? {});
    this.banner.set(outcome.message ?? null);
    this.bannerCode.set(outcome.code ?? null);
  }

  close(): void {
    this.ref.close();
  }
}
