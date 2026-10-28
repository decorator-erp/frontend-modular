import {
  ChangeDetectionStrategy,
  Component,
  computed,
  effect,
  inject,
  signal,
} from '@angular/core';
import { FormBuilder, ReactiveFormsModule, Validators } from '@angular/forms';
import { CatalogService } from '@platform/i18n/catalog.service';
import type { CatalogKey } from '@platform/i18n/catalog/en';
import {
  ApprovalState,
  BuildingKind,
  ElevatorStatus,
  FinishingPurpose,
  FurnitureStatus,
  HiringReason,
  PastExperience,
  ProjectSector,
  TimelinePressure,
  UnitCondition,
  UnitPosition,
  UnitType,
} from '../../model/crm-enums';
import type { BriefHeadData } from '../../model';
import { CanDirective, PERM } from '@platform/permissions';
import { ServerErrorsDirective, firstErrorMessage } from '@shared/forms';
import type { ParsedApiError } from '@platform/types';
import {
  PeraAlertComponent,
  PeraButtonComponent,
  PeraCheckboxComponent,
  PeraFormFieldComponent,
  PeraInputComponent,
  PeraMoneyInputComponent,
  PeraRadioComponent,
  PeraSelectComponent,
  PeraStatusBadgeComponent,
  PeraSwitchComponent,
  PeraTextareaComponent,
  RadioOption,
  SelectOption,
} from '@ds';
import { trustChip } from '../trust/trust-chip';
import { BriefStore } from '../../stores/brief.store';

// Exported so the approvals-inbox head-diff renderer (B6b) can translate the SAME
// raw bare-integer facts back to a label — one definition, never a second copy.
export const UNIT_TYPE_KEYS: Record<UnitType, CatalogKey> = {
  [UnitType.Apartment]: 'brief.optApartment',
  [UnitType.Villa]: 'brief.optVilla',
  [UnitType.Duplex]: 'brief.optDuplex',
  [UnitType.Studio]: 'brief.optStudio',
};
export const UNIT_CONDITION_KEYS: Record<UnitCondition, CatalogKey> = {
  [UnitCondition.BareBrick]: 'brief.optBareBrick',
  [UnitCondition.SemiFinished]: 'brief.optSemiFinished',
  [UnitCondition.Renovation]: 'brief.optRenovation',
};
export const BUILDING_KIND_KEYS: Record<BuildingKind, CatalogKey> = {
  [BuildingKind.Tower]: 'brief.optTower',
  [BuildingKind.Private]: 'brief.optPrivate',
};
export const POSITION_KEYS: Record<UnitPosition, CatalogKey> = {
  [UnitPosition.Corner]: 'brief.optCorner',
  [UnitPosition.Facade]: 'brief.optFacade',
};
export const ELEVATOR_KEYS: Record<ElevatorStatus, CatalogKey> = {
  [ElevatorStatus.Working]: 'brief.optElevWorking',
  [ElevatorStatus.NotWorking]: 'brief.optElevNotWorking',
  [ElevatorStatus.None]: 'brief.optElevNone',
};
export const EXPERIENCE_KEYS: Record<PastExperience, CatalogKey> = {
  [PastExperience.Good]: 'brief.optExpGood',
  [PastExperience.Bad]: 'brief.optExpBad',
};
export const FURNITURE_KEYS: Record<FurnitureStatus, CatalogKey> = {
  [FurnitureStatus.AlreadyOwned]: 'brief.optFurnOwned',
  [FurnitureStatus.BuyPerDesign]: 'brief.optFurnBuyPerDesign',
  [FurnitureStatus.Mixed]: 'brief.optFurnMixed',
};
export const TIMELINE_KEYS: Record<TimelinePressure, CatalogKey> = {
  [TimelinePressure.Tight]: 'brief.optTimelineTight',
  [TimelinePressure.Normal]: 'brief.optTimelineNormal',
};
// Lead-intake vocabulary, shared with the intake form, the sector chip, and the head-diff renderer.
export const SECTOR_KEYS: Record<ProjectSector, CatalogKey> = {
  [ProjectSector.Residential]: 'sector.residential',
  [ProjectSector.Medical]: 'sector.medical',
  [ProjectSector.Administrative]: 'sector.administrative',
  [ProjectSector.FoodAndBeverage]: 'sector.foodAndBeverage',
  [ProjectSector.Retail]: 'sector.retail',
  [ProjectSector.MegaProject]: 'sector.megaProject',
};
export const FINISHING_PURPOSE_KEYS: Record<FinishingPurpose, CatalogKey> = {
  [FinishingPurpose.UnitFinishingOnly]: 'finishing.unitOnly',
  [FinishingPurpose.TurnkeyDelivery]: 'finishing.turnkey',
  [FinishingPurpose.FinishingWithKitchen]: 'finishing.withKitchen',
  [FinishingPurpose.Restoration]: 'finishing.restoration',
  [FinishingPurpose.Renovation]: 'finishing.renovation',
};

