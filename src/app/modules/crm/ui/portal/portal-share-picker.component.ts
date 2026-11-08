import { HttpErrorResponse } from '@angular/common/http';
import { ChangeDetectionStrategy, Component, computed, inject, signal } from '@angular/core';
import { FormBuilder, ReactiveFormsModule, Validators } from '@angular/forms';
import { Observable, forkJoin, of } from 'rxjs';
import { catchError, map } from 'rxjs/operators';
import { takeUntilDestroyed } from '@angular/core/rxjs-interop';
import {
  ProjectDocumentsService,
  ProjectStageService,
  ProjectTaskService,
} from '@modules/projects';
import { SiteDocumentKind, SiteService } from '@modules/sites';
import { ToastService } from '@platform/feedback/toast.service';
import { ErrorHandlerService, friendly } from '@platform/http/error-handler.service';
import { CatalogService } from '@platform/i18n/catalog.service';
import { PERM, PermissionsService } from '@platform/permissions';
import {
  PERA_MODAL_DATA,
  PeraAlertComponent,
  PeraFormFieldComponent,
  PeraFormModalComponent,
  PeraInputComponent,
  PeraModalRef,
  PeraSelectComponent,
  PeraSkeletonComponent,
  PeraSwitchComponent,
  PeraTextareaComponent,
  type SelectOption,
} from '@ds';
import { CrmPortalVisibilityService } from '../../data/crm-portal-visibility.service';
import { PORTAL_SHARE_KINDS, PortalShareKind, followsLatest } from '../../model/portal.model';
import { PortalSharesStore } from '../../stores/portal-shares.store';
import { PORTAL_NOTE_MAX, PORTAL_TITLE_MAX } from './portal-share-dialog.component';
import { portalKindKey } from './portal-labels';

export interface PortalSharePickerData {
  projectId: string;
}

/** One pickable item: its id for `POST …/shares` and its label. */
export interface PickItem {
  id: string;
  label: string;
}

type ItemsState = 'idle' | 'loading' | 'ready' | 'error' | 'noAccess';

/** `sites.read` (sites `SITE_PERMS.read`): the survey list and its document links. */
const SITES_READ = 'sites.read';

/**
 * crmp P2-B: "Add to client portal". Choose a kind, then an item of the project:
 * - Document / Image: the project's documents (Image: `image/*` only) through `ProjectDocumentsService`;
 * - Stage / Task: `ProjectStageService` / `ProjectTaskService`;
 * - Site photo: a survey (`SiteService.list`), then its Photo links (`SiteService.documents`), named by
 *   the project document each link points at.
 * All through the module barrels. Items already shared are listed but disabled. Optional client title,
 * note and "Notify the client"; documents and images also "Follow the latest version".
 */
