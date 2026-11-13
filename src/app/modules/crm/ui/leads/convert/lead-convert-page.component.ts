import { LoginCredentialsComponent } from '@shared/ui/login-credentials.component';
import {
  viewChild,
  ViewContainerRef,
  ComponentRef,
  ChangeDetectionStrategy,
  Component,
  computed,
  effect,
  inject,
  input,
  signal,
} from '@angular/core';
import { FormBuilder, FormControl, ReactiveFormsModule, Validators } from '@angular/forms';
import { Router, RouterLink } from '@angular/router';
import { catchError, forkJoin, of } from 'rxjs';
import { CatalogService } from '@platform/i18n/catalog.service';
import type { CatalogKey } from '@platform/i18n/catalog/en';
import { friendlyMessage } from '@platform/errors/error-catalog';
import { ToastService } from '@platform/feedback/toast.service';
import { PERM, PermissionsService } from '@platform/permissions';
import { emptyPage } from '@platform/types';
import { PeraValidators, firstErrorMessage } from '@shared/forms';
import { cryptoRandomPassword } from '@shared/ui/password';
import {
  PeraAlertComponent,
  PeraButtonComponent,
  PeraCardComponent,
  PeraDateInputComponent,
  PeraFormFieldComponent,
  PeraInputComponent,
  PeraSegmentedComponent,
  PeraSelectComponent,
  PeraTextareaComponent,
  type SegmentedOption,
  type SelectOption,
} from '@ds';
import { StageTemplatesService, type TemplateStage } from '@modules/library';
import {
  loadSowDraftEditor,
  type SowDraftEditorComponent,
  type SowItemUpdate,
  type SowTemplateOption,
  type UpdateScopeOfWorkHeaderRequest,
} from '@modules/projects';
import { CrmLeadService, type CrmLead } from '../../../data/crm-lead.service';
import { SITES_CREATE_PERMISSION } from '../../../data/crm-site-survey.service';
import type { CrmClientOption, LeadIntakeResponse } from '../../../model';
import { LeadStatus, type ProjectSector } from '../../../model/crm-enums';
import {
  clientDraftFromLead,
  EMPTY_SITE_DATA,
  draftScope,
  projectDraftFromLead,
  scopeBlockers,
  siteDataFromIntake,
  type ConvertPlan,
  type ConvertSiteData,
  type ConvertScopeItem,
  type ConvertStep,
} from '../../../model/lead-convert.model';
import { LeadConvertRunner } from '../../../stores/lead-convert.runner';
import { SECTOR_KEYS, UNIT_CONDITION_KEYS, UNIT_TYPE_KEYS } from '../../brief/brief-head.component';

type WizardStep = 1 | 2 | 3 | 4 | 5;

const STEP_KEYS: Record<WizardStep, CatalogKey> = {
  1: 'convert.stepClient',
  2: 'convert.stepProject',
  3: 'convert.stepScope',
  4: 'convert.stepSite',
  5: 'convert.stepReview',
};

const PROGRESS_KEYS: Record<ConvertStep, CatalogKey> = {
  client: 'convert.progressClient',
  project: 'convert.progressProject',
  scope: 'convert.progressScope',
  site: 'convert.progressSite',
  lead: 'convert.progressLead',
};

const EMPTY_HEADER: UpdateScopeOfWorkHeaderRequest = {
  durationDays: null,
  plannedStartDate: null,
  adjustmentAmount: 0,
  adjustmentNote: null,
  notes: null,
};

/**
 * LC-1: converting a lead sets up its project. A five-step page — client, project, scope of work, site,
 * review — that creates nothing until **Create**, then runs `LeadConvertRunner`: the client (new, or an
 * existing one), a Stage project, its scope of work confirmed into stages, a draft site survey, and the
 * lead converted into the client last. A failed step can be retried without duplicates.
 *
 * The scope step reuses the project scope page's presentational parts on a scope that doesn't exist yet
 * (`draftScope`); its confirm block is hidden because Create confirms it.
 */
