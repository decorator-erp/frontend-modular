import {
  ChangeDetectionStrategy,
  Component,
  computed,
  effect,
  inject,
  input,
  signal,
} from '@angular/core';
import { takeUntilDestroyed } from '@angular/core/rxjs-interop';
import { FormBuilder, ReactiveFormsModule, Validators } from '@angular/forms';
import { CatalogService } from '@platform/i18n/catalog.service';
import type { CatalogKey } from '@platform/i18n/catalog/en';
import { LocaleService, type Locale } from '@platform/i18n';
import { ProjectSector } from '../../model/crm-enums';
import type { LeadIntakeRequest, PublicLeadSubmissionRequest } from '../../model';
import {
  AREA_SQM_MAX,
  AREA_SQM_MIN,
  INTAKE_LIMITS,
  intakeDesignerRulesValidator,
} from '../../model/validation/lead-intake-validators';
import { PeraValidators } from '@shared/forms';
import {
  PeraButtonComponent,
  PeraFormFieldComponent,
  PeraInputComponent,
  PeraSegmentedComponent,
  PeraSelectComponent,
  PeraTextareaComponent,
  SegmentedOption,
  SelectOption,
} from '@ds';
import {
  EXPERIENCE_KEYS,
  FINISHING_PURPOSE_KEYS,
  SECTOR_KEYS,
  UNIT_CONDITION_KEYS,
  UNIT_TYPE_KEYS,
} from '../brief/brief-head.component';
import { PublicIntakeStore } from '../../stores/public-intake.store';

type Phase = 'form' | 'submitting' | 'success' | 'rateLimited' | 'failure';

/**
 * Anonymous public lead-intake page — top-level route `/intake` (+ `/intake/:lang`), OUTSIDE
 * both shells, no guard. A two-step guided flow (About you → Your project) with a decorative
 * brand rail, per the v2 design handoff. Rebuilt with `@ds` primitives + tokens; keeps the
 * foundations' `PublicIntakeStore`, honeypot, and numeric-enum contract.
 */
