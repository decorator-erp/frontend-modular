import { HttpErrorResponse } from '@angular/common/http';
import { ChangeDetectionStrategy, Component, inject, signal } from '@angular/core';
import { FormBuilder, ReactiveFormsModule, Validators } from '@angular/forms';
import type { Observable } from 'rxjs';
import { ToastService } from '@platform/feedback/toast.service';
import { ErrorHandlerService, friendly } from '@platform/http/error-handler.service';
import { CatalogService } from '@platform/i18n/catalog.service';
import {
  PERA_MODAL_DATA,
  PeraFormFieldComponent,
  PeraFormModalComponent,
  PeraInputComponent,
  PeraModalRef,
  PeraSwitchComponent,
  PeraTextareaComponent,
} from '@ds';
import { CrmPortalVisibilityService } from '../../data/crm-portal-visibility.service';
import { followsLatest, type PortalShare, type PortalShareKind } from '../../model/portal.model';
import { PortalSharesStore } from '../../stores/portal-shares.store';

export const PORTAL_TITLE_MAX = 200;
export const PORTAL_NOTE_MAX = 2000;

export type PortalShareDialogData =
  | { mode: 'edit'; projectId: string; share: PortalShare }
  | { mode: 'create'; projectId: string; kind: PortalShareKind; itemId: string; itemName: string };

/**
 * crmp P2-B: the client title, note and follow-latest of a share. `edit` writes `PUT …/shares/{id}`;
 * `create` (the "Share with client" action on an item screen) writes `POST …/shares` with an optional
 * "Notify the client". Errors show in the dialog's banner (`friendly`); writes are handled(400,403,404,409).
 */
@Component({
  selector: 'app-crm-portal-share-dialog',
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [
    ReactiveFormsModule,
    PeraFormModalComponent,
    PeraFormFieldComponent,
    PeraInputComponent,
    PeraSwitchComponent,
    PeraTextareaComponent,
  ],
  template: `
    <pera-form-modal
      [title]="catalog.t(data.mode === 'edit' ? 'pportal.editTitle' : 'pportal.shareWithClient')"
      [subtitle]="itemName"
      size="md"
      [submitLabel]="catalog.t(data.mode === 'edit' ? 'common.save' : 'pportal.share')"
      [cancelLabel]="catalog.t('common.cancel')"
      [submittingLabel]="catalog.t('common.saving')"
      [submitting]="submitting()"
      [errorMessage]="error()"
      (submitted)="submit()"
      (cancelled)="close()"
    >
      <div [formGroup]="form" class="flex flex-col gap-4">
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
        @if (showFollowLatest) {
          <div class="flex flex-col gap-1">
            <pera-switch formControlName="followLatest">{{
              catalog.t('pportal.followLatest')
            }}</pera-switch>
            <span class="fs-caption text-text-muted">{{
              catalog.t('pportal.followLatestHint')
            }}</span>
          </div>
        }
        @if (data.mode === 'create') {
          <pera-switch formControlName="notifyClient">{{
            catalog.t('pportal.notifyClient')
          }}</pera-switch>
        }
      </div>
    </pera-form-modal>
  `,
})
export class CrmPortalShareDialogComponent {
  private readonly fb = inject(FormBuilder);
  private readonly api = inject(CrmPortalVisibilityService);
  private readonly shares = inject(PortalSharesStore);
  private readonly errors = inject(ErrorHandlerService);
  private readonly toast = inject(ToastService);
  private readonly modalRef = inject(PeraModalRef) as PeraModalRef<boolean>;
  protected readonly catalog = inject(CatalogService);
  readonly data = inject(PERA_MODAL_DATA) as PortalShareDialogData;
  protected readonly TITLE_MAX = PORTAL_TITLE_MAX;
  protected readonly NOTE_MAX = PORTAL_NOTE_MAX;

  private readonly kind = this.data.mode === 'edit' ? this.data.share.itemKind : this.data.kind;
  protected readonly showFollowLatest = followsLatest(this.kind);
  protected readonly itemName =
    this.data.mode === 'edit' ? (this.data.share.itemName ?? '') : this.data.itemName;

  readonly form = this.fb.nonNullable.group({
    clientTitle: [
      this.data.mode === 'edit' ? (this.data.share.clientTitle ?? '') : '',
      [Validators.maxLength(PORTAL_TITLE_MAX)],
    ],
    clientNote: [
      this.data.mode === 'edit' ? (this.data.share.clientNote ?? '') : '',
      [Validators.maxLength(PORTAL_NOTE_MAX)],
    ],
    followLatest: [this.data.mode === 'edit' ? this.data.share.followLatest : true],
    notifyClient: [false],
  });

  readonly submitting = signal(false);
  readonly error = signal<string | null>(null);

  protected tooLong(name: 'clientTitle' | 'clientNote', max: number): string {
    return this.form.controls[name].errors?.['maxlength']
      ? this.catalog.t('pportal.tooLong', { max })
      : '';
  }

  close(): void {
    this.modalRef.close(false);
  }

  submit(): void {
    if (this.submitting()) return;
    if (this.form.invalid) {
      this.form.markAllAsTouched();
      return;
    }
    const v = this.form.getRawValue();
    const followLatest = this.showFollowLatest ? v.followLatest : undefined;
    const call: Observable<unknown> =
      this.data.mode === 'edit'
        ? this.api.updateShare(this.data.projectId, this.data.share.id, {
            clientTitle: v.clientTitle,
            clientNote: v.clientNote,
            followLatest,
          })
        : this.api.createShare(this.data.projectId, {
            itemKind: this.data.kind,
            itemId: this.data.itemId,
            clientTitle: v.clientTitle,
            clientNote: v.clientNote,
            followLatest,
            notifyClient: v.notifyClient,
          });
    this.submitting.set(true);
    this.error.set(null);
    call.subscribe({
      next: () => {
        this.shares.refresh(this.data.projectId);
        this.toast.show({
          tone: 'success',
          message: this.catalog.t(
            this.data.mode === 'edit' ? 'pportal.saved' : 'pportal.sharedToast',
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
