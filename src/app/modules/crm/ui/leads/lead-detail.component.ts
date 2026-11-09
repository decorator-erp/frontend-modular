import {
  ChangeDetectionStrategy,
  Component,
  ElementRef,
  afterRenderEffect,
  computed,
  effect,
  inject,
  input,
  signal,
  viewChild,
} from '@angular/core';
import { takeUntilDestroyed } from '@angular/core/rxjs-interop';
import { FormBuilder, FormControl, ReactiveFormsModule, Validators } from '@angular/forms';
import { HttpErrorResponse } from '@angular/common/http';
import { RouterLink } from '@angular/router';
import { ErrorHandlerService, friendly } from '@platform/http/error-handler.service';
import { CatalogService } from '@platform/i18n/catalog.service';
import type { CatalogKey } from '@platform/i18n/catalog/en';
import { ToastService } from '@platform/feedback/toast.service';
import { catchError, of } from 'rxjs';
import { EmployeeService } from '@modules/people';
import { LeadStatus, ProjectSector } from '../../model/crm-enums';
import type { CrmLead } from '../../data/crm-lead.service';
import type { LeadIntakeRequest, ResidentialIntakeRequest } from '../../model';
import { CanDirective, PERM, PermissionsService } from '@platform/permissions';
import {
  AREA_SQM_MAX,
  AREA_SQM_MIN,
  INTAKE_LIMITS,
  intakeDesignerRulesValidator,
} from '../../model/validation/lead-intake-validators';
import { applyFinanceServerError } from '@modules/finance';
import { firstErrorMessage } from '@shared/forms';
import {
  ConfirmService,
  ModalService,
  PeraAlertComponent,
  PeraButtonComponent,
  PeraCardComponent,
  PeraEmptyComponent,
  PeraFormFieldComponent,
  PeraInputComponent,
  PeraRadioComponent,
  PeraSelectComponent,
  PeraSkeletonComponent,
  PeraStatusBadgeComponent,
  PeraTextareaComponent,
  RadioOption,
  SelectOption,
} from '@ds';
import {
  EXPERIENCE_KEYS,
  FINISHING_PURPOSE_KEYS,
  SECTOR_KEYS,
  UNIT_CONDITION_KEYS,
  UNIT_TYPE_KEYS,
} from '../brief/brief-head.component';
import { LeadDetailStore } from '../../stores/lead-detail.store';
import { CrmConvertLeadComponent, type ConvertLeadDialogData } from './convert-lead.component';
import {
  CrmLeadFormComponent,
  type EditLeadDialogData,
} from '../dashboard/forms/lead-form.component';
import { LEAD_SOURCE_KEYS, LEAD_STATUS_KEYS, LEAD_STATUS_TONE } from './lead-labels';

/** Maps the intake domain codes to the offending control (mirrors the backend rules). */
const INTAKE_FIELD_MAP: Record<string, string> = {
  'crm.leads.ResidentialWithoutSector': 'projectSector',
  'crm.leads.DesignerExperienceWithoutUse': 'designerExperience',
  'crm.leads.ExperienceReasonWithoutExperience': 'designerExperienceReason',
};

/**
 * Office lead detail + intake editor (`crm/leads/:leadId`) — v2 design handoff layout: a
 * header card (identity + convert) and a grouped Intake card (client info / sector / project /
 * residential / designer history) using `pera-radio` for the yes-no, tenure, and experience
 * pairs. Read-only once Converted. Keeps the foundations' `LeadDetailStore` + numeric-enum contract.
 */
