import {
  ChangeDetectionStrategy,
  Component,
  OnInit,
  computed,
  inject,
  input,
  signal,
} from '@angular/core';
import {
  ConfirmService,
  PeraAlertComponent,
  PeraEmptyComponent,
  PeraIconComponent,
  PeraPageHeaderComponent,
  PeraStatusBadgeComponent,
} from '@ds';
import { friendlyMessage } from '@platform/errors/error-catalog';
import { CatalogService, STAGE_COUNT } from '@platform/i18n/catalog.service';
import { formatCairoDate, intlLocale } from '@platform/i18n/intl-locale';
import { PERM, PermissionsService } from '@platform/permissions';
import { ScopeOfWorkStore } from '../../stores/scope-of-work.store';
import { SowItemsTableComponent, SowItemUpdate } from './sow-items-table.component';
import { SowSummaryComponent } from './sow-summary.component';
import { SowTemplatePickerComponent } from './sow-template-picker.component';

/**
 * FINDING-7-5: `pera-button` (secondary, md) classes on a native button, so `aria-expanded`
 * sits on the element that takes focus (a host attribute never reaches pera-button's inner one).
 */
const TOGGLE_BUTTON =
  'inline-flex items-center justify-center gap-2 h-8 px-3 text-sm font-medium whitespace-nowrap ' +
  'select-none transition-colors cursor-pointer outline-none focus-visible:outline-2 ' +
  'focus-visible:outline-accent focus-visible:outline-offset-2 bg-surface text-text-primary ' +
  'border border-border hover:bg-surface-muted hover:border-border-strong';

/**
 * The project's scope of work (نطاق العمل) — NEW-FEATURE-1, specs/sow-scope-of-work.md.
 * Routed at `projects/:id/scope-of-work` behind `scope.read` (§3). `id` is the route param,
 * bound by `withComponentInputBinding()` (a param, so INHERITED-TRAP-1 does not bite).
 */
@Component({
  selector: 'app-scope-of-work-page',
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [
    PeraAlertComponent,
    PeraEmptyComponent,
    PeraIconComponent,
    PeraPageHeaderComponent,
    PeraStatusBadgeComponent,
    SowItemsTableComponent,
    SowSummaryComponent,
    SowTemplatePickerComponent,
  ],
  providers: [ScopeOfWorkStore],
  host: { class: 'block' },
  template: `
    <pera-page-header [title]="catalog.t('sow.title')" />
    <div class="px-8 py-6 flex flex-col gap-5">
      @if (store.error(); as error) {
        <pera-alert tone="danger">{{ error }}</pera-alert>
      }
      @if (store.notFound()) {
        <pera-empty
          data-not-found
          iconName="search"
          [title]="catalog.t('sow.notFound')"
          [description]="catalog.t('sow.notFoundHint')"
        />
      }
      @if (isFreeStyle()) {
        <pera-alert tone="warning" data-free-style>{{ freeStyleMessage() }}</pera-alert>
      }
      @if (store.scope(); as scope) {
        <div class="flex items-center gap-3 flex-wrap">
          <pera-status-badge
            data-status
            [tone]="store.isConfirmed() ? 'success' : 'neutral'"
            [label]="catalog.t(store.isConfirmed() ? 'sow.statusConfirmed' : 'sow.statusDraft')"
          />
        </div>
        @if (store.isConfirmed()) {
          <pera-alert tone="success" data-confirmed-banner>
            <strong>{{ confirmedOn() }}</strong>
            {{ confirmedSummary() }}
          </pera-alert>
        }
        <div class="grid gap-5 items-start lg:grid-cols-3">
          <section
            class="bg-surface border border-border p-5 flex flex-col gap-4 min-w-0 lg:col-span-2"
            aria-labelledby="sow-items-heading"
          >
            <div class="flex items-center justify-between gap-3 flex-wrap">
              <h2 id="sow-items-heading" class="m-0 fs-h3 font-semibold text-text-primary">
                {{ catalog.t('sow.items') }}
                <span class="text-text-muted font-medium">· {{ store.items().length }}</span>
              </h2>
              @if (editable() && canPickTemplates()) {
                <button
                  type="button"
                  data-picker-toggle
                  class="${TOGGLE_BUTTON}"
                  [attr.aria-expanded]="pickerOpen()"
                  (click)="togglePicker()"
                >
                  <pera-icon name="plus" [size]="16" aria-hidden="true" />
                  {{ catalog.t(pickerOpen() ? 'sow.closeTemplates' : 'sow.addFromTemplates') }}
                </button>
              }
            </div>
            @if (editable() && !canPickTemplates()) {
              <p class="m-0 fs-body-sm text-text-muted" data-picker-no-permission>
                {{ catalog.t('sow.pickerNoPermission') }}
              </p>
            }
            @if (editable() && canPickTemplates() && pickerOpen()) {
              <app-sow-template-picker
                [templates]="store.templates()"
                [selectedTemplateId]="store.selectedTemplateId()"
                [stages]="store.templateStages()"
                [pickedStageIds]="store.pickedStageIds()"
                [loading]="store.templatesLoading()"
                [busy]="store.saving()"
                [pending]="store.saving() || store.reloading()"
                (selectTemplate)="store.selectTemplate($event)"
                (addStage)="store.addStage($event)"
                (removeStage)="store.removeStage($event)"
                (addTemplate)="store.addTemplate($event)"
              />
            }
            <app-sow-items-table
              [items]="store.items()"
              [editable]="editable()"
              [confirmed]="store.isConfirmed()"
              [projectId]="id()"
              [drafts]="store.itemDrafts()"
              [pending]="store.saving() || store.reloading()"
              (updateItem)="onUpdateItem($event)"
              (reorder)="store.reorder($event)"
              (remove)="store.removeItem($event)"
            />
          </section>
          <app-sow-summary
            [scope]="scope"
            [editable]="editable()"
            [saveStatus]="store.headerStatus()"
            [confirmPermitted]="canConfirm()"
            [busy]="store.saving()"
            [confirmError]="store.confirmError()"
            [draft]="store.headerDraft()"
            (headerChange)="store.updateHeader($event)"
            (confirm)="onConfirm()"
          />
        </div>
      }
    </div>
  `,
})
export class ScopeOfWorkPageComponent implements OnInit {
  protected readonly catalog = inject(CatalogService);
  protected readonly store = inject(ScopeOfWorkStore);
  private readonly permissions = inject(PermissionsService);
  private readonly confirmDialog = inject(ConfirmService);