@Component({
  selector: 'app-intake-page',
  changeDetection: ChangeDetectionStrategy.OnPush,
  providers: [PublicIntakeStore],
  imports: [
    ReactiveFormsModule,
    PeraButtonComponent,
    PeraFormFieldComponent,
    PeraInputComponent,
    PeraSegmentedComponent,
    PeraSelectComponent,
    PeraTextareaComponent,
  ],
  template: `
    <div
      class="min-h-screen bg-bg text-text-primary font-sans flex items-center justify-center px-5 py-8"
      [attr.dir]="locale.direction()"
    >
      <div
        class="relative w-full max-w-[var(--w-form)] grid grid-cols-1 md:grid-cols-[var(--w-panel)_1fr] bg-surface border border-border"
      >
        <!-- theme/lang controls -->
        <div class="absolute top-3 end-3 z-10 flex items-center gap-1">
          <div class="inline-flex border border-border">
            <button
              type="button"
              class="px-2.5 py-1 font-mono fs-micro cursor-pointer border-e border-border"
              [class.bg-text-primary]="locale.locale() === 'en'"
              [class.text-bg]="locale.locale() === 'en'"
              [class.text-text-secondary]="locale.locale() !== 'en'"
              (click)="setLocale('en')"
            >
              English
            </button>
            <button
              type="button"
              class="px-2.5 py-1 font-mono fs-micro cursor-pointer"
              [class.bg-text-primary]="locale.locale() === 'ar'"
              [class.text-bg]="locale.locale() === 'ar'"
              [class.text-text-secondary]="locale.locale() !== 'ar'"
              (click)="setLocale('ar')"
            >
              العربية
            </button>
          </div>
        </div>

        <!-- ===== brand rail ===== -->
        <aside
          class="hidden md:flex flex-col justify-between gap-8 p-7 border-e border-border bg-surface"
        >
          <div class="flex flex-col gap-3">
            <div class="flex items-center gap-2.5">
              <span class="relative w-icon-xs h-icon-xs shrink-0" aria-hidden="true">
                <span
                  class="absolute inset-0 border-[length:var(--hairline-strong)] border-text-primary"
                ></span>
                <span class="absolute top-1/2 inset-x-0 h-px bg-text-primary"></span>
                <span class="absolute start-1/2 inset-y-0 w-px bg-text-primary"></span>
              </span>
              <span class="text-base font-bold tracking-[0.18em]">PERA</span>
            </div>
            <div class="flex items-center gap-2">
              <span class="w-4 h-0.5 bg-accent"></span>
              <span class="fs-micro uppercase tracking-wide text-text-muted">{{
                catalog.t('public.kicker')
              }}</span>
            </div>
          </div>

          <div>
            <div class="flex items-baseline gap-3">
              <span class="fs-display font-semibold tracking-tight leading-none"
                >0{{ step() }}</span
              >
              <span class="fs-caption text-text-muted">/ 02</span>
            </div>
            @if (step() === 1) {
              <div class="mt-5">
                <h1 class="fs-h2 font-semibold tracking-tight m-0 mb-2">
                  {{ catalog.t('public.heroTitle') }}
                </h1>
                <p
                  class="fs-body-sm text-text-secondary leading-relaxed m-0 max-w-[var(--w-column-lg)]"
                >
                  {{ catalog.t('public.heroSub') }}
                </p>
              </div>
            }
            <div class="mt-6 flex flex-col">
              @for (s of stepIndex(); track s.n) {
                <div class="flex items-center gap-2.5 py-1.5 border-t border-border">
                  <span
                    class="fs-label w-5"
                    [class.text-accent]="s.active"
                    [class.text-text-muted]="!s.active"
                    >0{{ s.n }}</span
                  >
                  <span
                    class="fs-body-sm"
                    [class.font-semibold]="s.active"
                    [class.text-text-primary]="s.active"
                    [class.text-text-muted]="!s.active"
                    >{{ s.name }}</span
                  >
                </div>
              }
            </div>
          </div>

          <div class="fs-micro uppercase tracking-wide text-text-muted">
            {{ catalog.t('public.footer') }}
          </div>
        </aside>

        <!-- ===== form column ===== -->
        <main class="p-8">
          @switch (phase()) {
            @case ('submitting') {
              <div class="py-24 flex flex-col items-center gap-4 text-center">
                <span
                  class="w-8 h-8 border-2 border-border border-t-accent rounded-full animate-spin"
                ></span>
                <div class="fs-body-sm font-medium text-text-secondary">
                  {{ catalog.t('public.submitting') }}
                </div>
              </div>
            }
            @case ('success') {
              <div class="py-20 flex flex-col items-center gap-5 text-center">
                <span
                  class="w-icon-lg h-icon-lg flex items-center justify-center border-[length:var(--hairline-strong)] border-success text-success rounded-full"
                >
                  <svg
                    width="26"
                    height="26"
                    viewBox="0 0 24 24"
                    fill="none"
                    stroke="currentColor"
                    stroke-width="1.5"
                  >
                    <path d="m5 12 5 5L20 7" />
                  </svg>
                </span>
                <div>
                  <div class="fs-h3 font-semibold mb-2">{{ catalog.t('public.successTitle') }}</div>
                  <div
                    class="fs-body text-text-secondary leading-relaxed max-w-[var(--w-column-lg)]"
                  >
                    {{ catalog.t('public.successMsg') }}
                  </div>
                </div>
              </div>
            }
            @case ('rateLimited') {
              <div class="py-20 flex flex-col items-center gap-4 text-center">
                <span
                  class="w-icon-lg h-icon-lg flex items-center justify-center border-[length:var(--hairline-strong)] border-warning text-warning rounded-full"
                >
                  <svg
                    width="24"
                    height="24"
                    viewBox="0 0 24 24"
                    fill="none"
                    stroke="currentColor"
                    stroke-width="1.5"
                  >
                    <circle cx="12" cy="12" r="9" />
                    <path d="M12 7v5l3 2" />
                  </svg>
                </span>
                <div>
                  <div class="fs-h3 font-semibold mb-2">{{ catalog.t('public.rlTitle') }}</div>
                  <div
                    class="fs-body text-text-secondary leading-relaxed max-w-[var(--w-column-lg)]"
                  >
                    {{ catalog.t('public.rlMsg') }}
                  </div>
                </div>
                <pera-button variant="secondary" (click)="retry()">{{
                  catalog.t('public.tryAgain')
                }}</pera-button>
              </div>
            }
            @case ('failure') {
              <div class="py-20 flex flex-col items-center gap-4 text-center">
                <span
                  class="w-icon-lg h-icon-lg flex items-center justify-center border-[length:var(--hairline-strong)] border-danger text-danger rounded-full"
                >
                  <svg
                    width="24"
                    height="24"
                    viewBox="0 0 24 24"
                    fill="none"
                    stroke="currentColor"
                    stroke-width="1.5"
                  >
                    <path d="M12 8v5" />
                    <path d="M12 16h.01" />
                    <circle cx="12" cy="12" r="9" />
                  </svg>
                </span>
                <div>
                  <div class="fs-h3 font-semibold mb-2">{{ catalog.t('public.failTitle') }}</div>
                  <div
                    class="fs-body text-text-secondary leading-relaxed max-w-[var(--w-column-lg)]"
                  >
                    {{ failureMessage() }}
                  </div>
                </div>
                <pera-button variant="secondary" (click)="retry()">{{
                  catalog.t('public.tryAgain')
                }}</pera-button>
              </div>
            }
            @default {
              <form [formGroup]="form" class="flex flex-col gap-6" (ngSubmit)="submit()" novalidate>
                <!-- honeypot: present, invisible, always empty -->
                <div class="absolute w-px h-px overflow-hidden opacity-0 -z-10" aria-hidden="true">
                  <label
                    >Website<input
                      formControlName="website"
                      type="text"
                      tabindex="-1"
                      autocomplete="off"
                  /></label>
                </div>

                @if (step() === 1) {
                  <div class="flex flex-col gap-5">
                    <div class="grid grid-cols-1 sm:grid-cols-2 gap-x-4 gap-y-5">
                      <pera-form-field
                        [label]="catalog.t('public.first')"
                        [required]="true"
                        [error]="errorText('firstName')"
                      >
                        <pera-input formControlName="firstName" [error]="errorText('firstName')" />
                      </pera-form-field>
                      <pera-form-field
                        [label]="catalog.t('public.last')"
                        [required]="true"
                        [error]="errorText('lastName')"
                      >
                        <pera-input formControlName="lastName" [error]="errorText('lastName')" />
                      </pera-form-field>
                    </div>
                    <pera-form-field
                      [label]="catalog.t('public.phone')"
                      [error]="errorText('phone')"
                    >
                      <pera-input formControlName="phone" dir="ltr" [error]="errorText('phone')" />
                    </pera-form-field>
                    <pera-form-field
                      [label]="catalog.t('public.email')"
                      [error]="errorText('email')"
                    >
                      <pera-input
                        type="email"
                        formControlName="email"
                        dir="ltr"
                        [error]="errorText('email')"
                      />
                    </pera-form-field>
                  </div>
                } @else {
                  <div class="flex flex-col gap-5">
                    <!-- sector -->
                    <div class="flex items-center gap-2.5">
                      <span class="w-3.5 h-px bg-accent"></span>
                      <span class="fs-label uppercase tracking-wide font-semibold">{{
                        catalog.t('intake.fSector')
                      }}</span>
                    </div>
                    <pera-form-field [label]="catalog.t('intake.fSector')">
                      <pera-select
                        formControlName="projectSector"
                        [options]="sectorOptions()"
                        [placeholder]="catalog.t('intake.selectSector')"
                      />
                    </pera-form-field>

                    @if (hasSector()) {
                      <!-- client info -->
                      <div class="flex items-center gap-2.5 mt-2">
                        <span class="w-3.5 h-px bg-accent"></span>
                        <span class="fs-label uppercase tracking-wide font-semibold">{{
                          catalog.t('intake.secClient')
                        }}</span>
                      </div>
                      <pera-form-field [label]="catalog.t('intake.fJobTitle')">
                        <pera-input formControlName="jobTitle" />
                      </pera-form-field>
                      <pera-form-field
                        [label]="catalog.t('intake.fResidence')"
                        [hint]="catalog.t('intake.residenceNote')"
                      >
                        <pera-input formControlName="clientAddress" />
                      </pera-form-field>

                      <!-- project details -->
                      <div class="flex items-center gap-2.5 mt-2">
                        <span class="w-3.5 h-px bg-accent"></span>
                        <span class="fs-label uppercase tracking-wide font-semibold">{{
                          catalog.t('intake.secProject')
                        }}</span>
                      </div>
                      <pera-form-field [label]="catalog.t('intake.fUnitAddress')">
                        <pera-input formControlName="unitAddress" />
                      </pera-form-field>
                      <pera-form-field
                        [label]="catalog.t('brief.fArea')"
                        [error]="errorText('areaSqm')"
                      >
                        <pera-input
                          type="number"
                          formControlName="areaSqm"
                          dir="ltr"
                          [error]="errorText('areaSqm')"
                        />
                      </pera-form-field>
                      <pera-form-field [label]="catalog.t('intake.usedDesignerBefore')">
                        <pera-segmented
                          formControlName="usedDesignerBefore"
                          [options]="yesNoOptions()"
                        />
                      </pera-form-field>
                      @if (usedBefore()) {
                        <pera-form-field [label]="catalog.t('brief.fExperience')">
                          <pera-segmented
                            formControlName="designerExperience"
                            [options]="experienceOptions()"
                          />
                        </pera-form-field>
                      }
                      @if (hasExperience()) {
                        <pera-form-field [label]="catalog.t('intake.fReason')">
                          <pera-textarea
                            formControlName="designerExperienceReason"
                            [rows]="2"
                            [placeholder]="catalog.t('intake.reasonPh')"
                          />
                        </pera-form-field>
                      }

                      @if (isResidential()) {
                        <!-- residential specifics -->
                        <div class="flex items-center gap-2.5 mt-2">
                          <span class="w-3.5 h-px bg-accent"></span>
                          <span class="fs-label uppercase tracking-wide font-semibold">{{
                            catalog.t('intake.residentialSection')
                          }}</span>
                        </div>
                        <div class="grid grid-cols-1 sm:grid-cols-2 gap-x-4 gap-y-5">
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
                            <pera-segmented
                              formControlName="isLicensed"
                              [options]="yesNoOptions()"
                            />
                          </pera-form-field>
                          <pera-form-field [label]="catalog.t('intake.fTenure')">
                            <pera-segmented
                              formControlName="isRented"
                              [options]="tenureOptions()"
                            />
                          </pera-form-field>
                        </div>
                        <pera-form-field [label]="catalog.t('brief.fFinishingPurpose')">
                          <pera-select
                            formControlName="finishingPurpose"
                            [options]="finishingOptions()"
                            [placeholder]="catalog.t('intake.selectFinishing')"
                          />
                        </pera-form-field>
                      } @else {
                        <div
                          class="flex gap-2 p-3 fs-body-sm text-text-secondary bg-surface-muted border border-border"
                        >
                          {{ catalog.t('intake.comingSoon', { sector: sectorLabel() }) }}
                        </div>
                      }
                    }
                  </div>
                }

                <div class="flex items-center gap-4 pt-1 border-t border-border">
                  @if (step() === 2) {
                    <pera-button variant="tertiary" type="button" (click)="back()">{{
                      catalog.t('public.back')
                    }}</pera-button>
                  }
                  <span class="flex-1"></span>
                  <pera-button variant="primary" type="submit" [block]="step() === 1">{{
                    step() === 2 ? catalog.t('public.submit') : catalog.t('public.next')
                  }}</pera-button>
                </div>
                @if (step() === 1) {
                  <p class="fs-caption text-text-muted leading-relaxed m-0">
                    {{ catalog.t('public.privacy') }}
                  </p>
                }
              </form>
            }
          }
        </main>
      </div>
    </div>
  `,
})
export class IntakePageComponent {
  private readonly fb = inject(FormBuilder);
  protected readonly catalog = inject(CatalogService);
  protected readonly locale = inject(LocaleService);
  protected readonly store = inject(PublicIntakeStore);