@Component({
  selector: 'app-crm-lead-detail',
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [
    ReactiveFormsModule,
    RouterLink,
    CanDirective,
    PeraAlertComponent,
    PeraButtonComponent,
    PeraCardComponent,
    PeraEmptyComponent,
    PeraFormFieldComponent,
    PeraInputComponent,
    PeraRadioComponent,
    PeraSelectComponent,
    PeraSkeletonComponent,
    PeraStatusBadgeComponent,
    PeraTextareaComponent,
  ],
  host: { class: 'block p-4' },
  template: `
    <div class="flex flex-col gap-5 max-w-[var(--w-form)]">
      <a
        [routerLink]="['/crm/leads']"
        class="fs-caption text-text-muted no-underline hover:underline"
        ><span class="inline-block rtl:rotate-180" aria-hidden="true">←</span>
        {{ catalog.t('leads.back') }}</a
      >

      @if (store.notFound()) {
        <pera-empty
          data-testid="lead-not-found"
          [title]="catalog.t('leads.notFound')"
          [description]="catalog.t('leads.notFoundHint')"
          iconName="inbox"
        />
      } @else if (store.loading() && !store.lead()) {
        <div class="flex flex-col gap-5" data-testid="lead-skeleton">
          <pera-skeleton [height]="96" rounded="sm" />
          <pera-skeleton [height]="360" rounded="sm" />
        </div>
      } @else if (store.loadFailed() && !store.lead()) {
        <pera-alert tone="danger" data-testid="lead-load-error">
          <div class="flex items-center justify-between gap-3 flex-wrap">
            <span>{{ catalog.t('leads.loadLeadFailed') }}</span>
            <pera-button size="sm" variant="secondary" (click)="store.load(leadId())">{{
              catalog.t('common.retry')
            }}</pera-button>
          </div>
        </pera-alert>
      } @else if (store.lead(); as lead) {
        <!-- header -->
        <pera-card>
          <div class="flex items-start justify-between gap-3 flex-wrap">
            <div class="flex flex-col gap-1.5">
              <div class="flex items-center gap-3 flex-wrap">
                <h1 class="fs-h2 font-semibold m-0">{{ lead.firstName }} {{ lead.lastName }}</h1>
                <pera-status-badge
                  [tone]="statusTone(lead.status)"
                  [label]="catalog.t(statusKey(lead.status))"
                />
              </div>
              <div class="flex flex-wrap gap-x-5 gap-y-1 fs-caption text-text-secondary">
                @if (lead.phone) {
                  <span dir="ltr">{{ lead.phone }}</span>
                }
                @if (lead.email) {
                  <span dir="ltr">{{ lead.email }}</span>
                }
                <span>{{ catalog.t(sourceKey(lead.source)) }}</span>
                <span data-testid="lead-owner"
                  >{{ catalog.t('brief.fOwner') }}: {{ ownerName(lead.ownerId) }}</span
                >
              </div>
              @if (lead.notes) {
                <div data-testid="lead-notes" class="flex flex-col gap-0.5 mt-1">
                  <span class="fs-label uppercase tracking-wide text-text-muted">{{
                    catalog.t('brief.fNotes')
                  }}</span>
                  <p class="fs-body-sm text-text-primary whitespace-pre-line m-0">
                    {{ lead.notes }}
                  </p>
                </div>
              }
              @if (lead.convertedClientId) {
                <a
                  data-testid="lead-client-link"
                  [routerLink]="['/crm/clients', lead.convertedClientId]"
                  class="fs-caption text-accent underline"
                  >{{ catalog.t('leads.viewClient') }}</a
                >
              }
            </div>
            @if (!store.isConverted()) {
              <div class="flex items-center gap-2 flex-wrap">
                @if (store.statusTargets().length) {
                  <pera-select
                    #statusSelect
                    *peraCan="PERM.crm.leads.changeStatus"
                    data-testid="lead-status"
                    variant="chip"
                    [formControl]="statusControl"
                    [options]="statusOptions()"
                    [placeholder]="catalog.t('lead.changeStatus')"
                  />
                }
                <pera-button
                  *peraCan="PERM.crm.leads.update"
                  variant="secondary"
                  (click)="openEdit(lead)"
                  >{{ catalog.t('common.edit') }}</pera-button
                >
                <pera-button
                  *peraCan="PERM.crm.leads.convert"
                  variant="secondary"
                  (click)="openConvert(lead)"
                  >{{ catalog.t('leads.convert') }}</pera-button
                >
              </div>
            }
          </div>
        </pera-card>

        <!-- intake -->
        <pera-card padding="none">
          <div class="flex items-center gap-2.5 px-4 py-3 border-b border-border">
            <span class="fs-label uppercase tracking-wide font-semibold">{{
              catalog.t('intake.section')
            }}</span>
            <span class="flex-1"></span>
            @if (store.isConverted()) {
              <pera-status-badge tone="neutral" [label]="catalog.t('intake.lockedChip')" />
            }
          </div>

          <form [formGroup]="form" class="p-4 flex flex-col gap-6">
            @if (store.isConverted()) {
              <pera-alert tone="info">{{ catalog.t('intake.lockedConverted') }}</pera-alert>
            }

            <!-- client info -->
            <section class="flex flex-col gap-3">
              <div class="flex items-center gap-2.5">
                <span class="w-3.5 h-px bg-accent"></span>
                <span class="fs-label uppercase tracking-wide font-semibold">{{
                  catalog.t('intake.secClient')
                }}</span>
                <span class="fs-label text-text-muted italic">{{
                  catalog.t('intake.clientInfoHint')
                }}</span>
              </div>
              <div class="grid grid-cols-1 sm:grid-cols-2 gap-x-4 gap-y-3">
                <pera-form-field
                  [label]="catalog.t('intake.fJobTitle')"
                  [error]="errorOf('jobTitle')"
                >
                  <pera-input formControlName="jobTitle" [error]="errorOf('jobTitle')" />
                </pera-form-field>
                <pera-form-field
                  class="sm:col-span-2"
                  [label]="catalog.t('intake.fResidence')"
                  [hint]="catalog.t('intake.residenceNote')"
                  [error]="errorOf('clientAddress')"
                >
                  <pera-input formControlName="clientAddress" [error]="errorOf('clientAddress')" />
                </pera-form-field>
              </div>
            </section>

            <!-- sector -->
            <section class="flex flex-col gap-3">
              <div class="flex items-center gap-2.5">
                <span class="w-3.5 h-px bg-accent"></span>
                <span class="fs-label uppercase tracking-wide font-semibold">{{
                  catalog.t('intake.fSector')
                }}</span>
              </div>
              <pera-form-field
                [label]="catalog.t('intake.fSector')"
                [error]="errorOf('projectSector')"
              >
                <pera-select
                  formControlName="projectSector"
                  [options]="sectorOptions()"
                  [placeholder]="catalog.t('intake.selectSector')"
                  [error]="errorOf('projectSector')"
                />
              </pera-form-field>
            </section>

            <!-- project details -->
            <section class="flex flex-col gap-3">
              <div class="flex items-center gap-2.5">
                <span class="w-3.5 h-px bg-accent"></span>
                <span class="fs-label uppercase tracking-wide font-semibold">{{
                  catalog.t('intake.secProject')
                }}</span>
              </div>
              <div class="grid grid-cols-1 sm:grid-cols-2 gap-x-4 gap-y-3">
                <pera-form-field
                  class="sm:col-span-2"
                  [label]="catalog.t('intake.fUnitAddress')"
                  [error]="errorOf('unitAddress')"
                >
                  <pera-input formControlName="unitAddress" [error]="errorOf('unitAddress')" />
                </pera-form-field>
                <pera-form-field [label]="catalog.t('brief.fArea')" [error]="errorOf('areaSqm')">
                  <pera-input
                    type="number"
                    formControlName="areaSqm"
                    dir="ltr"
                    [error]="errorOf('areaSqm')"
                  />
                </pera-form-field>
              </div>
              <pera-form-field [label]="catalog.t('intake.usedDesignerBefore')">
                <pera-radio
                  formControlName="usedDesignerBefore"
                  [inline]="true"
                  [options]="yesNoOptions()"
                />
              </pera-form-field>
              @if (usedBefore()) {
                <pera-form-field [label]="catalog.t('brief.fExperience')">
                  <pera-radio
                    formControlName="designerExperience"
                    [inline]="true"
                    [options]="experienceOptions()"
                  />
                </pera-form-field>
              }
              @if (hasExperience()) {
                <pera-form-field
                  [label]="catalog.t('intake.fReason')"
                  [error]="errorOf('designerExperienceReason')"
                >
                  <pera-textarea
                    formControlName="designerExperienceReason"
                    [rows]="2"
                    [placeholder]="catalog.t('intake.reasonPh')"
                  />
                </pera-form-field>
              }
              @if (designerRuleKey(); as ruleKey) {
                <pera-alert tone="warning">{{ catalog.t(ruleKey) }}</pera-alert>
              }
            </section>

            <!-- residential -->
            @if (isResidential()) {
              <section class="flex flex-col gap-3">
                <div class="flex items-center gap-2.5">
                  <span class="w-3.5 h-px bg-accent"></span>
                  <span class="fs-label uppercase tracking-wide font-semibold">{{
                    catalog.t('intake.residentialSection')
                  }}</span>
                </div>
                <div class="grid grid-cols-1 sm:grid-cols-2 gap-x-4 gap-y-3">
                  <pera-form-field [label]="catalog.t('intake.fUnit')">
                    <pera-select
                      formControlName="unitType"
                      [options]="unitTypeOptions()"
                      [placeholder]="catalog.t('intake.selectUnit')"
                    />
                  </pera-form-field>
                  <pera-form-field [label]="catalog.t('intake.fCondition')">
                    <pera-select
                      formControlName="unitCondition"
                      [options]="unitConditionOptions()"
                      [placeholder]="catalog.t('intake.selectUnit')"
                    />
                  </pera-form-field>
                  <pera-form-field [label]="catalog.t('intake.fLicense')">
                    <pera-radio
                      formControlName="isLicensed"
                      [inline]="true"
                      [options]="yesNoOptions()"
                    />
                  </pera-form-field>
                  <pera-form-field [label]="catalog.t('intake.fTenure')">
                    <pera-radio
                      formControlName="isRented"
                      [inline]="true"
                      [options]="tenureOptions()"
                    />
                  </pera-form-field>
                  <pera-form-field
                    class="sm:col-span-2"
                    [label]="catalog.t('brief.fFinishingPurpose')"
                  >
                    <pera-select
                      formControlName="finishingPurpose"
                      [options]="finishingOptions()"
                      [placeholder]="catalog.t('intake.selectFinishing')"
                    />
                  </pera-form-field>
                </div>
              </section>
            }

            @if (serverAlert()) {
              <pera-alert tone="danger">{{ serverAlert() }}</pera-alert>
            }

            @if (!store.isConverted()) {
              <div class="flex justify-end" *peraCan="PERM.crm.leads.update">
                <pera-button variant="primary" [loading]="store.savingIntake()" (click)="save()">{{
                  catalog.t('intake.save')
                }}</pera-button>
              </div>
            }
          </form>
        </pera-card>
      }
    </div>
  `,
})
export class CrmLeadDetailComponent {
  private readonly fb = inject(FormBuilder);
  private readonly errors = inject(ErrorHandlerService);
  private readonly modal = inject(ModalService);
  private readonly confirm = inject(ConfirmService);
  private readonly toast = inject(ToastService);
  private readonly directory = inject(EmployeeService);
  private readonly permissions = inject(PermissionsService);
  protected readonly catalog = inject(CatalogService);
  protected readonly store = inject(LeadDetailStore);
  protected readonly PERM = PERM;