@Component({
  selector: 'app-crm-portal-share-picker',
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [
    ReactiveFormsModule,
    PeraAlertComponent,
    PeraFormModalComponent,
    PeraFormFieldComponent,
    PeraInputComponent,
    PeraSelectComponent,
    PeraSkeletonComponent,
    PeraSwitchComponent,
    PeraTextareaComponent,
  ],
  template: `
    <pera-form-modal
      [title]="catalog.t('pportal.addShare')"
      size="md"
      [submitLabel]="catalog.t('pportal.share')"
      [cancelLabel]="catalog.t('common.cancel')"
      [submittingLabel]="catalog.t('common.saving')"
      [submitting]="submitting()"
      [submitDisabled]="!form.controls.itemId.value"
      [errorMessage]="error()"
      (submitted)="submit()"
      (cancelled)="close()"
    >
      <div [formGroup]="form" class="flex flex-col gap-4">
        <pera-form-field [label]="catalog.t('pportal.pickKind')" [required]="true">
          <pera-select
            formControlName="kind"
            [options]="kindOptions"
            [placeholder]="catalog.t('pportal.choose')"
          />
        </pera-form-field>

        @if (kind() === PortalShareKind.SitePhoto) {
          <pera-form-field [label]="catalog.t('pportal.pickSite')" [required]="true">
            <pera-select
              formControlName="siteId"
              [options]="siteOptions()"
              [placeholder]="catalog.t('pportal.choose')"
            />
          </pera-form-field>
        }

        @switch (itemsState()) {
          @case ('loading') {
            <pera-skeleton [height]="36" />
          }
          @case ('noAccess') {
            <pera-alert tone="warning">{{ catalog.t('pportal.pickNoAccess') }}</pera-alert>
          }
          @case ('error') {
            <pera-alert tone="danger">{{ catalog.t('pportal.pickLoadFailed') }}</pera-alert>
          }
          @case ('ready') {
            @if (itemOptions().length) {
              <pera-form-field [label]="catalog.t('pportal.pickItem')" [required]="true">
                <pera-select
                  formControlName="itemId"
                  [options]="itemOptions()"
                  [placeholder]="catalog.t('pportal.choose')"
                />
              </pera-form-field>
            } @else {
              <pera-alert tone="info">{{ catalog.t('pportal.pickNone') }}</pera-alert>
            }
          }
        }

        <pera-form-field
          [label]="catalog.t('pportal.clientTitle')"
          [hint]="catalog.t('pportal.clientTitleHint')"
          [error]="tooLong('clientTitle', TITLE_MAX)"
        >
          <pera-input formControlName="clientTitle" dir="auto" />
        </pera-form-field>
        <pera-form-field
          [label]="catalog.t('pportal.clientNote')"
          [error]="tooLong('clientNote', NOTE_MAX)"
        >
          <pera-textarea formControlName="clientNote" dir="auto" [rows]="3" />
        </pera-form-field>
        @if (kind() !== null && showFollowLatest()) {
          <pera-switch formControlName="followLatest">{{
            catalog.t('pportal.followLatest')
          }}</pera-switch>
        }
        <pera-switch formControlName="notifyClient">{{
          catalog.t('pportal.notifyClient')
        }}</pera-switch>
      </div>
    </pera-form-modal>
  `,
})
export class CrmPortalSharePickerComponent {
  private readonly fb = inject(FormBuilder);
  private readonly api = inject(CrmPortalVisibilityService);
  private readonly documents = inject(ProjectDocumentsService);
  private readonly stages = inject(ProjectStageService);
  private readonly tasks = inject(ProjectTaskService);
  private readonly sites = inject(SiteService);
  private readonly shares = inject(PortalSharesStore);
  private readonly permissions = inject(PermissionsService);
  private readonly errors = inject(ErrorHandlerService);
  private readonly toast = inject(ToastService);
  private readonly modalRef = inject(PeraModalRef) as PeraModalRef<boolean>;
  protected readonly catalog = inject(CatalogService);
  readonly data = inject(PERA_MODAL_DATA) as PortalSharePickerData;
  protected readonly PortalShareKind = PortalShareKind;
  protected readonly TITLE_MAX = PORTAL_TITLE_MAX;
  protected readonly NOTE_MAX = PORTAL_NOTE_MAX;

  protected readonly kindOptions: SelectOption[] = PORTAL_SHARE_KINDS.map((k) => ({
    value: k,
    label: this.catalog.t(portalKindKey(k)),
  }));

  readonly form = this.fb.nonNullable.group({
    kind: this.fb.control<PortalShareKind | null>(null),
    siteId: [''],
    itemId: ['', [Validators.required]],
    clientTitle: ['', [Validators.maxLength(PORTAL_TITLE_MAX)]],
    clientNote: ['', [Validators.maxLength(PORTAL_NOTE_MAX)]],
    followLatest: [true],
    notifyClient: [false],
  });

  readonly kind = signal<PortalShareKind | null>(null);
  readonly itemsState = signal<ItemsState>('idle');
  readonly items = signal<PickItem[]>([]);
  readonly siteOptions = signal<SelectOption[]>([]);
  readonly submitting = signal(false);
  readonly error = signal<string | null>(null);
  private generation = 0;

  protected readonly showFollowLatest = computed(() => {
    const k = this.kind();
    return k !== null && followsLatest(k);
  });

  /** Already-shared items stay visible but cannot be picked twice (409 AlreadyShared). */
  protected readonly itemOptions = computed<SelectOption[]>(() => {
    const kind = this.kind();
    if (kind === null) return [];
    return this.items().map((item) => {
      const shared = !!this.shares.find(this.data.projectId, kind, item.id);
      return {
        value: item.id,
        label: shared ? this.catalog.t('pportal.alreadyShared', { name: item.label }) : item.label,
        disabled: shared,
      };
    });
  });

  constructor() {
    this.shares.ensure(this.data.projectId);
    this.form.controls.kind.valueChanges.pipe(takeUntilDestroyed()).subscribe(() => this.onKind());
    this.form.controls.siteId.valueChanges
      .pipe(takeUntilDestroyed())
      .subscribe(() => this.onSite());
  }

  protected tooLong(name: 'clientTitle' | 'clientNote', max: number): string {
    return this.form.controls[name].errors?.['maxlength']
      ? this.catalog.t('pportal.tooLong', { max })
      : '';
  }

  onKind(): void {
    const kind = this.form.controls.kind.value;
    this.kind.set(kind);
    this.form.patchValue({ itemId: '', siteId: '' }, { emitEvent: false });
    this.items.set([]);
    this.siteOptions.set([]);
    if (kind === null) {
      this.itemsState.set('idle');
      return;
    }
    if (kind === PortalShareKind.SitePhoto) {
      this.loadSites();
      return;
    }
    this.loadItems(this.source(kind));
  }