  /** Bound from the optional `/intake/:lang` route param (component input binding is on). */
  readonly lang = input<string>();

  protected readonly step = signal<1 | 2>(1);
  protected readonly submitted = signal(false);

  // Reactive mirrors of the controls that drive the reveals (recompute on value + locale).
  private readonly sectorSig = signal('');
  private readonly usedBeforeSig = signal<boolean | null>(null);
  private readonly experienceSig = signal<number | null>(null);

  protected readonly hasSector = computed(() => this.sectorSig() !== '');
  protected readonly isResidential = computed(
    () => Number(this.sectorSig()) === ProjectSector.Residential,
  );
  protected readonly usedBefore = computed(() => this.usedBeforeSig() === true);
  protected readonly hasExperience = computed(
    () => this.usedBefore() && this.experienceSig() != null,
  );
  protected readonly sectorLabel = computed(() => {
    const s = this.sectorSig();
    return s ? this.catalog.t(SECTOR_KEYS[Number(s) as ProjectSector]) : '';
  });

  protected readonly phase = computed<Phase>(() => {
    const s = this.store.status();
    if (s === 'submitting') return 'submitting';
    if (s === 'success') return 'success';
    if (s === 'rateLimited') return 'rateLimited';
    if (s === 'error' && Object.keys(this.store.fieldErrors()).length === 0) return 'failure';
    return 'form';
  });

