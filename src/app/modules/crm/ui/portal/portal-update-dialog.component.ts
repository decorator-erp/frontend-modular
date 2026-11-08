import { HttpErrorResponse } from '@angular/common/http';
import { ChangeDetectionStrategy, Component, computed, inject, signal } from '@angular/core';
import {
  FormBuilder,
  FormControl,
  FormGroup,
  ReactiveFormsModule,
  Validators,
} from '@angular/forms';
import type { Observable } from 'rxjs';
import { ToastService } from '@platform/feedback/toast.service';
import { ErrorHandlerService, friendly } from '@platform/http/error-handler.service';
import { CatalogService } from '@platform/i18n/catalog.service';
import {
  PERA_MODAL_DATA,
  PeraAlertComponent,
  PeraCheckboxComponent,
  PeraFormFieldComponent,
  PeraFormModalComponent,
  PeraInputComponent,
  PeraModalRef,
  PeraSwitchComponent,
  PeraTextareaComponent,
} from '@ds';
import { CrmPortalVisibilityService } from '../../data/crm-portal-visibility.service';
import {
  PORTAL_FILE_KINDS,
  type PortalShare,
  type PortalUpdateDraft,
} from '../../model/portal.model';
import { PORTAL_TITLE_MAX } from './portal-share-dialog.component';
import { portalKindKey, shareDisplayName } from './portal-labels';

export const PORTAL_BODY_MAX = 10000;

export type PortalUpdateDialogData =
  | {
      mode: 'create' | 'edit';
      projectId: string;
      shares: PortalShare[];
      update?: PortalUpdateDraft;
    }
  | { mode: 'publish'; projectId: string; update: PortalUpdateDraft };

/**
 * crmp P2-B: write or edit a client update (title, text, attached shares — only active Document,
 * Image and SitePhoto shares), or publish one with "Notify the client". Drafts go through
 * `POST`/`PUT …/updates`, publishing through `POST …/updates/{id}/publish` (409 AlreadyPublished
 * shows in the banner).
 */
@Component({
  selector: 'app-crm-portal-update-dialog',
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [
    ReactiveFormsModule,
    PeraAlertComponent,
    PeraCheckboxComponent,
    PeraFormModalComponent,
    PeraFormFieldComponent,
    PeraInputComponent,
    PeraSwitchComponent,
    PeraTextareaComponent,
  ],
  template: `
    <pera-form-modal
      [title]="catalog.t(titleKey)"
      [subtitle]="data.mode === 'publish' ? data.update.title : ''"
      size="md"
      [submitLabel]="catalog.t(data.mode === 'publish' ? 'pportal.publish' : 'common.save')"
      [cancelLabel]="catalog.t('common.cancel')"
      [submittingLabel]="catalog.t('common.saving')"
      [submitting]="submitting()"
      [errorMessage]="error()"
      (submitted)="submit()"
      (cancelled)="close()"
    >
      <div [formGroup]="form" class="flex flex-col gap-4">
        @if (data.mode === 'publish') {
          <p class="m-0 fs-body-sm text-text-secondary" dir="auto">
            {{ catalog.t('pportal.publishBody', { title: data.update.title }) }}
          </p>
          <pera-switch formControlName="notifyClient">{{
            catalog.t('pportal.notifyClient')
          }}</pera-switch>
        } @else {
          <pera-form-field
            [label]="catalog.t('pportal.updateTitle')"
            [required]="true"
            [error]="titleError()"
          >
            <pera-input formControlName="title" dir="auto" />
          </pera-form-field>
          <pera-form-field [label]="catalog.t('pportal.updateBody')" [error]="bodyError()">
            <pera-textarea formControlName="body" dir="auto" [rows]="5" />
          </pera-form-field>
          <fieldset class="flex flex-col gap-2 m-0 p-0 border-0">
            <legend class="fs-body-sm font-medium text-text-primary mb-1">
              {{ catalog.t('pportal.updateAttachments') }}
            </legend>
            @if (attachable().length) {
              @for (s of attachable(); track s.id) {
                <pera-checkbox [formControl]="attachments.controls[s.id]" [attr.data-share]="s.id"
                  ><span dir="auto">{{ name(s) }}</span>
                  <span class="fs-caption text-text-muted">
                    · {{ catalog.t(kindKey(s)) }}</span
                  ></pera-checkbox
                >
              }
            } @else {
              <pera-alert tone="info">{{ catalog.t('pportal.noAttachable') }}</pera-alert>
            }
          </fieldset>
        }
      </div>
    </pera-form-modal>
  `,
})
export class CrmPortalUpdateDialogComponent {
  private readonly fb = inject(FormBuilder);
  private readonly api = inject(CrmPortalVisibilityService);
  private readonly errors = inject(ErrorHandlerService);
  private readonly toast = inject(ToastService);
  private readonly modalRef = inject(PeraModalRef) as PeraModalRef<boolean>;
  protected readonly catalog = inject(CatalogService);
  readonly data = inject(PERA_MODAL_DATA) as PortalUpdateDialogData;