  /**
   * Employee id → full name, for the owner line. FINDING-P2-11: read per owner through
   * `GET /api/employees/{id}` (EmployeeEndpoints.cs:47-52, `employees.read` — the list's own claim),
   * so an inactive owner still resolves; the active-only list read missed them.
   */
  private readonly owners = signal<Record<string, string>>({});
  /** Owner ids already looked up (FINDING-P2-14) — recorded before the request goes out. */
  private readonly ownerLookups = new Set<string>();

  /** The status `pera-select`; its trigger gets an accessible name (FINDING-P2-11). */
  private readonly statusSelect = viewChild('statusSelect', { read: ElementRef });

  /** The status picker: it only ever holds a pick in flight, then resets to the placeholder. */
  readonly statusControl = new FormControl<string | null>(null);
  protected readonly statusOptions = computed<SelectOption[]>(() =>
    this.store.statusTargets().map((s) => ({
      value: String(s),
      label: this.catalog.t(this.statusKey(s)),
    })),
  );

  /** Bound from the `:leadId` route param (component input binding is on). */
  readonly leadId = input.required<string>();

  readonly serverAlert = signal<string | null>(null);

  // Discrete reactive mirrors of the controls that drive the reveals.
  private readonly sectorSig = signal('');
  private readonly usedBeforeSig = signal<boolean | null>(null);
  private readonly experienceSig = signal<number | null>(null);
  private readonly reasonSig = signal('');
  /** The last committed sector value, for reverting a cancelled destructive switch. */
  private prevSector = '';