  protected readonly failureMessage = computed(() => {
    switch (this.store.errorCode()) {
      case 'crm.leads.SectorMismatch':
        return this.catalog.t('public.errSector');
      case 'crm.leads.DesignerExperienceWithoutUse':
        return this.catalog.t('public.errDesignerUse');
      case 'crm.leads.ExperienceReasonWithoutExperience':
        return this.catalog.t('public.errReason');
      default:
        return this.catalog.t('public.failMsg');
    }
  });

  protected readonly stepIndex = computed(() =>
    [
      { n: 1, name: this.catalog.t('public.stepYou') },
      { n: 2, name: this.catalog.t('public.stepProject') },
    ].map((s) => ({ ...s, active: s.n === this.step() })),
  );

  protected readonly sectorOptions = computed(() => this.selectOptions(SECTOR_KEYS));
  protected readonly unitTypeOptions = computed(() => this.selectOptions(UNIT_TYPE_KEYS));
  protected readonly unitConditionOptions = computed(() => this.selectOptions(UNIT_CONDITION_KEYS));
  protected readonly finishingOptions = computed(() => this.selectOptions(FINISHING_PURPOSE_KEYS));
  protected readonly experienceOptions = computed<SegmentedOption[]>(() =>
    Object.keys(EXPERIENCE_KEYS)
      .map(Number)
      .map((v) => ({
        value: v,
        label: this.catalog.t(EXPERIENCE_KEYS[v as keyof typeof EXPERIENCE_KEYS]),
      })),
  );
  protected readonly yesNoOptions = computed<SegmentedOption[]>(() => [
    { value: true, label: this.catalog.t('common.yes') },
    { value: false, label: this.catalog.t('common.no') },
  ]);
  protected readonly tenureOptions = computed<SegmentedOption[]>(() => [
    { value: true, label: this.catalog.t('tenure.rent') },
    { value: false, label: this.catalog.t('tenure.own') },
  ]);

