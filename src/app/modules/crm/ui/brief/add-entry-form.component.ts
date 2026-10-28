import { ChangeDetectionStrategy, Component, inject, signal } from '@angular/core';
import { FormBuilder, ReactiveFormsModule, Validators } from '@angular/forms';
import type { Observable } from 'rxjs';
import { CrmBriefService } from '../../data/crm-brief.service';
import { CrmLookupService } from '../../data/crm-lookup.service';
import { CrmMeetingService } from '../../data/crm-meeting.service';
import { CrmSpaceService } from '../../data/crm-space.service';
import { ErrorHandlerService, friendly } from '@platform/http/error-handler.service';
import { CatalogService } from '@platform/i18n/catalog.service';
import type { BriefSpace, BriefSpaceRequest, CrmMeeting, CrmSpace } from '../../model';
import { ToastService } from '@platform/feedback/toast.service';
import { ParsedApiError } from '@platform/types';
import { ServerErrorsDirective, firstErrorMessage } from '@shared/forms';
import {
  ModalService,
  PERA_MODAL_DATA,
  PeraButtonComponent,
  PeraFormFieldComponent,
  PeraFormModalComponent,
  PeraInputComponent,
  PeraModalRef,
  PeraSelectComponent,
  PeraTextareaComponent,
  SelectOption,
} from '@ds';
import {
  AddSpaceDialogData,
  CrmAddSpaceDialogComponent,
} from '../spaces/add-space-dialog.component';

export interface AddEntryFormDialogData {
  projectId: string;
  briefId: string;
  /** Editing an existing Draft/Rejected entry, rather than adding a new one. */
  existing?: BriefSpace;
  /** Set when added from the CRM task workspace (B5) — pins the new entry to that task. */
  projectTaskId?: string | null;
}

/**
 * Add / edit a gathering entry (T062, "Add entry" on the unified ledger). An entry
 * points at a real space or is "General" (project-wide). Editing is only ever reached
 * for a Draft/Rejected entry — a locked one offers "New version…" instead. Calls
 * `CrmBriefService` directly; the host reloads from `afterClosed()`.
 */
@Component({
  selector: 'app-crm-add-entry-form',
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [
    ReactiveFormsModule,
    ServerErrorsDirective,
    PeraButtonComponent,
    PeraFormModalComponent,
    PeraFormFieldComponent,
    PeraInputComponent,
    PeraSelectComponent,
    PeraTextareaComponent,
  ],
  template: `
    <pera-form-modal
      [eyebrow]="
        isEdit ? 'PUT /api/crm/brief-spaces/{spaceId}' : 'POST /api/crm/briefs/{briefId}/spaces'
      "
      [title]="catalog.t('brief.addEntry')"
      permission="crm.briefs.manage"
      [submitLabel]="catalog.t('common.saveEntry')"
      [submittingLabel]="catalog.t('common.saving')"
      [submitting]="submitting()"
      [errorMessage]="serverError()?.generalMessage ?? null"
      [errorCode]="serverError()?.code ?? null"
      (submitted)="submit()"
      (cancelled)="close()"
    >
      <div [formGroup]="form" [serverErrors]="serverError()" class="flex flex-col gap-4">
        <pera-form-field [label]="catalog.t('brief.entrySpaceL')">
          <div class="flex items-center gap-2">
            <pera-select
              class="flex-1"
              formControlName="spaceId"
              [options]="spaceOptions()"
              [disabled]="isEdit"
            />
            @if (!isEdit) {
              <pera-button variant="ghost" size="sm" (click)="newSpace()">{{
                catalog.t('space.newSpace')
              }}</pera-button>
            }
          </div>
        </pera-form-field>

        <pera-form-field
          [label]="catalog.t('brief.entryReqsL')"
          [required]="true"
          [error]="errorOf('requirements')"
        >
          <pera-textarea
            formControlName="requirements"
            [error]="errorOf('requirements')"
            dir="auto"
          />
        </pera-form-field>

        <pera-form-field
          [label]="catalog.t('brief.entryCountL')"
          [hint]="catalog.t('common.optionalLbl')"
        >
          <pera-input type="number" formControlName="countOrPieces" />
        </pera-form-field>

        <pera-form-field
          [label]="catalog.t('item.srcMeeting')"
          [hint]="catalog.t('common.optionalLbl')"
        >
          <pera-select formControlName="meetingId" [options]="meetingOptions()" placeholder="—" />
        </pera-form-field>

        <p class="fs-caption text-text-muted m-0">{{ catalog.t('brief.entrySaved') }}</p>
      </div>
    </pera-form-modal>
  `,
})
export class CrmAddEntryFormComponent {
  private readonly fb = inject(FormBuilder);
  private readonly briefs = inject(CrmBriefService);
  private readonly meetingService = inject(CrmMeetingService);
  private readonly spaceService = inject(CrmSpaceService);
  private readonly lookup = inject(CrmLookupService);
  private readonly modal = inject(ModalService);
  private readonly errorHandler = inject(ErrorHandlerService);
  private readonly toast = inject(ToastService);
  private readonly modalRef = inject(PeraModalRef) as PeraModalRef<boolean>;
  protected readonly catalog = inject(CatalogService);
  readonly data = inject(PERA_MODAL_DATA) as AddEntryFormDialogData;

