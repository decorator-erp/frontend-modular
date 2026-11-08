import { HttpErrorResponse } from '@angular/common/http';
import {
  ChangeDetectionStrategy,
  Component,
  computed,
  effect,
  inject,
  input,
  output,
  signal,
  untracked,
} from '@angular/core';
import { takeUntilDestroyed, toSignal } from '@angular/core/rxjs-interop';
import { FormBuilder, ReactiveFormsModule } from '@angular/forms';
import { injectReloadOnConflict } from '@platform/http/concurrency';
import { ErrorHandlerService, friendly } from '@platform/http/error-handler.service';
import { CatalogService } from '@platform/i18n/catalog.service';
import {
  PeraAlertComponent,
  PeraButtonComponent,
  PeraSkeletonComponent,
  PeraSwitchComponent,
} from '@ds';
import { CrmPortalVisibilityService } from '../../data/crm-portal-visibility.service';
import {
  PORTAL_SECTION_KEYS,
  type PortalSectionKey,
  type PortalSections,
} from '../../model/portal.model';
import { SECTION_HINT_KEYS, SECTION_LABEL_KEYS } from './portal-labels';

type LoadState = 'loading' | 'ready' | 'error' | 'notFound';

/**
 * crmp P2-B: the six portal section switches (`GET`/`PUT …/portal/settings`). Read with
 * `crm.portal.manage` or `clients.read`; the switches are disabled without `manage`. Save sends all
 * six; a concurrent change (409 `crm.portal.SettingsChanged`) reloads and toasts, any other error
 * shows inline. Emits `notFound` on a 404 so the page can show its 404 state.
 */
@Component({
  selector: 'app-crm-portal-settings-panel',
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [
    ReactiveFormsModule,
    PeraAlertComponent,
    PeraButtonComponent,
    PeraSkeletonComponent,
    PeraSwitchComponent,
  ],
  host: { class: 'flex flex-col gap-4' },
  template: `
    @switch (state()) {
      @case ('loading') {
        <div class="flex flex-col gap-3" data-testid="settings-loading">
          @for (k of keys; track k) {
            <pera-skeleton [height]="24" />
          }
        </div>
      }
      @case ('error') {
        <pera-alert tone="danger">
          <div class="flex items-center gap-3">
            <span class="flex-1">{{ catalog.t('pportal.loadFailed') }}</span>
            <pera-button variant="secondary" size="xs" (click)="load()">{{
              catalog.t('common.retry')
            }}</pera-button>
          </div>
        </pera-alert>
      }
      @case ('ready') {
        <ul [formGroup]="form" class="flex flex-col gap-3 m-0 p-0 list-none">
          @for (k of keys; track k) {
            <li class="flex flex-col gap-0.5" [attr.data-section]="k">
              <pera-switch [formControlName]="k">{{ catalog.t(LABELS[k]) }}</pera-switch>
              <span class="fs-caption text-text-muted ps-11">{{ catalog.t(HINTS[k]) }}</span>
            </li>
          }
        </ul>
        @if (error(); as message) {
          <pera-alert tone="danger" data-testid="settings-error">{{ message }}</pera-alert>
        }
        @if (canManage()) {
          <div class="flex items-center gap-3">
            <pera-button
              variant="primary"
              [loading]="saving()"
              [disabled]="saving() || !dirty()"
              data-testid="settings-save"
              (click)="save()"
              >{{ catalog.t('pportal.saveSections') }}</pera-button
            >
            @if (dirty()) {
              <span class="fs-caption text-text-muted">{{ catalog.t('pportal.unsaved') }}</span>
            } @else if (justSaved()) {
              <span class="fs-caption text-success" role="status" data-testid="settings-saved">{{
                catalog.t('pportal.sectionsSaved')
              }}</span>
            }
          </div>
        }
      }
    }
  `,
})
export class CrmPortalSettingsPanelComponent {
  private readonly api = inject(CrmPortalVisibilityService);
  private readonly errors = inject(ErrorHandlerService);
  private readonly reloadOnConflict = injectReloadOnConflict();
  protected readonly catalog = inject(CatalogService);
  protected readonly keys = PORTAL_SECTION_KEYS;
  protected readonly LABELS = SECTION_LABEL_KEYS;
  protected readonly HINTS = SECTION_HINT_KEYS;

  readonly projectId = input.required<string>();
  readonly canManage = input(false);
  readonly notFound = output<void>();
  /** The saved switches changed (the preview re-reads). */
  readonly saved = output<void>();

  readonly form = inject(FormBuilder).nonNullable.group({
    progress: [false],
    tasks: [false],
    documents: [false],
    gallery: [false],
    siteSurveys: [false],
    updates: [false],
  });

  readonly state = signal<LoadState>('loading');
  readonly saving = signal(false);
  readonly justSaved = signal(false);
  readonly error = signal<string | null>(null);
  private readonly savedValue = signal<PortalSections | null>(null);
  private readonly value = toSignal(this.form.valueChanges, { initialValue: this.form.value });

  readonly dirty = computed(() => {
    const saved = this.savedValue();
    const current = this.value();
    return !!saved && this.keys.some((k: PortalSectionKey) => saved[k] !== current[k]);
  });

  constructor() {
    effect(() => {
      this.projectId();
      untracked(() => this.load());
    });
    effect(() => {
      if (this.canManage()) this.form.enable({ emitEvent: false });
      else this.form.disable({ emitEvent: false });
    });
    this.form.valueChanges.pipe(takeUntilDestroyed()).subscribe(() => this.justSaved.set(false));
  }

  load(): void {
    this.state.set('loading');
    this.error.set(null);
    this.api.getSettings(this.projectId()).subscribe({
      next: (s) => {
        const sections: PortalSections = {
          progress: s.progress,
          tasks: s.tasks,
          documents: s.documents,
          gallery: s.gallery,
          siteSurveys: s.siteSurveys,
          updates: s.updates,
        };
        this.savedValue.set(sections);
        this.form.setValue(sections);
        this.state.set('ready');
      },
      error: (err: unknown) => {
        if (err instanceof HttpErrorResponse && err.status === 404) {
          this.state.set('notFound');
          this.notFound.emit();
          return;
        }
        this.state.set('error');
      },
    });
  }

  save(): void {
    if (this.saving() || !this.canManage()) return;
    const sections = this.form.getRawValue();
    this.saving.set(true);
    this.error.set(null);
    this.api.saveSettings(this.projectId(), sections).subscribe({
      next: () => {
        this.saving.set(false);
        this.savedValue.set(sections);
        this.justSaved.set(true);
        this.saved.emit();
      },
      error: (err: HttpErrorResponse) => {
        this.saving.set(false);
        if (this.reloadOnConflict(err, () => this.load())) return;
        this.error.set(friendly(this.errors.parse(err)));
      },
    });
  }
}