@Component({
  selector: 'app-lead-convert-page',
  changeDetection: ChangeDetectionStrategy.OnPush,
  providers: [LeadConvertRunner],
  imports: [
    LoginCredentialsComponent,
    ReactiveFormsModule,
    RouterLink,
    PeraAlertComponent,
    PeraButtonComponent,
    PeraCardComponent,
    PeraDateInputComponent,
    PeraFormFieldComponent,
    PeraInputComponent,
    PeraSegmentedComponent,
    PeraSelectComponent,
    PeraTextareaComponent,
  ],
  template: `
    <div class="flex flex-col gap-4 max-w-[var(--w-form)] mx-auto w-full">
      <div class="flex items-start justify-between gap-3 flex-wrap">
        <div class="flex flex-col gap-1">
          <h1 class="fs-h2 font-semibold m-0">{{ catalog.t('convert.wizardTitle') }}</h1>
          @if (lead(); as l) {
            <p class="fs-body-sm text-text-secondary m-0">
              {{ l.firstName }} {{ l.lastName }} · {{ catalog.t('convert.wizardSub') }}
            </p>
          }
        </div>
        <a class="fs-caption text-accent underline" [routerLink]="['/crm/leads', leadId()]">{{
          catalog.t('convert.backToLead')
        }}</a>
      </div>

      @if (lead()?.status === converted) {
        <pera-alert tone="info">{{ catalog.t('convert.alreadyConverted') }}</pera-alert>
      } @else if (lead()) {
        @if (missingPermissions().length) {
          <pera-alert tone="warning" data-testid="convert-missing-perms">
            {{ catalog.t('convert.missingPerms') }}
            <span dir="ltr">{{ missingPermissions().join(', ') }}</span>
          </pera-alert>
        }
        @if (resuming()) {
          <pera-alert tone="info">{{ catalog.t('convert.resumeNote') }}</pera-alert>
        }

        <!-- step strip -->
        <ol
          class="m-0 p-0 list-none flex sm:grid sm:grid-cols-5 border border-border bg-surface rounded-card"
        >
          @for (s of stepIndex(); track s.n) {
            <li
              class="flex items-center gap-2 px-2 sm:px-3 py-2 fs-body-sm border-e border-border last:border-e-0 min-w-0 {{
                s.active ? 'flex-1' : 'shrink-0'
              }}"
              [class.font-semibold]="s.active"
              [class.text-text-primary]="s.active"
              [class.text-text-muted]="!s.active"
            >
              <span class="fs-label" [class.text-accent]="s.active">0{{ s.n }}</span>
              <!-- RS-1: on a phone only the active step keeps its name; the others show 0N. -->
              <span class="truncate {{ s.active ? '' : 'max-sm:hidden' }}">{{ s.name }}</span>
            </li>
          }
        </ol>

        <pera-card>
          @switch (step()) {
            @case (1) {
              <div class="flex flex-col gap-4" data-testid="convert-step-client">
                <pera-segmented [options]="clientModeOptions()" [formControl]="clientModeControl" />
                @if (clientMode() === 'new') {
                  <p class="fs-body-sm text-text-secondary m-0">
                    {{ catalog.t('convert.clientNewHint') }}
                  </p>
                  <form
                    [formGroup]="clientForm"
                    class="grid grid-cols-1 sm:grid-cols-2 gap-x-4 gap-y-4"
                  >
                    <pera-form-field
                      [label]="catalog.t('convert.fFirstName')"
                      [required]="true"
                      [error]="errorOf(clientForm, 'firstName')"
                    >
                      <pera-input formControlName="firstName" />
                    </pera-form-field>
                    <pera-form-field
                      [label]="catalog.t('convert.fLastName')"
                      [required]="true"
                      [error]="errorOf(clientForm, 'lastName')"
                    >
                      <pera-input formControlName="lastName" />
                    </pera-form-field>
                    <pera-form-field
                      [label]="catalog.t('convert.fEmail')"
                      [required]="true"
                      [error]="errorOf(clientForm, 'email')"
                    >
                      <pera-input type="email" dir="ltr" formControlName="email" />
                    </pera-form-field>
                    <pera-form-field
                      [label]="catalog.t('convert.fPhone')"
                      [required]="true"
                      [error]="errorOf(clientForm, 'phone')"
                    >
                      <pera-input dir="ltr" formControlName="phone" />
                    </pera-form-field>
                    <pera-form-field
                      class="sm:col-span-2"
                      [label]="catalog.t('convert.fAddress')"
                      [required]="true"
                      [error]="errorOf(clientForm, 'address')"
                    >
                      <pera-input formControlName="address" />
                    </pera-form-field>
                    <pera-form-field
                      class="sm:col-span-2"
                      [label]="catalog.t('convert.fNotes')"
                      [error]="errorOf(clientForm, 'notes')"
                    >
                      <pera-textarea formControlName="notes" [rows]="2" />
                    </pera-form-field>
                  </form>
                } @else {
                  <pera-form-field
                    [label]="catalog.t('convert.fExistingClient')"
                    [required]="true"
                    [error]="existingClientError()"
                  >
                    <pera-select
                      [formControl]="existingClientId"
                      [options]="clientOptions()"
                      [placeholder]="catalog.t('convert.selectClient')"
                    />
                  </pera-form-field>
                }
              </div>
            }
            @case (2) {
              <form
                [formGroup]="projectForm"
                class="grid grid-cols-1 sm:grid-cols-2 gap-x-4 gap-y-4"
                data-testid="convert-step-project"
              >
                <pera-form-field
                  [label]="catalog.t('convert.fCode')"
                  [required]="true"
                  [error]="errorOf(projectForm, 'code')"
                >
                  <pera-input dir="ltr" formControlName="code" />
                </pera-form-field>
                <pera-form-field
                  [label]="catalog.t('convert.fStart')"
                  [error]="errorOf(projectForm, 'estimatedStartDate')"
                >
                  <pera-date-input formControlName="estimatedStartDate" />
                </pera-form-field>
                <pera-form-field
                  class="sm:col-span-2"
                  [label]="catalog.t('convert.fProjectName')"
                  [required]="true"
                  [error]="errorOf(projectForm, 'name')"
                >
                  <pera-input formControlName="name" />
                </pera-form-field>
                <pera-form-field
                  class="sm:col-span-2"
                  [label]="catalog.t('convert.fProjectAddress')"
                  [required]="true"
                  [error]="errorOf(projectForm, 'address')"
                >
                  <pera-input formControlName="address" />
                </pera-form-field>
                <pera-form-field
                  class="sm:col-span-2"
                  [label]="catalog.t('convert.fDescription')"
                  [error]="errorOf(projectForm, 'description')"
                >
                  <pera-textarea formControlName="description" [rows]="2" />
                </pera-form-field>
              </form>
            }
            @case (3) {
              <div class="flex flex-col gap-4" data-testid="convert-step-scope">
                <p class="fs-body-sm text-text-secondary m-0">
                  {{ catalog.t('convert.scopeHint') }}
                </p>
                <!-- The projects module's scope editor, loaded on demand (loadSowDraftEditor). -->
                <ng-container #sowHost />
                @if (scopeTried() && scopeProblems().length) {
                  <pera-alert tone="warning" data-testid="convert-scope-problems">
                    <ul class="m-0 ps-5">
                      @for (p of scopeProblems(); track p) {
                        <li>{{ p }}</li>
                      }
                    </ul>
                  </pera-alert>
                }
              </div>
            }
            @case (4) {
              <div class="flex flex-col gap-4" data-testid="convert-step-site">
                <p class="fs-body-sm text-text-secondary m-0">
                  {{ catalog.t('convert.siteHint') }}
                </p>
                <form
                  [formGroup]="siteForm"
                  class="grid grid-cols-1 sm:grid-cols-2 gap-x-4 gap-y-4"
                >
                  <pera-form-field
                    class="sm:col-span-2"
                    [label]="catalog.t('sv.address')"
                    [error]="errorOf(siteForm, 'address')"
                  >
                    <pera-input formControlName="address" />
                  </pera-form-field>
                  <pera-form-field [label]="catalog.t('sv.f.unitType')">
                    <pera-select
                      formControlName="unitType"
                      [options]="unitTypeOptions()"
                      [placeholder]="catalog.t('intake.selectUnit')"
                    />
                  </pera-form-field>
                  <pera-form-field [label]="catalog.t('sv.f.unitCondition')">
                    <pera-select
                      formControlName="unitCondition"
                      [options]="unitConditionOptions()"
                      [placeholder]="catalog.t('intake.selectUnit')"
                    />
                  </pera-form-field>
                  <pera-form-field
                    [label]="catalog.t('sv.f.areaSqm') + ' (' + catalog.t('sv.unitM2') + ')'"
                    [error]="errorOf(siteForm, 'areaSqm')"
                  >
                    <pera-input type="number" dir="ltr" formControlName="areaSqm" />
                  </pera-form-field>
                  <span></span>
                  <pera-form-field [label]="catalog.t('sv.f.isLicensed')">
                    <pera-segmented formControlName="isLicensed" [options]="yesNoOptions()" />
                  </pera-form-field>
                  <pera-form-field [label]="catalog.t('sv.f.isRented')">
                    <pera-segmented formControlName="isRented" [options]="yesNoOptions()" />
                  </pera-form-field>
                  <pera-form-field
                    class="sm:col-span-2"
                    [label]="catalog.t('sv.f.notes')"
                    [error]="errorOf(siteForm, 'notes')"
                  >
                    <pera-textarea formControlName="notes" [rows]="2" />
                  </pera-form-field>
                </form>
              </div>
            }
            @case (5) {
              @if (doneProjectId() && runner.issuedLogin(); as login) {
                <!-- LC-2: the new client's sign-in details, shown once after a successful convert. -->
                <div class="flex flex-col gap-3" data-testid="convert-credentials">
                  <h2 class="m-0 fs-h3 font-semibold">{{ catalog.t('creds.title') }}</h2>
                  <app-login-credentials [login]="login" />
                </div>
              } @else {
                <div class="flex flex-col gap-4" data-testid="convert-step-review">
                  <dl
                    class="m-0 grid grid-cols-1 sm:grid-cols-[max-content_1fr] gap-x-6 gap-y-2 fs-body-sm"
                  >
                    <dt class="text-text-muted">{{ catalog.t('convert.stepClient') }}</dt>
                    <dd class="m-0">{{ reviewClient() }}</dd>
                    <dt class="text-text-muted">{{ catalog.t('convert.stepProject') }}</dt>
                    <dd class="m-0">
                      <span dir="ltr">{{ projectForm.controls.code.value }}</span> ·
                      {{ projectForm.controls.name.value }}
                    </dd>
                    <dt class="text-text-muted">{{ catalog.t('convert.stepScope') }}</dt>
                    <dd class="m-0">
                      {{
                        catalog.t('convert.reviewScope', {
                          stages: scopeItems().length,
                          days: scopeHeader().durationDays ?? 0,
                          total: totalText(),
                        })
                      }}
                    </dd>
                    <dt class="text-text-muted">{{ catalog.t('convert.stepSite') }}</dt>
                    <dd class="m-0">{{ siteForm.controls.address.value || '—' }}</dd>
                  </dl>
                  <p class="fs-caption text-text-muted m-0">{{ catalog.t('convert.carryNote') }}</p>

                  <ul
                    class="m-0 p-0 list-none flex flex-col gap-1.5"
                    data-testid="convert-progress"
                  >
                    @for (p of progressRows(); track p.step) {
                      <li class="flex items-center gap-2 fs-body-sm">
                        <span
                          class="w-2 h-2 rounded-full shrink-0"
                          [class.bg-success]="p.state === 'done'"
                          [class.bg-accent]="p.state === 'running'"
                          [class.bg-danger]="p.state === 'failed'"
                          [class.bg-border-strong]="p.state === 'pending'"
                        ></span>
                        <span [class.text-text-muted]="p.state === 'pending'">{{ p.label }}</span>
                      </li>
                    }
                  </ul>
                  @if (runner.error(); as message) {
                    <pera-alert tone="danger" data-testid="convert-error">{{ message }}</pera-alert>
                  }
                </div>
              }
            }
          }
        </pera-card>

        @if (doneProjectId(); as projectId) {
          <div class="flex items-center gap-3">
            <span class="flex-1"></span>
            <pera-button
              variant="primary"
              data-testid="convert-open-project"
              (click)="openProject(projectId)"
              >{{ catalog.t('creds.openProject') }}</pera-button
            >
          </div>
        } @else {
          <div class="flex items-center gap-3">
            @if (step() > 1) {
              <pera-button variant="tertiary" [disabled]="runner.running()" (click)="back()">{{
                catalog.t('convert.back')
              }}</pera-button>
            }
            <span class="flex-1"></span>
            @if (step() < 5) {
              <pera-button variant="primary" (click)="next()">{{
                catalog.t('convert.next')
              }}</pera-button>
            } @else {
              <pera-button
                variant="primary"
                data-testid="convert-create"
                [loading]="runner.running()"
                [disabled]="missingPermissions().length > 0"
                (click)="create()"
                >{{
                  catalog.t(runner.failedStep() ? 'convert.retry' : 'convert.create')
                }}</pera-button
              >
            }
          </div>
        }
      }
    </div>
  `,
})
export class LeadConvertPageComponent {
  /** LC-2: set once the conversion finished and a new client login waits to be shown. */
  readonly doneProjectId = signal<string | null>(null);
  private readonly fb = inject(FormBuilder);
  private readonly leads = inject(CrmLeadService);
  private readonly stageTemplates = inject(StageTemplatesService);
  private readonly permissions = inject(PermissionsService);
  private readonly toast = inject(ToastService);
  private readonly router = inject(Router);
  protected readonly catalog = inject(CatalogService);
  protected readonly runner = inject(LeadConvertRunner);

