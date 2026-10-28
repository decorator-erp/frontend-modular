import { ChangeDetectionStrategy, Component, OnInit, inject, signal } from '@angular/core';
import { HttpErrorResponse } from '@angular/common/http';
import { FormBuilder, ReactiveFormsModule, Validators } from '@angular/forms';
import { BoqSnapshotService } from '../../data/boq-snapshot.service';
import { ProjectStageService } from '../shared/projects-services.todo-008'; // TODO(008): '@modules/projects'
import { ErrorHandlerService } from '@platform/http/error-handler.service';
import { ToastService } from '@platform/feedback/toast.service';
import { BoqSnapshotTypeValues } from '../../model/enums';
import type { BoqSnapshotType } from '../../model/enums';
import { boqStageRequiredOnStageCloseValidator } from '../../model/validation/validators.finance';
import { applyFinanceServerError } from '../../model/validation/finance-error-mapping';
import {
  PERA_MODAL_DATA,
  PeraAlertComponent,
  PeraButtonComponent,
  PeraFormFieldComponent,
  PeraModalRef,
  PeraSelectComponent,
  PeraTextareaComponent,
  SelectOption,
} from '@ds';

export interface BoqGenerateData {
  projectId: string;
}

/** BOQ snapshot generate modal — §F-BOQ. */
@Component({
  selector: 'app-boq-generate',
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [
    ReactiveFormsModule,
    PeraAlertComponent,
    PeraButtonComponent,
    PeraFormFieldComponent,
    PeraSelectComponent,
    PeraTextareaComponent,
  ],
  template: `
    <form
      [formGroup]="form"
      (ngSubmit)="submit()"
      class="flex flex-col gap-4 p-5 min-w-[var(--w-dialog)] bg-surface border border-border"
    >
      <h2 class="m-0 fs-body font-semibold">Generate BOQ snapshot</h2>
      @if (alert(); as a) {
        <pera-alert tone="danger">{{ a }}</pera-alert>
      }

      <pera-form-field label="Type" [required]="true">
        <div class="grid grid-cols-3 gap-2">
          @for (t of types; track t.value) {
            <button
              type="button"
              class="text-left p-2.5 border bg-bg cursor-pointer"
              [class.border-text-primary]="form.value.type === t.value"
              [class.border-border]="form.value.type !== t.value"
              (click)="form.patchValue({ type: t.value })"
            >
              <div class="font-mono fs-label uppercase text-text-muted">{{ t.value }}</div>
              <div class="fs-caption mt-1">{{ t.label }}</div>
            </button>
          }
        </div>
      </pera-form-field>

      @if (form.value.type === 'StageClose') {
        <pera-form-field label="Stage" [required]="true">
          <pera-select
            formControlName="projectStageId"
            [options]="stages()"
            placeholder="Pick a stage"
          />
        </pera-form-field>
      }

      <pera-form-field label="Notes" hint="Up to 512 characters.">
        <pera-textarea formControlName="notes" [rows]="3" />
        <div class="text-right font-mono fs-label text-text-muted mt-1">
          {{ form.value.notes?.length ?? 0 }}/512
        </div>
      </pera-form-field>

      <div class="flex justify-end gap-2 pt-1">
        <pera-button type="button" variant="ghost" (click)="cancel()">Cancel</pera-button>
        <pera-button type="submit" variant="primary" [disabled]="form.invalid || saving()">
          {{ saving() ? 'Generating…' : 'Generate' }}
        </pera-button>
      </div>
    </form>
  `,
})
export class BoqGenerateComponent implements OnInit {
  private readonly fb = inject(FormBuilder);
  private readonly api = inject(BoqSnapshotService);
  private readonly stagesApi = inject(ProjectStageService);
  private readonly errors = inject(ErrorHandlerService);
  private readonly toast = inject(ToastService);
  private readonly ref = inject<PeraModalRef<string | false>>(PeraModalRef);
  readonly data = inject<BoqGenerateData>(PERA_MODAL_DATA);

  readonly saving = signal(false);
  readonly alert = signal<string | null>(null);
  readonly stages = signal<SelectOption[]>([]);
  readonly types = BoqSnapshotTypeValues.map((v) => ({ value: v, label: v }));

  readonly form = this.fb.group(
    {
      type: this.fb.control<BoqSnapshotType | ''>('', [Validators.required]),
      projectStageId: [''],
      notes: ['', [Validators.maxLength(512)]],
    },
    { validators: [boqStageRequiredOnStageCloseValidator] },
  );

  ngOnInit(): void {
    this.stagesApi
      .getByProject(this.data.projectId)
      .subscribe((list) => this.stages.set(list.map((s) => ({ value: s.id, label: s.name }))));
  }

  cancel(): void {
    this.ref.close(false);
  }

  submit(): void {
    if (this.form.invalid || this.saving()) return;
    this.saving.set(true);
    this.alert.set(null);
    const raw = this.form.getRawValue();
    this.api
      .generate({
        projectId: this.data.projectId,
        type: raw.type as BoqSnapshotType,
        projectStageId: raw.projectStageId || null,
        notes: raw.notes?.trim() || null,
      })
      .subscribe({
        next: (id) => {
          this.toast.show({ tone: 'success', message: 'BOQ snapshot generated' });
          this.ref.close(id);
        },
        error: (err: HttpErrorResponse) => {
          this.saving.set(false);
          applyFinanceServerError(
            this.form,
            this.errors.parse(err),
            {
              'boqSnapshots.MissingStage': 'projectStageId',
            },
            this.alert,
          );
        },
      });
  }
}