  readonly form = this.fb.nonNullable.group(
    {
      firstName: ['', [Validators.required, Validators.maxLength(INTAKE_LIMITS.firstName)]],
      lastName: ['', [Validators.required, Validators.maxLength(INTAKE_LIMITS.lastName)]],
      phone: ['', [PeraValidators.phone, Validators.maxLength(INTAKE_LIMITS.phone)]],
      email: ['', [PeraValidators.email, Validators.maxLength(INTAKE_LIMITS.email)]],
      projectSector: [''],
      jobTitle: ['', [Validators.maxLength(INTAKE_LIMITS.jobTitle)]],
      clientAddress: ['', [Validators.maxLength(INTAKE_LIMITS.clientAddress)]],
      unitAddress: ['', [Validators.maxLength(INTAKE_LIMITS.unitAddress)]],
      areaSqm: ['', [Validators.min(AREA_SQM_MIN), Validators.max(AREA_SQM_MAX)]],
      usedDesignerBefore: [null as boolean | null],
      designerExperience: [null as number | null],
      designerExperienceReason: [
        '',
        [Validators.maxLength(INTAKE_LIMITS.designerExperienceReason)],
      ],
      unitType: [''],
      unitCondition: [''],
      isLicensed: [null as boolean | null],
      isRented: [null as boolean | null],
      finishingPurpose: [''],
      website: [''],
    },
    { validators: intakeDesignerRulesValidator() },
  );