  readonly leadId = input.required<string>();

  protected readonly converted = LeadStatus.Converted;
  readonly lead = signal<CrmLead | null>(null);
  readonly step = signal<WizardStep>(1);
  protected readonly resuming = signal(false);

  // --- client
  readonly clientModeControl = new FormControl<'new' | 'existing'>('new', { nonNullable: true });
  readonly clientMode = signal<'new' | 'existing'>('new');
  readonly existingClientId = new FormControl<string | null>(null);
  protected readonly existingTouched = signal(false);
  readonly clientOptions = signal<SelectOption[]>([]);
  readonly clientForm = this.fb.nonNullable.group({
    firstName: ['', [Validators.required, PeraValidators.trimmedLength(1, 80)]],
    lastName: ['', [Validators.required, PeraValidators.trimmedLength(1, 80)]],
    email: ['', [Validators.required, PeraValidators.email]],
    phone: ['', [Validators.required, PeraValidators.phone]],
    address: ['', [Validators.required, PeraValidators.trimmedLength(5, 300)]],
    notes: ['', [Validators.maxLength(500)]],
  });

  // --- project
  readonly projectForm = this.fb.nonNullable.group({
    code: ['', [Validators.required, PeraValidators.trimmedLength(2, 32)]],
    name: ['', [Validators.required, PeraValidators.trimmedLength(2, 200)]],
    address: ['', [Validators.required, PeraValidators.trimmedLength(5, 300)]],
    estimatedStartDate: ['', [PeraValidators.isoDate]],
    description: ['', [Validators.maxLength(1000)]],
  });