/**
 * The head's validation keys arrive as `Data.<Field>` (`Data.AreaSqm`, C §1.1). The platform parser
 * keeps only the first segment (`data`), so read the raw keys and name the head form's control
 * (`areaSqm`) instead (009b #12). Keys outside `Data.` are dropped.
 */
export function headFieldErrors(parsed: ParsedApiError): Record<string, string[]> {
  const fieldErrors: Record<string, string[]> = {};
  for (const [key, messages] of Object.entries(parsed.raw?.errors ?? {})) {
    const match = /^Data\.(\w+)/i.exec(key);
    if (!match || !Array.isArray(messages) || !messages.length) continue;
    const control = match[1].charAt(0).toLowerCase() + match[1].slice(1);
    fieldErrors[control] = [...(fieldErrors[control] ?? []), ...messages];
  }
  return fieldErrors;
}

function enumOptions<T extends number>(
  keys: Record<T, CatalogKey>,
  catalog: CatalogService,
): SelectOption[] {
  return Object.keys(keys)
    .map(Number)
    .map((value) => ({ value: String(value), label: catalog.t(keys[value as T]) }));
}

/**
 * The brief head (T061) — a single editable 1:1 record, EXEMPT from the ledger rule
 * (FR-009). Editing returns it to PendingApproval WITHOUT moving the round; only
 * `sendForConfirmation()` advances it. **Send is disabled while a round is outstanding**
 * (`head.status === PendingApproval`), and the screen says why (FR-014).
 *
 * `hiringReasons` is a `[Flags]` enum — rendered as three independent checkboxes,
 * combined with bitwise OR on save; read back with bitwise AND, never `===`.
 */