  constructor() {
    this.form.controls.projectSector.valueChanges.pipe(takeUntilDestroyed()).subscribe((v) => {
      this.sectorSig.set(v);
      // Sector away from Residential → drop the residential sub-answers (public: silent).
      if (Number(v) !== ProjectSector.Residential) {
        this.form.patchValue(
          {
            unitType: '',
            unitCondition: '',
            isLicensed: null,
            isRented: null,
            finishingPurpose: '',
          },
          { emitEvent: false },
        );
      }
    });
    this.form.controls.usedDesignerBefore.valueChanges.pipe(takeUntilDestroyed()).subscribe((v) => {
      this.usedBeforeSig.set(v);
      // Fix-up (d): toggling off clears the dependent experience + reason.
      if (v !== true) {
        this.form.patchValue(
          { designerExperience: null, designerExperienceReason: '' },
          { emitEvent: false },
        );
        this.experienceSig.set(null);
      }
    });
    this.form.controls.designerExperience.valueChanges
      .pipe(takeUntilDestroyed())
      .subscribe((v) => this.experienceSig.set(v));

    // `/intake/:lang` seeds the initial language.
    effect(() => {
      const l = this.lang();
      if (l === 'en' || l === 'ar') this.locale.locale.set(l);
    });

    // Fix-up (b): apply any 400 field errors inline on the matching controls.
    effect(() => {
      const fe = this.store.fieldErrors();
      for (const [key, msgs] of Object.entries(fe)) {
        const control = this.form.get(key);
        if (control && msgs[0]) control.setErrors({ ...(control.errors ?? {}), server: msgs[0] });
      }
      if (Object.keys(fe).length) this.submitted.set(true);
    });
  }

  private selectOptions(keys: Record<number, CatalogKey>): SelectOption[] {
    return Object.keys(keys)
      .map(Number)
      .map((v) => ({ value: String(v), label: this.catalog.t(keys[v]) }));
  }

  protected setLocale(target: Locale): void {
    if (this.locale.locale() !== target) this.locale.toggle();
  }

  errorText(name: string): string {
    const c = this.form.get(name);
    if (!c || !(c.touched || this.submitted()) || !c.errors) return '';
    const e = c.errors;
    if (e['required']) return this.catalog.t('public.reqField');
    if (e['email']) return this.catalog.t('public.errEmail');
    if (e['phone']) return this.catalog.t('public.errPhone');
    if (e['min'] || e['max']) return this.catalog.t('intake.areaInvalid');
    if (e['server']) return String(e['server']);
    if (e['maxlength']) return this.catalog.t('public.tooLong');
    return this.catalog.t('public.reqField');
  }

  back(): void {
    this.step.set(1);
    this.submitted.set(false);
  }

  retry(): void {
    this.store.reset();
  }

  submit(): void {
    if (this.step() === 1) {
      const c = this.form.controls;
      c.firstName.markAsTouched();
      c.lastName.markAsTouched();
      c.phone.markAsTouched();
      c.email.markAsTouched();
      if (c.firstName.invalid || c.lastName.invalid || c.phone.invalid || c.email.invalid) {
        this.submitted.set(true);
        return;
      }
      this.step.set(2);
      this.submitted.set(false);
      return;
    }

    if (this.form.invalid) {
      this.form.markAllAsTouched();
      this.submitted.set(true);
      return;
    }
    this.store.submit(this.buildBody());
  }

  private buildBody(): PublicLeadSubmissionRequest {
    const v = this.form.getRawValue();
    const sector = v.projectSector ? (Number(v.projectSector) as ProjectSector) : null;
    const residential =
      sector === ProjectSector.Residential
        ? {
            unitType: v.unitType ? Number(v.unitType) : null,
            unitCondition: v.unitCondition ? Number(v.unitCondition) : null,
            isLicensed: v.isLicensed,
            isRented: v.isRented,
            finishingPurpose: v.finishingPurpose ? Number(v.finishingPurpose) : null,
          }
        : null;
    const intake: LeadIntakeRequest = {
      jobTitle: v.jobTitle.trim() || null,
      clientAddress: v.clientAddress.trim() || null,
      projectSector: sector,
      unitAddress: v.unitAddress.trim() || null,
      areaSqm: v.areaSqm.trim() ? Number(v.areaSqm) : null,
      usedDesignerBefore: v.usedDesignerBefore,
      designerExperience: v.designerExperience,
      designerExperienceReason: v.designerExperienceReason.trim() || null,
      residential,
    };
    return {
      firstName: v.firstName.trim(),
      lastName: v.lastName.trim(),
      phone: v.phone.trim() || null,
      email: v.email.trim() || null,
      website: v.website, // honeypot — always empty
      intake,
    };
  }
}