  // --- scope of work
  readonly templates = signal<SowTemplateOption[]>([]);
  readonly selectedTemplateId = signal<string | null>(null);
  readonly templateStages = signal<TemplateStage[]>([]);
  readonly templatesLoading = signal(false);
  readonly scopeItems = signal<ConvertScopeItem[]>([]);
  readonly scopeHeader = signal<UpdateScopeOfWorkHeaderRequest>(EMPTY_HEADER);
  protected readonly scopeTried = signal(false);
  readonly scope = computed(() => draftScope(this.scopeHeader(), this.scopeItems()));
  protected readonly pickedStageIds = computed(() => this.scopeItems().map((i) => i.sourceStageId));
  protected readonly scopeProblems = computed(() =>
    scopeBlockers(this.scopeHeader(), this.scopeItems()).map((code) =>
      friendlyMessage(code, this.catalog.t('sow.confirmBlocked'), this.catalog.locale()),
    ),
  );

  // --- site
  readonly siteForm = this.fb.nonNullable.group({
    address: ['', [Validators.maxLength(300)]],
    unitType: [''],
    unitCondition: [''],
    areaSqm: ['', [Validators.min(0.01), Validators.max(999999)]],
    isLicensed: [null as boolean | null],
    isRented: [null as boolean | null],
    notes: ['', [Validators.maxLength(2000)]],
  });