@Component({
  selector: 'app-crm-brief-head',
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [
    ReactiveFormsModule,
    ServerErrorsDirective,
    CanDirective,
    PeraAlertComponent,
    PeraButtonComponent,
    PeraCheckboxComponent,
    PeraFormFieldComponent,
    PeraInputComponent,
    PeraMoneyInputComponent,
    PeraRadioComponent,
    PeraSelectComponent,
    PeraStatusBadgeComponent,
    PeraSwitchComponent,
    PeraTextareaComponent,
  ],
  host: { class: 'block' },
  template: `
    <div class="bg-surface border border-border rounded-card p-4 flex flex-col gap-4">
      <div class="flex items-center justify-between gap-3 flex-wrap">
        <div>
          <div class="font-semibold text-text-primary">{{ catalog.t('brief.secHeadT') }}</div>
          <p class="fs-caption text-text-secondary m-0">{{ catalog.t('brief.sub') }}</p>
        </div>
        <div class="flex items-center gap-2 flex-wrap">
          @if (sectorLabel(); as sector) {
            <span
              [title]="catalog.t('brief.sectorTip')"
              class="inline-flex items-center gap-2 px-2.5 py-1 border border-border-strong bg-surface-muted"
            >
              <svg
                width="12"
                height="12"
                viewBox="0 0 24 24"
                fill="none"
                stroke="currentColor"
                stroke-width="1.6"
                class="text-text-muted"
                aria-hidden="true"
              >
                <rect width="18" height="11" x="3" y="11" rx="2" ry="2" />
                <path d="M7 11V7a5 5 0 0 1 10 0v4" />
              </svg>
              <span class="fs-label uppercase tracking-wide text-text-muted">{{
                catalog.t('brief.sectorBadge')
              }}</span>
              <span class="fs-body-sm font-medium text-text-primary">{{ sector }}</span>
            </span>
          }
          @if (store.head(); as head) {
            <pera-status-badge [tone]="headChip().tone" [label]="catalog.t(headChip().key)" />
            @if (head.status === APPROVAL_STATE.PendingApproval && store.headRound() > 0) {
              <span class="fs-caption text-text-muted">{{
                catalog.t('appr.roundLabel', { round: store.headRound() })
              }}</span>
            }
          }
          <pera-button
            variant="primary"
            *peraCan="PERM.crm.briefs.manage"
            [disabled]="store.isHeadRoundOutstanding()"
            [loading]="store.sending()"
            (click)="send()"
            >{{ catalog.t('appr.sendConfirm') }}</pera-button
          >
        </div>
      </div>

      @if (showPrefillBanner()) {
        <div
          class="flex items-start gap-2.5 px-3.5 py-2.5 bg-accent-soft border border-accent text-accent fs-caption leading-relaxed"
        >
          <span class="flex-1">{{ catalog.t('intake.prefilledBanner') }}</span>
          <button
            type="button"
            (click)="dismissBanner()"
            [attr.aria-label]="catalog.t('common.dismiss')"
            class="shrink-0 bg-transparent border-0 text-accent cursor-pointer p-0"
          >
            <svg
              width="13"
              height="13"
              viewBox="0 0 24 24"
              fill="none"
              stroke="currentColor"
              stroke-width="1.8"
              aria-hidden="true"
            >
              <path d="M18 6 6 18" />
              <path d="m6 6 12 12" />
            </svg>
          </button>
        </div>
      }

      @if (store.isHeadRoundOutstanding()) {
        <pera-alert tone="info">{{ catalog.t('ws.sentNote') }}</pera-alert>
      }

      <form [formGroup]="form" [serverErrors]="serverError()" class="flex flex-col gap-6">
        <section class="flex flex-col gap-3">
          <div class="fs-label uppercase tracking-wide text-text-muted font-semibold">
            {{ catalog.t('brief.secUnit') }}
          </div>
          <div class="grid grid-cols-1 sm:grid-cols-2 gap-x-4 gap-y-3">
            <pera-form-field
              [label]="catalog.t('brief.fUnitType')"
              [required]="true"
              [error]="errorOf('unitType')"
            >
              <pera-select formControlName="unitType" [options]="unitTypeOptions" />
            </pera-form-field>
            <pera-form-field
              [label]="catalog.t('brief.fCondition')"
              [required]="true"
              [error]="errorOf('unitCondition')"
            >
              <pera-select formControlName="unitCondition" [options]="unitConditionOptions" />
            </pera-form-field>
            <pera-form-field [label]="catalog.t('brief.sectorBadge')" [error]="errorOf('sector')">
              <pera-select formControlName="sector" [options]="sectorOptions" placeholder="—" />
            </pera-form-field>
            <pera-form-field [label]="catalog.t('brief.fAddress')" [error]="errorOf('address')">
              <pera-input formControlName="address" />
            </pera-form-field>
            <pera-form-field [label]="catalog.t('brief.fArea')" [error]="errorOf('areaSqm')">
              <pera-input type="number" formControlName="areaSqm" />
            </pera-form-field>
            <pera-form-field [label]="catalog.t('brief.fFloorNo')" [error]="errorOf('floorNo')">
              <pera-input type="number" formControlName="floorNo" />
            </pera-form-field>
            <pera-form-field
              [label]="catalog.t('brief.fUnitsPerFloor')"
              [error]="errorOf('unitsPerFloor')"
            >
              <pera-input type="number" formControlName="unitsPerFloor" />
            </pera-form-field>
            <pera-form-field
              [label]="catalog.t('brief.fBuildingKind')"
              [error]="errorOf('buildingKind')"
            >
              <pera-select
                formControlName="buildingKind"
                [options]="buildingKindOptions"
                placeholder="—"
              />
            </pera-form-field>
            <pera-form-field [label]="catalog.t('brief.fFloorLic')" [error]="errorOf('isLicensed')">
              <pera-switch formControlName="isLicensed">{{
                catalog.t('brief.fFloorLic')
              }}</pera-switch>
            </pera-form-field>
            <div class="flex flex-col gap-1.5">
              <span class="fs-body-sm font-medium text-text-secondary flex items-center gap-1.5">
                {{ catalog.t('brief.fTenure') }}
                <span
                  class="fs-micro uppercase tracking-wide text-accent bg-accent-soft border border-accent px-1"
                  >{{ catalog.t('brief.editableChip') }}</span
                >
              </span>
              <pera-radio formControlName="isRented" [inline]="true" [options]="tenureOptions" />
            </div>
            <div class="flex flex-col gap-1.5">
              <span class="fs-body-sm font-medium text-text-secondary flex items-center gap-1.5">
                {{ catalog.t('brief.fFinishingPurpose') }}
                <span
                  class="fs-micro uppercase tracking-wide text-accent bg-accent-soft border border-accent px-1"
                  >{{ catalog.t('brief.editableChip') }}</span
                >
              </span>
              <pera-select
                formControlName="finishingPurpose"
                [options]="finishingPurposeOptions"
                placeholder="—"
              />
            </div>
            <pera-form-field [label]="catalog.t('brief.fPosition')" [error]="errorOf('position')">
              <pera-select formControlName="position" [options]="positionOptions" placeholder="—" />
            </pera-form-field>
            <pera-form-field
              [label]="catalog.t('brief.fElevator')"
              [error]="errorOf('elevatorStatus')"
            >
              <pera-select
                formControlName="elevatorStatus"
                [options]="elevatorOptions"
                placeholder="—"
              />
            </pera-form-field>
          </div>
        </section>

        <section class="flex flex-col gap-3">
          <div class="fs-label uppercase tracking-wide text-text-muted font-semibold">
            {{ catalog.t('brief.secLifestyle') }}
          </div>
          <div class="grid grid-cols-1 sm:grid-cols-2 gap-x-4 gap-y-3">
            <pera-switch formControlName="receivesFrequentVisitors">{{
              catalog.t('brief.fVisitorsFreq')
            }}</pera-switch>
            <pera-form-field
              [label]="catalog.t('brief.fVisitors')"
              [error]="errorOf('visitorsNote')"
            >
              <pera-input formControlName="visitorsNote" />
            </pera-form-field>
          </div>
        </section>

        <section class="flex flex-col gap-3">
          <div class="fs-label uppercase tracking-wide text-text-muted font-semibold">
            {{ catalog.t('brief.secHistory') }}
          </div>
          <div class="grid grid-cols-1 sm:grid-cols-2 gap-x-4 gap-y-3">
            <pera-switch formControlName="usedDesignerBefore">{{
              catalog.t('brief.fUsedBefore')
            }}</pera-switch>
            <pera-form-field
              [label]="catalog.t('brief.fExperience')"
              [error]="errorOf('designerExperience')"
            >
              <pera-select
                formControlName="designerExperience"
                [options]="experienceOptions"
                placeholder="—"
              />
            </pera-form-field>
            <pera-form-field
              class="sm:col-span-2"
              [label]="catalog.t('brief.fDesignerExpReason')"
              [error]="errorOf('designerExperienceReason')"
            >
              <pera-input formControlName="designerExperienceReason" />
            </pera-form-field>
            <div class="sm:col-span-2 flex flex-col gap-2">
              <span class="fs-body-sm font-medium text-text-primary">{{
                catalog.t('brief.fHiring')
              }}</span>
              <div class="flex flex-wrap gap-4">
                <pera-checkbox formControlName="hiringRelief">{{
                  catalog.t('brief.optHiringRelief')
                }}</pera-checkbox>
                <pera-checkbox formControlName="hiringSaveTime">{{
                  catalog.t('brief.optHiringSaveTime')
                }}</pera-checkbox>
                <pera-checkbox formControlName="hiringOrganize">{{
                  catalog.t('brief.optHiringOrganize')
                }}</pera-checkbox>
              </div>
            </div>
          </div>
        </section>

        <section class="flex flex-col gap-3">
          <div class="fs-label uppercase tracking-wide text-text-muted font-semibold">
            {{ catalog.t('brief.secPrefs') }}
          </div>
          <div class="grid grid-cols-1 sm:grid-cols-2 gap-x-4 gap-y-3">
            <pera-form-field
              [label]="catalog.t('brief.fStyle')"
              [error]="errorOf('preferredStyle')"
            >
              <pera-input formControlName="preferredStyle" />
            </pera-form-field>
            <pera-form-field
              [label]="catalog.t('brief.fColors')"
              [error]="errorOf('preferredColors')"
            >
              <pera-input formControlName="preferredColors" />
            </pera-form-field>
            <pera-form-field
              [label]="catalog.t('brief.fFurniture')"
              [error]="errorOf('furnitureStatus')"
            >
              <pera-select
                formControlName="furnitureStatus"
                [options]="furnitureOptions"
                placeholder="—"
              />
            </pera-form-field>
            <pera-form-field
              [label]="catalog.t('brief.fBudget')"
              [error]="errorOf('expectedBudget')"
            >
              <pera-money-input formControlName="expectedBudget" />
            </pera-form-field>
            <pera-form-field
              [label]="catalog.t('brief.fTimeline')"
              [error]="errorOf('timelinePressure')"
            >
              <pera-select
                formControlName="timelinePressure"
                [options]="timelineOptions"
                placeholder="—"
              />
            </pera-form-field>
          </div>
        </section>

        <section class="flex flex-col gap-3">
          <div class="fs-label uppercase tracking-wide text-text-muted font-semibold">
            {{ catalog.t('brief.secArch') }}
          </div>
          <pera-form-field
            [label]="catalog.t('brief.secArch')"
            [error]="errorOf('architecturalRequests')"
          >
            <pera-textarea formControlName="architecturalRequests" />
          </pera-form-field>
          <pera-form-field [label]="catalog.t('brief.fOtherNeeds')" [error]="errorOf('otherNeeds')">
            <pera-textarea formControlName="otherNeeds" />
          </pera-form-field>
        </section>

        @if (store.error()) {
          <pera-alert tone="danger">{{ store.error() }}</pera-alert>
        }

        <div class="flex justify-end" *peraCan="PERM.crm.briefs.manage">
          <pera-button variant="primary" [loading]="store.savingHead()" (click)="save()">{{
            catalog.t('common.saveDraft')
          }}</pera-button>
        </div>
      </form>
    </div>
  `,
})
export class CrmBriefHeadComponent {
  private readonly fb = inject(FormBuilder);
  protected readonly catalog = inject(CatalogService);
  protected readonly store = inject(BriefStore);
  protected readonly PERM = PERM;