  /** The project id (`:id`). */
  readonly id = input('');

  /** B15 `scope.manage`. */
  protected readonly canManage = computed(() => this.permissions.can(PERM.scope.manage));

  /**
   * crm-prod L-fe-5: the template picker reads `GET /api/stage-templates` and its stages, both
   * `stages.read` (TemplateEndpoints.cs:22-27, 59-64). Without it the picker is hidden and the
   * page says why, instead of offering a list that answers 403.
   */
  protected readonly canPickTemplates = computed(() => this.permissions.can(PERM.stages.read));

  /** B10/B15 `scope.confirm`. */
  protected readonly canConfirm = computed(() => this.permissions.can(PERM.scope.confirm));

  /** B11: "Confirmed on {date, Africa/Cairo} by {employee name}." */
  protected readonly confirmedOn = computed(() => {
    const at = this.store.scope()?.confirmedAtUtc;
    return this.catalog.t('sow.confirmedOn', {
      date: at ? formatCairoDate(at, this.catalog.locale()) : '—',
      name: this.store.confirmedByName() ?? '—',
    });
  });

  /** B11: "{n} stages created · total {total} EGP · ends {end}." */
  protected readonly confirmedSummary = computed(() => {
    const scope = this.store.scope();
    if (!scope) return '';
    const locale = this.catalog.locale();
    const total = new Intl.NumberFormat(intlLocale(locale), {
      minimumFractionDigits: 2,
      maximumFractionDigits: 4,
    }).format(scope.total);
    const end = scope.estimatedEndDate
      ? formatCairoDate(`${scope.estimatedEndDate}T00:00:00Z`, locale)
      : '—';
    const stages = this.catalog.plural(STAGE_COUNT, scope.items.length);
    return this.catalog.t('sow.confirmedSummary', { stages, total, end });
  });

  /**
   * B12: a FreeStyle project has no scope of work to edit or confirm. FINDING-7-7: read from
   * the scope's `blockingReason`, which checks the workflow first (no `project.read` needed).
   */
  protected readonly isFreeStyle = computed(
    () => this.store.scope()?.blockingReason === 'projects.scope.WorkflowNotSupported',
  );

  /** B12: the `projects.scope.WorkflowNotSupported` catalog message (EN/AR). */
  protected readonly freeStyleMessage = computed(() =>
    friendlyMessage(
      'projects.scope.WorkflowNotSupported',
      this.catalog.t('sow.loadFailed'),
      this.catalog.locale(),
    ),
  );

  /** Edit controls render only with `scope.manage`, on a Draft of a Stage-workflow project. */
  protected readonly editable = computed(
    () => this.canManage() && !this.store.isConfirmed() && !this.isFreeStyle(),
  );

  /** B6: the template picker is open; templates are read on first open. */
  protected readonly pickerOpen = signal(false);

  ngOnInit(): void {
    this.store.load(this.id());
  }

  protected togglePicker(): void {
    const open = !this.pickerOpen();
    this.pickerOpen.set(open);
    if (open && this.store.templates().length === 0) this.store.loadTemplates();
  }

  /** B10: asks through the design system's dialog, then `POST …/confirm` → reload. */
  protected async onConfirm(): Promise<void> {
    const n = this.store.items().length;
    const ok = await this.confirmDialog.open({
      title: this.catalog.t('sow.confirmTitle'),
      body: this.catalog.t('sow.confirmCopy', { stages: this.catalog.plural(STAGE_COUNT, n) }),
      confirmLabel: this.catalog.t('sow.confirmScope'),
      cancelLabel: this.catalog.t('common.cancel'),
    });
    if (ok) this.store.confirm();
  }

  protected onUpdateItem(update: SowItemUpdate): void {
    this.store.updateItem(update.itemId, update.request);
  }
}
