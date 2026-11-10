import { ChangeDetectionStrategy, Component, OnInit, inject, signal } from '@angular/core';
import { FormBuilder, ReactiveFormsModule, Validators } from '@angular/forms';
import { catchError, of } from 'rxjs';
import { takeUntilDestroyed } from '@angular/core/rxjs-interop';
import { ProjectDocumentsService, ProjectService } from '@modules/projects';
import { CatalogService } from '@platform/i18n/catalog.service';
import {
  PERA_MODAL_DATA,
  PeraAlertComponent,
  PeraButtonComponent,
  PeraFormFieldComponent,
  PeraInputComponent,
  PeraModalRef,
  PeraSelectComponent,
  SelectOption,
} from '@ds';
import type { SignVariationRequest } from '../../model/variation.model';

export interface VariationSignDialogData {
  projectId: string;
}

/**
 * Sync W1-7: collect what `PUT /variations/{id}/sign` requires — `SignVariationRequest(Guid
 * SignedByClientId, string SignedDocumentPath)` (dms VariationMessages.cs:29). The signer is the
 * project's client (`ProjectResponse.ClientId`); the signed document is typed as a path, or picked
 * from the project's documents (stored as `project-documents/{id}`). Closes with the request, or
 * `null` on cancel.
 */
@Component({
  selector: 'app-variation-sign-dialog',
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [
    ReactiveFormsModule,
    PeraAlertComponent,
    PeraButtonComponent,
    PeraFormFieldComponent,
    PeraInputComponent,
    PeraSelectComponent,
  ],
  template: `
    <form
      [formGroup]="form"
      (ngSubmit)="submit()"
      class="flex flex-col gap-4 p-5 min-w-[var(--w-dialog)] bg-surface border border-border rounded-card"
    >
      <h2 class="m-0 fs-body font-semibold">{{ catalog.t('var.sign.title') }}</h2>

      @if (loaded() && !clientId()) {
        <pera-alert tone="danger" data-no-client>{{ catalog.t('var.sign.noClient') }}</pera-alert>
      }

      <pera-form-field [label]="catalog.t('var.sign.client')">
        <div class="fs-caption font-medium" data-client>{{ clientName() || '—' }}</div>
      </pera-form-field>

      <pera-form-field
        [label]="catalog.t('var.sign.pickDocument')"
        [hint]="catalog.t('var.sign.pickHint')"
      >
        <pera-select
          formControlName="documentId"
          [options]="documentOptions()"
          [placeholder]="catalog.t('var.sign.pickPlaceholder')"
        />
      </pera-form-field>

      <pera-form-field [label]="catalog.t('var.sign.path')" [required]="true">
        <pera-input formControlName="signedDocumentPath" />
      </pera-form-field>

      <div class="flex justify-end gap-2 pt-1">
        <pera-button type="button" variant="ghost" (click)="cancel()">{{
          catalog.t('var.sign.cancel')
        }}</pera-button>
        <pera-button
          type="submit"
          variant="primary"
          [disabled]="form.invalid || !clientId()"
          data-submit
          >{{ catalog.t('var.sign.submit') }}</pera-button
        >
      </div>
    </form>
  `,
})
export class VariationSignDialogComponent implements OnInit {
  private readonly fb = inject(FormBuilder);
  private readonly projects = inject(ProjectService);
  private readonly documents = inject(ProjectDocumentsService);
  private readonly ref = inject<PeraModalRef<SignVariationRequest | null>>(PeraModalRef);
  readonly data = inject<VariationSignDialogData>(PERA_MODAL_DATA);
  protected readonly catalog = inject(CatalogService);

  readonly loaded = signal(false);
  readonly clientId = signal<string>('');
  readonly clientName = signal<string>('');
  readonly documentOptions = signal<SelectOption[]>([]);

  readonly form = this.fb.nonNullable.group({
    documentId: [''],
    signedDocumentPath: ['', [Validators.required, Validators.maxLength(512)]],
  });

  constructor() {
    this.form.controls.documentId.valueChanges
      .pipe(takeUntilDestroyed())
      .subscribe((id) => this.pickDocument(id));
  }

  ngOnInit(): void {
    this.projects
      .getById(this.data.projectId)
      .pipe(catchError(() => of(null)))
      .subscribe((p) => {
        this.clientId.set(p?.clientId ?? '');
        this.clientName.set(p?.clientName ?? '');
        this.loaded.set(true);
      });
    this.documents
      .getByProject(this.data.projectId)
      .pipe(catchError(() => of([])))
      .subscribe((docs) =>
        this.documentOptions.set(docs.map((d) => ({ value: d.id, label: d.fileName }))),
      );
  }

  /** A picked project document fills the path field (still editable). */
  pickDocument(id: unknown): void {
    if (typeof id === 'string' && id) {
      this.form.controls.signedDocumentPath.setValue(`project-documents/${id}`);
    }
  }

  cancel(): void {
    this.ref.close(null);
  }

  submit(): void {
    if (this.form.invalid || !this.clientId()) return;
    this.ref.close({
      signedByClientId: this.clientId(),
      signedDocumentPath: this.form.getRawValue().signedDocumentPath.trim(),
    });
  }
}