  readonly isEdit = !!this.data.existing;

  protected readonly spaceOptions = signal<SelectOption[]>([
    { value: '', label: this.catalog.t('brief.general') },
  ]);
  protected readonly meetingOptions = signal<SelectOption[]>([{ value: '', label: '—' }]);

  readonly form = this.fb.nonNullable.group({
    spaceId: [this.data.existing?.space?.id ?? ''],
    requirements: [
      this.data.existing?.requirements ?? '',
      [Validators.required, Validators.maxLength(2000)],
    ],
    countOrPieces: [
      this.data.existing?.countOrPieces != null ? String(this.data.existing.countOrPieces) : '',
    ],
    meetingId: [this.data.existing?.meetingId ?? ''],
  });

  readonly serverError = signal<ParsedApiError | null>(null);
  readonly submitting = signal(false);

  constructor() {
    this.loadSpaces();
    this.meetingService.search(this.data.projectId).subscribe((page) => {
      this.meetingOptions.set([
        { value: '', label: '—' },
        ...page.items.map((m: CrmMeeting) => ({ value: m.id, label: m.title })),
      ]);
    });
  }

  private loadSpaces(selectId?: string): void {
    this.spaceService.list(this.data.projectId).subscribe((spaces: CrmSpace[]) => {
      this.spaceOptions.set([
        { value: '', label: this.catalog.t('brief.general') },
        ...spaces.map((s) => ({ value: s.id, label: s.name })),
      ]);
      if (selectId) this.form.controls.spaceId.setValue(selectId);
    });
  }

  newSpace(): void {
    this.lookup.spaceTypes().subscribe(async (spaceTypes) => {
      const data: AddSpaceDialogData = { projectId: this.data.projectId, spaceTypes };
      const created = await this.modal
        .open<boolean>(CrmAddSpaceDialogComponent, { size: 'md', data })
        .afterClosed();
      if (created) this.loadSpaces();
    });
  }

  errorOf(name: string): string {
    const control = this.form.get(name);
    return control && control.touched && control.errors ? firstErrorMessage(control.errors) : '';
  }

  close(): void {
    this.modalRef.close(false);
  }

  submit(): void {
    if (this.form.invalid) {
      this.form.markAllAsTouched();
      return;
    }
    this.submitting.set(true);
    this.serverError.set(null);
    const v = this.form.getRawValue();

    const request: BriefSpaceRequest = {
      spaceId: v.spaceId || null,
      requirements: v.requirements.trim(),
      countOrPieces: v.countOrPieces.trim() ? Number(v.countOrPieces) : null,
      meetingId: v.meetingId || null,
      projectTaskId: this.data.existing?.projectTaskId ?? this.data.projectTaskId ?? null,
    };

    const call: Observable<unknown> =
      this.isEdit && this.data.existing
        ? this.briefs.updateSpace(this.data.existing.id, request)
        : this.briefs.addSpace(this.data.briefId, request);

    call.subscribe({
      next: () => {
        this.toast.show({ tone: 'success', message: this.catalog.t('brief.entrySaved') });
        this.modalRef.close(true);
      },
      error: (err) => {
        const parsed = this.errorHandler.parse(err);
        this.serverError.set({ ...parsed, generalMessage: friendly(parsed) });
        this.submitting.set(false);
      },
    });
  }
}