  protected readonly clientModeOptions = computed<SegmentedOption[]>(() => [
    { value: 'new', label: this.catalog.t('convert.newClient') },
    { value: 'existing', label: this.catalog.t('convert.existingClient') },
  ]);
  protected readonly yesNoOptions = computed<SegmentedOption[]>(() => [
    { value: true, label: this.catalog.t('common.yes') },
    { value: false, label: this.catalog.t('common.no') },
  ]);
  protected readonly unitTypeOptions = computed(() => this.options(UNIT_TYPE_KEYS));
  protected readonly unitConditionOptions = computed(() => this.options(UNIT_CONDITION_KEYS));

  protected readonly stepIndex = computed(() =>
    ([1, 2, 3, 4, 5] as WizardStep[]).map((n) => ({
      n,
      name: this.catalog.t(STEP_KEYS[n]),
      active: n === this.step(),
    })),
  );

  /** Every claim a step's route checks, so a user who lacks one finds out before anything is created. */
  protected readonly missingPermissions = computed(() => {
    const needed = [
      ...(this.clientMode() === 'new' ? [PERM.clients.create] : []),
      PERM.projects.create,
      PERM.stages.read,
      PERM.scope.manage,
      PERM.scope.confirm,
      SITES_CREATE_PERMISSION,
    ];
    return needed.filter((p) => !this.permissions.can(p));
  });