  protected readonly titleKey =
    this.data.mode === 'publish'
      ? 'pportal.publishTitle'
      : this.data.mode === 'edit'
        ? 'pportal.editUpdate'
        : 'pportal.newUpdate';

  readonly form = this.fb.nonNullable.group({
    title: [
      this.data.update?.title ?? '',
      [Validators.required, Validators.maxLength(PORTAL_TITLE_MAX)],
    ],
    body: [this.data.update?.body ?? '', [Validators.maxLength(PORTAL_BODY_MAX)]],
    notifyClient: [false],
  });

  /** Active Document, Image and SitePhoto shares (the backend's attachable kinds). */
  protected readonly attachable = computed(() =>
    this.data.mode === 'publish'
      ? []
      : this.data.shares.filter((s) => PORTAL_FILE_KINDS.includes(s.itemKind)),
  );
  /** One checkbox per attachable share, ticked when the update already attaches it. */
  readonly attachments = new FormGroup<Record<string, FormControl<boolean>>>(
    Object.fromEntries(
      this.attachable().map((s) => [
        s.id,
        new FormControl(this.data.update?.shareIds.includes(s.id) ?? false, { nonNullable: true }),
      ]),
    ),
  );
  readonly submitting = signal(false);
  readonly error = signal<string | null>(null);

  protected name(share: PortalShare): string {
    return shareDisplayName(share);
  }

  protected kindKey(share: PortalShare) {
    return portalKindKey(share.itemKind);
  }

  protected titleError(): string {
    const c = this.form.controls.title;
    if (!c.touched || !c.errors) return '';
    if (c.errors['required']) return this.catalog.t('pportal.titleRequired');
    return this.catalog.t('pportal.tooLong', { max: PORTAL_TITLE_MAX });
  }

  protected bodyError(): string {
    return this.form.controls.body.errors?.['maxlength']
      ? this.catalog.t('pportal.tooLong', { max: PORTAL_BODY_MAX })
      : '';
  }

  /** The ticked share ids, in list order. */
  selectedIds(): string[] {
    const v = this.attachments.getRawValue();
    return this.attachable()
      .map((s) => s.id)
      .filter((id) => v[id]);
  }

  close(): void {
    this.modalRef.close(false);
  }

  submit(): void {
    if (this.submitting()) return;
    const data = this.data;
    let call: Observable<unknown>;
    if (data.mode === 'publish') {
      call = this.api.publishUpdate(
        data.projectId,
        data.update.id,
        this.form.controls.notifyClient.value,
      );
    } else {
      if (this.form.controls.title.invalid || this.form.controls.body.invalid) {
        this.form.markAllAsTouched();
        return;
      }
      // Only active shares are offered, so a since-unshared attachment drops (it would be a 400).
      const req = {
        title: this.form.controls.title.value,
        body: this.form.controls.body.value,
        shareIds: this.selectedIds(),
      };
      call =
        data.mode === 'edit' && data.update
          ? this.api.editUpdate(data.projectId, data.update.id, req)
          : this.api.createUpdate(data.projectId, req);
    }
    this.submitting.set(true);
    this.error.set(null);
    call.subscribe({
      next: () => {
        this.toast.show({
          tone: 'success',
          message: this.catalog.t(
            data.mode === 'publish' ? 'pportal.publishedToast' : 'pportal.updateSaved',
          ),
        });
        this.modalRef.close(true);
      },
      error: (err: HttpErrorResponse) => {
        this.submitting.set(false);
        this.error.set(friendly(this.errors.parse(err)));
      },
    });
  }
}