  protected readonly unitTypeOptions = enumOptions(UNIT_TYPE_KEYS, this.catalog);
  protected readonly unitConditionOptions = enumOptions(UNIT_CONDITION_KEYS, this.catalog);
  protected readonly buildingKindOptions = enumOptions(BUILDING_KIND_KEYS, this.catalog);
  protected readonly positionOptions = enumOptions(POSITION_KEYS, this.catalog);
  protected readonly elevatorOptions = enumOptions(ELEVATOR_KEYS, this.catalog);
  protected readonly experienceOptions = enumOptions(EXPERIENCE_KEYS, this.catalog);
  protected readonly furnitureOptions = enumOptions(FURNITURE_KEYS, this.catalog);
  protected readonly timelineOptions = enumOptions(TIMELINE_KEYS, this.catalog);
  protected readonly finishingPurposeOptions = enumOptions(FINISHING_PURPOSE_KEYS, this.catalog);
  /** 009b #12: the head update carries `sector` — changeable here, never cleared (blank = omitted). */
  protected readonly sectorOptions = enumOptions(SECTOR_KEYS, this.catalog);
  /** The last save's error, its `Data.<Field>` keys placed on the controls (009b #12). */
  protected readonly serverError = signal<ParsedApiError | null>(null);
  protected readonly tenureOptions: RadioOption[] = [
    { value: true, label: this.catalog.t('tenure.rent') },
    { value: false, label: this.catalog.t('tenure.own') },
  ];