  protected readonly isResidential = computed(
    () => Number(this.sectorSig()) === ProjectSector.Residential,
  );
  protected readonly usedBefore = computed(() => this.usedBeforeSig() === true);
  protected readonly hasExperience = computed(
    () => this.usedBefore() && this.experienceSig() != null,
  );

  protected readonly designerRuleKey = computed<CatalogKey | null>(() => {
    if (this.experienceSig() != null && this.usedBeforeSig() !== true)
      return 'intake.ruleExpNeedsUse';
    if (this.reasonSig().trim() !== '' && this.experienceSig() == null)
      return 'intake.ruleReasonNeedsExp';
    return null;
  });

  protected readonly sectorOptions = computed(() => this.selectOptions(SECTOR_KEYS));
  protected readonly unitTypeOptions = computed(() => this.selectOptions(UNIT_TYPE_KEYS));
  protected readonly unitConditionOptions = computed(() => this.selectOptions(UNIT_CONDITION_KEYS));
  protected readonly finishingOptions = computed(() => this.selectOptions(FINISHING_PURPOSE_KEYS));
  protected readonly experienceOptions = computed<RadioOption[]>(() =>
    Object.keys(EXPERIENCE_KEYS)
      .map(Number)
      .map((v) => ({
        value: v,
        label: this.catalog.t(EXPERIENCE_KEYS[v as keyof typeof EXPERIENCE_KEYS]),
      })),
  );
  protected readonly yesNoOptions = computed<RadioOption[]>(() => [
    { value: true, label: this.catalog.t('common.yes') },
    { value: false, label: this.catalog.t('common.no') },
  ]);
  protected readonly tenureOptions = computed<RadioOption[]>(() => [
    { value: true, label: this.catalog.t('tenure.rent') },
    { value: false, label: this.catalog.t('tenure.own') },
  ]);