  protected readonly progressRows = computed(() => {
    const states = this.runner.steps();
    return (Object.keys(PROGRESS_KEYS) as ConvertStep[]).map((step) => ({
      step,
      state: states[step],
      label: this.catalog.t(PROGRESS_KEYS[step]),
    }));
  });

  protected readonly totalText = computed(() =>
    this.scope().total.toLocaleString(this.catalog.locale() === 'ar' ? 'ar-EG' : 'en-US'),
  );

  /** Step 3's host for the lazily loaded scope editor; recreated each time the step is shown. */
  private readonly sowHost = viewChild('sowHost', { read: ViewContainerRef });
  private sowEditor: ComponentRef<SowDraftEditorComponent> | null = null;

  constructor() {
    // The scope editor: created when step 3's host appears, fed from the wizard's signals.
    effect(() => {
      const host = this.sowHost();
      if (!host) {
        this.sowEditor = null;
        return;
      }
      void loadSowDraftEditor().then((editor) => {
        if (this.sowHost() !== host || this.sowEditor) return;
        const ref = host.createComponent(editor);
        const e = ref.instance;
        e.selectTemplate.subscribe((id) => this.selectTemplate(id));
        e.addStage.subscribe((id) => this.addStage(id));
        e.removeStage.subscribe((id) => this.removeItem(id));
        e.addTemplate.subscribe((id) => this.addTemplate(id));
        e.updateItem.subscribe((u) => this.onItemUpdate(u));
        e.reorder.subscribe((ids) => this.onReorder(ids));
        e.headerChange.subscribe((h) => this.onHeader(h));
        this.sowEditor = ref;
        this.feedEditor();
      });
    });
    effect(() => this.feedEditor());

    this.clientModeControl.valueChanges.subscribe((mode) => this.clientMode.set(mode));

    effect(() => {
      const id = this.leadId();
      forkJoin([this.leads.getById(id), this.leads.getIntake(id).pipe(catchError(() => of({})))])
        .pipe(catchError(() => of(null)))
        .subscribe((result) => {
          if (!result) return;
          const [lead, intake] = result;
          this.prefill(lead, intake as LeadIntakeResponse);
          this.resuming.set(Object.keys(this.runner.progressOf(id)).length > 0);
        });
    });

    this.leads
      .searchClients({ pageSize: 200 })
      .pipe(catchError(() => of(emptyPage<CrmClientOption>())))
      .subscribe((page) =>
        this.clientOptions.set(
          page.items.map((c) => ({ value: c.id, label: c.displayName ?? c.email ?? c.id })),
        ),
      );

    this.templatesLoading.set(true);
    this.stageTemplates
      .list()
      .pipe(catchError(() => of([])))
      .subscribe((list) => {
        this.templates.set(list.map((t) => ({ id: t.id, name: t.name })));
        this.templatesLoading.set(false);
        if (list[0]) this.selectTemplate(list[0].id);
      });
  }