  /**
   * READ-ONLY sector, seeded at period-open — rendered as a badge in the header, never editable
   * here. Deliberately a single active-locale label, not a dual EN·AR value: that's correct i18n
   * and matches every other localized chip in the app (verification pass, restyle fix-up #3) — a
   * bilingual badge was considered and rejected as an inconsistent one-off.
   */
  protected readonly sectorLabel = computed<string | null>(() => {
    const sector = this.store.head()?.sector;
    return sector != null ? this.catalog.t(SECTOR_KEYS[sector as ProjectSector]) : null;
  });

  /** Pre-filled banner: shown once per seeded head until dismissed (persisted per brief id). */
  private readonly bannerDismissed = signal(false);
  protected readonly showPrefillBanner = computed(() => {
    const head = this.store.head();
    return !!head && head.sector != null && !this.bannerDismissed();
  });

  readonly form = this.fb.nonNullable.group({
    unitType: [String(UnitType.Apartment), [Validators.required]],
    unitCondition: [String(UnitCondition.BareBrick), [Validators.required]],
    sector: [''],
    address: [''],
    areaSqm: [''],
    floorNo: [''],
    unitsPerFloor: [''],
    buildingKind: [''],
    isLicensed: [false],
    isRented: [null as boolean | null],
    finishingPurpose: [''],
    position: [''],
    elevatorStatus: [''],
    receivesFrequentVisitors: [false],
    visitorsNote: [''],
    usedDesignerBefore: [false],
    designerExperience: [''],
    designerExperienceReason: [''],
    hiringRelief: [false],
    hiringSaveTime: [false],
    hiringOrganize: [false],
    preferredStyle: [''],
    preferredColors: [''],
    furnitureStatus: [''],
    expectedBudget: [''],
    timelinePressure: [''],
    architecturalRequests: [''],
    otherNeeds: [''],
  });