  readonly form = this.fb.nonNullable.group(
    {
      jobTitle: ['', [Validators.maxLength(INTAKE_LIMITS.jobTitle)]],
      clientAddress: ['', [Validators.maxLength(INTAKE_LIMITS.clientAddress)]],
      projectSector: [''],
      unitAddress: ['', [Validators.maxLength(INTAKE_LIMITS.unitAddress)]],
      areaSqm: ['', [Validators.min(AREA_SQM_MIN), Validators.max(AREA_SQM_MAX)]],
      unitType: [''],
      unitCondition: [''],
      isLicensed: [null as boolean | null],
      isRented: [null as boolean | null],
      finishingPurpose: [''],
      usedDesignerBefore: [null as boolean | null],
      designerExperience: [null as number | null],
      designerExperienceReason: [
        '',
        [Validators.maxLength(INTAKE_LIMITS.designerExperienceReason)],
      ],
    },
    { validators: intakeDesignerRulesValidator() },
  );

  constructor() {
    this.form.controls.projectSector.valueChanges
      .pipe(takeUntilDestroyed())
      .subscribe((v) => void this.onSectorChange(v));
    this.form.controls.usedDesignerBefore.valueChanges.pipe(takeUntilDestroyed()).subscribe((v) => {
      this.usedBeforeSig.set(v);
      // Fix-up (d): toggling off clears the dependent experience + reason.
      if (v !== true) {
        this.form.patchValue(
          { designerExperience: null, designerExperienceReason: '' },
          { emitEvent: false },
        );
        this.experienceSig.set(null);
        this.reasonSig.set('');
      }
    });
    this.form.controls.designerExperience.valueChanges
      .pipe(takeUntilDestroyed())
      .subscribe((v) => this.experienceSig.set(v));
    this.form.controls.designerExperienceReason.valueChanges
      .pipe(takeUntilDestroyed())
      .subscribe((v) => this.reasonSig.set(v));

    effect(() => {
      const id = this.leadId();
      if (id) this.store.load(id);
    });

    // FINDING-P2-14: one lookup per owner id, and only with `employees.read` (the route's claim) —
    // a pending or 404 lookup is never re-sent on a lead reload. A 404 (no such employee) falls back
    // to "—" silently. FINDING-P2-22: the claim is tracked, so a late grant runs the lookup (the Set
    // keeps it to one); a 0 / 5xx failure forgets the id, so a later reload retries.
    effect(() => {
      const ownerId = this.store.lead()?.ownerId;
      if (!ownerId || this.ownerLookups.has(ownerId)) return;
      if (!this.permissions.can(PERM.employees.read)) return;
      this.ownerLookups.add(ownerId);
      this.directory
        .lookupById(ownerId)
        .pipe(
          catchError((e: unknown) => {
            if (e instanceof HttpErrorResponse && (e.status === 0 || e.status >= 500)) {
              this.ownerLookups.delete(ownerId);
            }
            return of(null);
          }),
        )
        .subscribe((e) => {
          if (e?.fullName) this.owners.update((m) => ({ ...m, [ownerId]: e.fullName }));
        });
    });

    // `pera-select` takes no aria-label of its own: name its trigger button here. The name starts
    // with the visible placeholder ("Change status") so the label stays in the name.
    afterRenderEffect(() => {
      const host = this.statusSelect()?.nativeElement as HTMLElement | undefined;
      host
        ?.querySelector('button')
        ?.setAttribute('aria-label', this.catalog.t('lead.statusSelectLabel'));
    });

    this.statusControl.valueChanges.pipe(takeUntilDestroyed()).subscribe((v) => {
      if (v) this.changeStatus(Number(v) as LeadStatus);
    });

    effect(() => {
      const intake = this.store.intake();
      if (!intake) return;
      const r = intake.residential ?? null;
      this.prevSector = intake.sector != null ? String(intake.sector) : '';
      this.form.patchValue({
        jobTitle: intake.jobTitle ?? '',
        clientAddress: intake.clientAddress ?? '',
        projectSector: intake.sector != null ? String(intake.sector) : '',
        unitAddress: intake.unitAddress ?? '',
        areaSqm: intake.areaSqm != null ? String(intake.areaSqm) : '',
        unitType: r?.unitType != null ? String(r.unitType) : '',
        unitCondition: r?.unitCondition != null ? String(r.unitCondition) : '',
        isLicensed: r?.isLicensed ?? null,
        isRented: r?.isRented ?? null,
        finishingPurpose: r?.finishingPurpose != null ? String(r.finishingPurpose) : '',
        usedDesignerBefore: intake.usedDesignerBefore ?? null,
        designerExperience: intake.designerExperience ?? null,
        designerExperienceReason: intake.designerExperienceReason ?? '',
      });
    });

    effect(() => {
      if (this.store.isConverted()) this.form.disable({ emitEvent: false });
      else this.form.enable({ emitEvent: false });
    });
  }