  /** Pushes the wizard's scope state into the editor (reads every signal, so the effect tracks them). */
  private feedEditor(): void {
    const inputs = {
      scope: this.scope(),
      templates: this.templates(),
      selectedTemplateId: this.selectedTemplateId(),
      templateStages: this.templateStages(),
      pickedStageIds: this.pickedStageIds(),
      loading: this.templatesLoading(),
    };
    const ref = this.sowEditor;
    if (!ref) return;
    for (const [name, value] of Object.entries(inputs)) ref.setInput(name, value);
  }

  // --- navigation

  next(): void {
    const s = this.step();
    if (!this.stepValid(s)) return;
    const nextStep = (s + 1) as WizardStep;
    if (nextStep === 3 && !this.scopeHeader().plannedStartDate) {
      const start = this.projectForm.controls.estimatedStartDate.value || null;
      if (start) this.scopeHeader.update((h) => ({ ...h, plannedStartDate: start }));
    }
    this.step.set(nextStep);
  }

  back(): void {
    if (this.step() > 1) this.step.set((this.step() - 1) as WizardStep);
  }

  // --- scope events

  selectTemplate(templateId: string): void {
    this.selectedTemplateId.set(templateId);
    this.templateStages.set([]);
    this.templatesLoading.set(true);
    this.stageTemplates
      .stages(templateId)
      .pipe(catchError(() => of([] as TemplateStage[])))
      .subscribe((stages) => {
        if (this.selectedTemplateId() !== templateId) return;
        this.templateStages.set(stages);
        this.templatesLoading.set(false);
      });
  }

  addStage(stageId: string): void {
    const stage = this.templateStages().find((s) => s.id === stageId);
    if (!stage || this.scopeItems().some((i) => i.sourceStageId === stageId)) return;
    this.scopeItems.update((items) => [...items, this.itemFrom(stage)]);
  }

  addTemplate(templateId: string): void {
    if (templateId !== this.selectedTemplateId()) return;
    const picked = new Set(this.pickedStageIds());
    const added = [...this.templateStages()]
      .sort((a, b) => a.order - b.order)
      .filter((s) => !picked.has(s.id))
      .map((s) => this.itemFrom(s));
    this.scopeItems.update((items) => [...items, ...added]);
  }

  removeItem(stageId: string): void {
    this.scopeItems.update((items) => items.filter((i) => i.sourceStageId !== stageId));
  }

  onItemUpdate(update: SowItemUpdate): void {
    this.scopeItems.update((items) =>
      items.map((i) =>
        i.sourceStageId === update.itemId
          ? {
              ...i,
              name: update.request.name,
              description: update.request.description,
              fee: update.request.fee,
            }
          : i,
      ),
    );
  }

  onReorder(ids: string[]): void {
    const byId = new Map(this.scopeItems().map((i) => [i.sourceStageId, i]));
    this.scopeItems.set(ids.map((id) => byId.get(id)).filter((i): i is ConvertScopeItem => !!i));
  }

  onHeader(header: UpdateScopeOfWorkHeaderRequest): void {
    this.scopeHeader.set(header);
  }

  // --- create

  /** The runner's input, from every step. */
  plan(): ConvertPlan {
    const c = this.clientForm.getRawValue();
    const p = this.projectForm.getRawValue();
    const s = this.siteForm.getRawValue();
    const site: ConvertSiteData = {
      ...EMPTY_SITE_DATA,
      address: s.address.trim() || null,
      unitType: s.unitType ? Number(s.unitType) : null,
      unitCondition: s.unitCondition ? Number(s.unitCondition) : null,
      areaSqm: String(s.areaSqm).trim() ? Number(s.areaSqm) : null,
      isLicensed: s.isLicensed,
      isRented: s.isRented,
      notes: s.notes.trim() || null,
    };
    return {
      leadId: this.leadId(),
      client:
        this.clientMode() === 'existing'
          ? { mode: 'existing', clientId: this.existingClientId.value ?? '' }
          : {
              mode: 'new',
              request: {
                firstName: c.firstName.trim(),
                lastName: c.lastName.trim(),
                email: c.email.trim(),
                phone: c.phone.trim(),
                address: c.address.trim(),
                notes: c.notes.trim() || undefined,
                // The portal login's first password, until the invitation flow exists (gap-03).
                // LC-2: fresh on every Create/Retry, so a refused password is never sent twice.
                // Once the client exists the runner skips this step, so a new one costs nothing.
                password: cryptoRandomPassword(16),
              },
            },
      project: {
        code: p.code.trim(),
        name: p.name.trim(),
        address: p.address.trim(),
        description: p.description.trim() || null,
        estimatedStartDate: p.estimatedStartDate || null,
      },
      scope: { header: this.scopeHeader(), items: this.scopeItems() },
      site,
    };
  }