  protected readonly APPROVAL_STATE = ApprovalState;

  /** SC-004: the ONE trust-chip definition, `trustChip()` — never a per-screen tone/label variant. */
  protected readonly headChip = computed(() =>
    trustChip(this.store.head()?.status ?? ApprovalState.Draft, false),
  );

  constructor() {
    effect(() => {
      const head = this.store.head();
      if (!head) return;
      this.form.patchValue({
        unitType: String(head.unitType),
        unitCondition: String(head.unitCondition),
        sector: head.sector != null ? String(head.sector) : '',
        address: head.address ?? '',
        areaSqm: head.areaSqm != null ? String(head.areaSqm) : '',
        floorNo: head.floorNo != null ? String(head.floorNo) : '',
        unitsPerFloor: head.unitsPerFloor != null ? String(head.unitsPerFloor) : '',
        buildingKind: head.buildingKind != null ? String(head.buildingKind) : '',
        isLicensed: !!head.isLicensed,
        isRented: head.isRented ?? null,
        finishingPurpose: head.finishingPurpose != null ? String(head.finishingPurpose) : '',
        position: head.position != null ? String(head.position) : '',
        elevatorStatus: head.elevatorStatus != null ? String(head.elevatorStatus) : '',
        receivesFrequentVisitors: !!head.receivesFrequentVisitors,
        visitorsNote: head.visitorsNote ?? '',
        usedDesignerBefore: !!head.usedDesignerBefore,
        designerExperience: head.designerExperience != null ? String(head.designerExperience) : '',
        designerExperienceReason: head.designerExperienceReason ?? '',
        hiringRelief: !!(head.hiringReasons & HiringReason.ReliefFromCraftsmen),
        hiringSaveTime: !!(head.hiringReasons & HiringReason.SaveMoneyAndTime),
        hiringOrganize: !!(head.hiringReasons & HiringReason.OrganizeAndComfort),
        preferredStyle: head.preferredStyle ?? '',
        preferredColors: head.preferredColors ?? '',
        furnitureStatus: head.furnitureStatus != null ? String(head.furnitureStatus) : '',
        expectedBudget: head.expectedBudget != null ? String(head.expectedBudget) : '',
        timelinePressure: head.timelinePressure != null ? String(head.timelinePressure) : '',
        architecturalRequests: head.architecturalRequests ?? '',
        otherNeeds: head.otherNeeds ?? '',
      });
    });

    // Pre-filled banner: reflect the persisted per-brief dismissal.
    effect(() => {
      const head = this.store.head();
      if (head) this.bannerDismissed.set(localStorage.getItem(this.bannerKey(head.id)) === '1');
    });
  }