  /** Destructive-switch confirm: leaving Residential with answers prompts before clearing. */
  private async onSectorChange(v: string): Promise<void> {
    const prev = this.prevSector;
    this.sectorSig.set(v);
    const leavingResidential =
      prev === String(ProjectSector.Residential) &&
      Number(v) !== ProjectSector.Residential &&
      this.hasResidentialAnswers();
    if (leavingResidential) {
      const ok = await this.confirm.open({
        title: this.catalog.t('intake.confirmTitle'),
        body: this.catalog.t('intake.confirmMsg'),
        confirmLabel: this.catalog.t('intake.confirmClear'),
        tone: 'danger',
      });
      if (!ok) {
        this.form.patchValue({ projectSector: prev }, { emitEvent: false });
        this.sectorSig.set(prev);
        return;
      }
    }
    this.prevSector = v;
    if (Number(v) !== ProjectSector.Residential) {
      this.form.patchValue(
        { unitType: '', unitCondition: '', isLicensed: null, isRented: null, finishingPurpose: '' },
        { emitEvent: false },
      );
    }
  }

  private hasResidentialAnswers(): boolean {
    const v = this.form.getRawValue();
    return !!(
      v.unitType ||
      v.unitCondition ||
      v.isLicensed != null ||
      v.isRented != null ||
      v.finishingPurpose
    );
  }

  private selectOptions(keys: Record<number, CatalogKey>): SelectOption[] {
    return Object.keys(keys)
      .map(Number)
      .map((v) => ({ value: String(v), label: this.catalog.t(keys[v]) }));
  }

