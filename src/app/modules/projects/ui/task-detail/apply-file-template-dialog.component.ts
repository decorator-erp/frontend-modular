import {
  ChangeDetectionStrategy,
  Component,
  OnInit,
  computed,
  inject,
  signal,
} from '@angular/core';
import { HttpErrorResponse } from '@angular/common/http';
import { FormsModule } from '@angular/forms';
import {
  PERA_MODAL_DATA,
  PeraFormFieldComponent,
  PeraFormModalComponent,
  PeraModalRef,
  PeraSelectComponent,
  SelectOption,
} from '@ds';
import { FileTemplate, FileTemplatesService } from '@modules/library';
import { ToastService } from '@platform/feedback/toast.service';
import { ErrorHandlerService, friendly } from '@platform/http/error-handler.service';
import { CatalogService } from '@platform/i18n/catalog.service';
import type { CatalogKey } from '@platform/i18n/catalog/en';
import { PERM } from '@platform/permissions';

export interface ApplyFileTemplateDialogData {
  taskId: string;
}

/**
 * Sync F3: copy an active file template into the task — `POST /project-tasks/{taskId}/apply-template/
 * {templateId}` (dms DocumentUploadEndpoints.cs:83, `documents.upload`). The server files the copy
 * in the task's default folder. Closes with `true` after the copy.
 */
@Component({
  selector: 'app-apply-file-template-dialog',
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [FormsModule, PeraFormFieldComponent, PeraFormModalComponent, PeraSelectComponent],
  template: `
    <pera-form-modal
      size="sm"
      eyebrow="POST /api/project-tasks/{id}/apply-template/{templateId}"
      [title]="t('ftpl.applyTitle')"
      [subtitle]="t('ftpl.applyBody')"
      [permission]="perm"
      [cancelLabel]="t('ftpl.dlg.cancel')"
      [submitLabel]="t('ftpl.applySubmit')"
      [submittingLabel]="t('ftpl.applying')"
      [submitting]="busy()"
      [submitDisabled]="!templateId()"
      [errorMessage]="serverError()"
      (submitted)="submit()"
      (cancelled)="ref.close(false)"
    >
      @if (loaded() && !options().length) {
        <p class="m-0 fs-caption text-text-muted" data-none>{{ t('ftpl.applyNone') }}</p>
      } @else {
        <pera-form-field [label]="t('ftpl.applyPick')" [required]="true">
          <pera-select
            [options]="options()"
            [placeholder]="t('ftpl.applyPick')"
            [ngModel]="templateId()"
            (ngModelChange)="templateId.set($event ?? '')"
            data-template
          />
        </pera-form-field>
      }
    </pera-form-modal>
  `,
})
export class ApplyFileTemplateDialogComponent implements OnInit {
  private readonly api = inject(FileTemplatesService);
  private readonly errors = inject(ErrorHandlerService);
  private readonly toast = inject(ToastService);
  private readonly catalog = inject(CatalogService);
  readonly ref = inject(PeraModalRef) as PeraModalRef<boolean>;
  readonly data = inject(PERA_MODAL_DATA) as ApplyFileTemplateDialogData;

  readonly perm = PERM.documents.upload;
  readonly templates = signal<FileTemplate[]>([]);
  readonly loaded = signal(false);
  readonly templateId = signal('');
  readonly busy = signal(false);
  readonly serverError = signal<string | null>(null);

  /** Only active templates apply (`file_templates.NotFound` otherwise). */
  readonly options = computed<SelectOption[]>(() =>
    this.templates()
      .filter((x) => x.isActive)
      .map((x) => ({
        value: x.id,
        label: `${x.name} · ${this.t(`ftpl.cat.${x.category}`)}`,
      })),
  );

  ngOnInit(): void {
    this.api.list().subscribe({
      next: (list) => {
        this.templates.set(list);
        this.loaded.set(true);
      },
      error: (err: HttpErrorResponse) => {
        this.loaded.set(true);
        this.serverError.set(friendly(this.errors.parse(err)));
      },
    });
  }

  t(key: string, params?: Record<string, string | number>): string {
    return this.catalog.t(key as CatalogKey, params);
  }

  submit(): void {
    const id = this.templateId();
    if (!id || this.busy()) return;
    const name = this.templates().find((x) => x.id === id)?.name ?? '';
    this.busy.set(true);
    this.serverError.set(null);
    this.api.applyToTask(this.data.taskId, id).subscribe({
      next: () => {
        this.busy.set(false);
        this.toast.show({ tone: 'success', message: this.t('ftpl.applied', { name }) });
        this.ref.close(true);
      },
      error: (err: HttpErrorResponse) => {
        this.busy.set(false);
        const parsed = this.errors.parse(err);
        this.serverError.set(
          parsed.code === 'file_templates.NotFound'
            ? this.t('ftpl.err.notFound')
            : friendly(parsed),
        );
      },
    });
  }
}