  private bannerKey(briefId: string): string {
    return `pera.brief.prefill.dismissed.${briefId}`;
  }

  dismissBanner(): void {
    const head = this.store.head();
    if (head) localStorage.setItem(this.bannerKey(head.id), '1');
    this.bannerDismissed.set(true);
  }

  errorOf(name: string): string {
    const control = this.form.get(name);
    return control && control.touched && control.errors ? firstErrorMessage(control.errors) : '';
  }

  save(): void {
    const head = this.store.head();
    if (!head) return;
    const v = this.form.getRawValue();

    let hiringReasons = HiringReason.None;
    if (v.hiringRelief) hiringReasons |= HiringReason.ReliefFromCraftsmen;
    if (v.hiringSaveTime) hiringReasons |= HiringReason.SaveMoneyAndTime;
    if (v.hiringOrganize) hiringReasons |= HiringReason.OrganizeAndComfort;

    const num = (s: string): number | null => (s.trim() ? Number(s) : null);

    this.serverError.set(null);
    const data: BriefHeadData = {
      unitType: Number(v.unitType),
      unitCondition: Number(v.unitCondition),
      address: v.address.trim() || null,
      areaSqm: num(v.areaSqm),
      floorNo: num(v.floorNo),
      unitsPerFloor: num(v.unitsPerFloor),
      buildingKind: v.buildingKind ? Number(v.buildingKind) : null,
      isLicensed: v.isLicensed,
      isRented: v.isRented,
      finishingPurpose: v.finishingPurpose ? Number(v.finishingPurpose) : null,
      position: v.position ? Number(v.position) : null,
      elevatorStatus: v.elevatorStatus ? Number(v.elevatorStatus) : null,
      receivesFrequentVisitors: v.receivesFrequentVisitors,
      visitorsNote: v.visitorsNote.trim() || null,
      usedDesignerBefore: v.usedDesignerBefore,
      designerExperience: v.designerExperience ? Number(v.designerExperience) : null,
      designerExperienceReason: v.designerExperienceReason.trim() || null,
      hiringReasons,
      preferredStyle: v.preferredStyle.trim() || null,
      preferredColors: v.preferredColors.trim() || null,
      furnitureStatus: v.furnitureStatus ? Number(v.furnitureStatus) : null,
      expectedBudget: num(v.expectedBudget),
      timelinePressure: v.timelinePressure ? Number(v.timelinePressure) : null,
      architecturalRequests: v.architecturalRequests.trim() || null,
      otherNeeds: v.otherNeeds.trim() || null,
    };
    // An omitted sector keeps the stored one (C §2.6): blank is never sent as a clear.
    if (v.sector) data.sector = Number(v.sector);

    this.store.updateHead(
      { data, lastMeetingId: head.lastMeetingId },
      {
        onError: (parsed) =>
          this.serverError.set({ ...parsed, fieldErrors: headFieldErrors(parsed) }),
      },
    );
  }

  send(): void {
    this.store.sendForConfirmation();
  }
}