  protected statusKey(status: number) {
    return LEAD_STATUS_KEYS[status as keyof typeof LEAD_STATUS_KEYS];
  }
  protected statusTone(status: number) {
    return LEAD_STATUS_TONE[status as keyof typeof LEAD_STATUS_TONE];
  }
  protected sourceKey(source: number) {
    return LEAD_SOURCE_KEYS[source as keyof typeof LEAD_SOURCE_KEYS];
  }

  /** LI-1: a website lead arrives unassigned. */
  protected ownerName(ownerId: string | null): string {
    if (!ownerId) return this.catalog.t('leads.unassigned');
    return this.owners()[ownerId] ?? '—';
  }

  changeStatus(status: LeadStatus): void {
    const id = this.leadId();
    this.store.changeStatus(id, status, {
      onSuccess: () => {
        this.statusControl.setValue(null, { emitEvent: false });
        this.toast.show({ tone: 'success', message: this.catalog.t('lead.statusChanged') });
      },
      onError: (parsed) => {
        this.statusControl.setValue(null, { emitEvent: false });
        // errorInterceptor already toasted 0 / 5xx — one toast only. 403 is marked `handled(403)`
        // (FINDING-P2-16) and the store shows its localized catalog toast (FINDING-P2-24).
        if (parsed && (parsed.status === 0 || parsed.status === 403 || parsed.status >= 500))
          return;
        this.toast.show({
          tone: 'danger',
          message: parsed ? friendly(parsed) : this.catalog.t('lead.statusChangeFailed'),
        });
      },
    });
  }

  async openEdit(lead: CrmLead): Promise<void> {
    const data: EditLeadDialogData = { lead };
    const ok = await this.modal
      .open<boolean>(CrmLeadFormComponent, { size: 'lg', data })
      .afterClosed();
    if (ok) this.store.load(lead.id);
  }

  errorOf(name: string): string {
    const control = this.form.get(name);
    return control && control.touched && control.errors ? firstErrorMessage(control.errors) : '';
  }

  async openConvert(lead: CrmLead): Promise<void> {
    const data: ConvertLeadDialogData = { leadId: lead.id, lead };
    const ok = await this.modal
      .open<boolean>(CrmConvertLeadComponent, { size: 'md', data })
      .afterClosed();
    if (ok) this.store.load(lead.id);
  }

  save(): void {
    if (this.form.invalid) {
      this.form.markAllAsTouched();
      return;
    }
    const id = this.leadId();
    const v = this.form.getRawValue();
    const sector = v.projectSector ? (Number(v.projectSector) as ProjectSector) : null;

    const residential: ResidentialIntakeRequest | null =
      sector === ProjectSector.Residential
        ? {
            unitType: v.unitType ? Number(v.unitType) : null,
            unitCondition: v.unitCondition ? Number(v.unitCondition) : null,
            isLicensed: v.isLicensed,
            isRented: v.isRented,
            finishingPurpose: v.finishingPurpose ? Number(v.finishingPurpose) : null,
          }
        : null;

    const body: LeadIntakeRequest = {
      jobTitle: v.jobTitle.trim() || null,
      clientAddress: v.clientAddress.trim() || null,
      sector,
      unitAddress: v.unitAddress.trim() || null,
      areaSqm: v.areaSqm.trim() ? Number(v.areaSqm) : null,
      usedDesignerBefore: v.usedDesignerBefore,
      // C §8.1.10: experience and its reason only travel with usedDesignerBefore = true.
      designerExperience: v.usedDesignerBefore === true ? v.designerExperience : null,
      designerExperienceReason:
        v.usedDesignerBefore === true ? v.designerExperienceReason.trim() || null : null,
      residential,
    };

    this.serverAlert.set(null);
    this.store.upsertIntake(id, body, {
      onSuccess: () =>
        this.toast.show({ tone: 'success', message: this.catalog.t('intake.saved') }),
      onError: (err) => {
        if (err instanceof HttpErrorResponse) {
          const parsed = this.errors.parse(err);
          applyFinanceServerError(
            this.form,
            { ...parsed, generalMessage: friendly(parsed) },
            INTAKE_FIELD_MAP,
            this.serverAlert,
          );
          this.form.markAllAsTouched();
        }
      },
    });
  }
}