  onSite(): void {
    const siteId = this.form.controls.siteId.value;
    this.form.patchValue({ itemId: '' }, { emitEvent: false });
    this.items.set([]);
    if (!siteId) {
      this.itemsState.set('idle');
      return;
    }
    if (!this.permissions.can(PERM.documents.read)) {
      // Photo links name only a document id; without documents.read they read "Photo n".
      this.loadItems(this.photos(siteId, of(new Map<string, string>())));
      return;
    }
    const names = this.documents.getByProject(this.data.projectId).pipe(
      map((docs) => new Map(docs.map((d) => [d.id, d.fileName]))),
      catchError(() => of(new Map<string, string>())),
    );
    this.loadItems(this.photos(siteId, names));
  }

  private source(kind: PortalShareKind): Observable<PickItem[]> | null {
    const projectId = this.data.projectId;
    switch (kind) {
      case PortalShareKind.Document:
      case PortalShareKind.Image:
        if (!this.permissions.can(PERM.documents.read)) return null;
        return this.documents
          .getByProject(projectId)
          .pipe(
            map((docs) =>
              docs
                .filter(
                  (d) => kind === PortalShareKind.Document || d.contentType.startsWith('image/'),
                )
                .map((d) => ({ id: d.id, label: d.fileName })),
            ),
          );
      case PortalShareKind.Stage:
        if (!this.permissions.can(PERM.stages.read)) return null;
        return this.stages
          .getByProject(projectId)
          .pipe(map((stages) => stages.map((s) => ({ id: s.id, label: s.name }))));
      case PortalShareKind.Task:
        if (!this.permissions.can(PERM.stageTasks.read)) return null;
        return this.tasks
          .getByProject(projectId)
          .pipe(map((tasks) => tasks.map((t) => ({ id: t.id, label: t.name }))));
      default:
        return null;
    }
  }

  private photos(siteId: string, names: Observable<Map<string, string>>): Observable<PickItem[]> {
    return forkJoin([this.sites.documents(siteId), names]).pipe(
      map(([links, byId]) =>
        links
          .filter((l) => l.kind === SiteDocumentKind.Photo)
          .map((l, i) => ({
            id: l.id,
            label: byId.get(l.documentId) ?? this.catalog.t('pportal.photoN', { n: i + 1 }),
          })),
      ),
    );
  }

  private loadSites(): void {
    if (!this.permissions.can(SITES_READ)) {
      this.itemsState.set('noAccess');
      return;
    }
    const gen = ++this.generation;
    this.itemsState.set('loading');
    this.sites.list({ projectId: this.data.projectId, pageIndex: 1, pageSize: 100 }).subscribe({
      next: (page) => {
        if (gen !== this.generation) return;
        this.siteOptions.set(page.items.map((s) => ({ value: s.id, label: s.code })));
        this.itemsState.set('idle');
      },
      error: (err: unknown) => this.fail(gen, err),
    });
  }

  private loadItems(source: Observable<PickItem[]> | null): void {
    const gen = ++this.generation;
    if (!source) {
      this.itemsState.set('noAccess');
      return;
    }
    this.itemsState.set('loading');
    source.subscribe({
      next: (items) => {
        if (gen !== this.generation) return;
        this.items.set(items);
        this.itemsState.set('ready');
      },
      error: (err: unknown) => this.fail(gen, err),
    });
  }

  private fail(gen: number, err: unknown): void {
    if (gen !== this.generation) return;
    const status = err instanceof HttpErrorResponse ? err.status : 0;
    this.itemsState.set(status === 403 ? 'noAccess' : 'error');
  }

  close(): void {
    this.modalRef.close(false);
  }

  submit(): void {
    const kind = this.kind();
    if (this.submitting() || kind === null) return;
    if (this.form.invalid) {
      this.form.markAllAsTouched();
      return;
    }
    const v = this.form.getRawValue();
    this.submitting.set(true);
    this.error.set(null);
    this.api
      .createShare(this.data.projectId, {
        itemKind: kind,
        itemId: v.itemId,
        clientTitle: v.clientTitle,
        clientNote: v.clientNote,
        followLatest: followsLatest(kind) ? v.followLatest : undefined,
        notifyClient: v.notifyClient,
      })
      .subscribe({
        next: () => {
          this.shares.refresh(this.data.projectId);
          this.toast.show({ tone: 'success', message: this.catalog.t('pportal.sharedToast') });
          this.modalRef.close(true);
        },
        error: (err: HttpErrorResponse) => {
          this.submitting.set(false);
          this.error.set(friendly(this.errors.parse(err)));
        },
      });
  }
}