  async create(): Promise<void> {
    for (const s of [1, 2, 3, 4] as WizardStep[]) {
      if (!this.stepValid(s)) {
        this.step.set(s);
        return;
      }
    }
    const projectId = await this.runner.run(this.plan());
    if (!projectId) return;
    this.toast.show({ tone: 'success', message: this.catalog.t('convert.done') });
    // LC-2: a new client got a portal login — show its details once before leaving the page.
    if (this.runner.issuedLogin()) {
      this.doneProjectId.set(projectId);
      return;
    }
    void this.router.navigate(['/projects', projectId]);
  }

  openProject(projectId: string): void {
    void this.router.navigate(['/projects', projectId]);
  }

  // --- helpers

  protected errorOf(
    form: {
      get(name: string): { touched: boolean; errors: Record<string, unknown> | null } | null;
    },
    name: string,
  ): string {
    const control = form.get(name);
    return control && control.touched && control.errors ? firstErrorMessage(control.errors) : '';
  }

  protected existingClientError(): string {
    return this.existingTouched() && !this.existingClientId.value
      ? this.catalog.t('convert.selectClientRequired')
      : '';
  }

  protected reviewClient(): string {
    if (this.clientMode() === 'existing') {
      const id = this.existingClientId.value;
      return this.clientOptions().find((o) => o.value === id)?.label ?? '—';
    }
    const c = this.clientForm.getRawValue();
    return `${c.firstName} ${c.lastName} · ${c.email}`;
  }

  private stepValid(step: WizardStep): boolean {
    switch (step) {
      case 1:
        if (this.clientMode() === 'existing') {
          this.existingTouched.set(true);
          return !!this.existingClientId.value;
        }
        this.clientForm.markAllAsTouched();
        return this.clientForm.valid;
      case 2:
        this.projectForm.markAllAsTouched();
        return this.projectForm.valid;
      case 3:
        this.scopeTried.set(true);
        return scopeBlockers(this.scopeHeader(), this.scopeItems()).length === 0;
      case 4:
        this.siteForm.markAllAsTouched();
        return this.siteForm.valid;
      default:
        return true;
    }
  }

  private prefill(lead: CrmLead, intake: LeadIntakeResponse): void {
    this.lead.set(lead);
    const client = clientDraftFromLead(lead, intake);
    this.clientForm.patchValue({ ...client, notes: client.notes ?? '' });
    const sector =
      intake.sector != null ? this.catalog.t(SECTOR_KEYS[intake.sector as ProjectSector]) : null;
    const project = projectDraftFromLead(lead, intake, sector);
    this.projectForm.patchValue({
      code: project.code,
      name: project.name,
      address: project.address,
      description: project.description ?? '',
      estimatedStartDate: project.estimatedStartDate ?? '',
    });
    const site = siteDataFromIntake(intake);
    this.siteForm.patchValue({
      address: site.address ?? '',
      unitType: site.unitType != null ? String(site.unitType) : '',
      unitCondition: site.unitCondition != null ? String(site.unitCondition) : '',
      areaSqm: site.areaSqm != null ? String(site.areaSqm) : '',
      isLicensed: site.isLicensed,
      isRented: site.isRented,
    });
  }

  private itemFrom(stage: TemplateStage): ConvertScopeItem {
    const template =
      this.templates().find((t) => t.id === stage.stageTemplateId) ??
      this.templates().find((t) => t.id === this.selectedTemplateId());
    return {
      sourceStageId: stage.id,
      sourceTemplateName: template?.name ?? null,
      name: stage.name,
      description: stage.description,
      fee: stage.defaultFee ?? 0,
    };
  }

  private options(keys: Record<number, CatalogKey>): SelectOption[] {
    return Object.keys(keys)
      .map(Number)
      .map((v) => ({ value: String(v), label: this.catalog.t(keys[v]) }));
  }
}
