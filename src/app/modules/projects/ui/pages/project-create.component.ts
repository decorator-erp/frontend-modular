import { ChangeDetectionStrategy, Component, OnInit, inject, signal } from '@angular/core';
import { Router } from '@angular/router';
import { FormBuilder, ReactiveFormsModule, Validators } from '@angular/forms';
import { takeUntilDestroyed } from '@angular/core/rxjs-interop';
import { ProjectService } from '../../data/project.service';
import { ClientService } from '@modules/clients';
import { ErrorHandlerService, friendly } from '@platform/http/error-handler.service';
import { ToastService } from '@platform/feedback/toast.service';
import { CreateProjectRequest, WorkflowType } from '../../model/project.model';
import { ParsedApiError } from '@platform/types';
import { PeraValidators, ServerErrorsDirective, firstErrorMessage } from '@shared/forms';
import { StageTemplatesService } from '@modules/library';
import {
  PeraButtonComponent,
  PeraCardComponent,
  PeraFormFieldComponent,
  PeraInputComponent,
  PeraRadioComponent,
  PeraSelectComponent,
  PeraTextareaComponent,
  SelectOption,
} from '@ds';

@Component({
  selector: 'app-project-create',
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [
    ReactiveFormsModule,
    ServerErrorsDirective,
    PeraButtonComponent,
    PeraCardComponent,
    PeraFormFieldComponent,
    PeraInputComponent,
    PeraRadioComponent,
    PeraSelectComponent,
    PeraTextareaComponent,
  ],
  templateUrl: './project-create.component.html',
})
export class ProjectCreateComponent implements OnInit {
  private readonly fb = inject(FormBuilder);
  private readonly projects = inject(ProjectService);
  private readonly clientsApi = inject(ClientService);
  private readonly templatesApi = inject(StageTemplatesService);
  private readonly errorHandler = inject(ErrorHandlerService);
  private readonly toast = inject(ToastService);
  private readonly router = inject(Router);

  readonly form = this.fb.nonNullable.group(
    {
      code: ['', [Validators.required, PeraValidators.trimmedLength(2, 32)]],
      name: ['', [Validators.required, PeraValidators.trimmedLength(2, 200)]],
      address: ['', [Validators.required, PeraValidators.trimmedLength(5, 300)]],
      clientId: [null as string | null, [Validators.required]],
      workflowType: ['Stage' as WorkflowType, [Validators.required]],
      stageTemplateId: [null as string | null, [Validators.required]],
      estimatedStartDate: ['', [PeraValidators.isoDate]],
      estimatedEndDate: ['', [PeraValidators.isoDate]],
      description: ['', [Validators.maxLength(1000)]],
      notes: ['', [Validators.maxLength(500)]],
    },
    { validators: [PeraValidators.dateRange('estimatedStartDate', 'estimatedEndDate')] },
  );

  readonly serverError = signal<ParsedApiError | null>(null);
  readonly submitting = signal(false);

  readonly clientOptions = signal<SelectOption[]>([]);
  readonly templateOptions = signal<SelectOption[]>([]);

  readonly workflowOptions = [
    {
      value: 'Stage' as WorkflowType,
      label: 'Stage-based',
      description: 'Ordered stages seeded from a template, with gates',
    },
    {
      value: 'FreeStyle' as WorkflowType,
      label: 'Free-style',
      description: 'A flat task list without stages',
    },
  ];

  constructor() {
    // FreeStyle projects have no template; Stage projects require one.
    this.form.controls.workflowType.valueChanges.pipe(takeUntilDestroyed()).subscribe((type) => {
      const template = this.form.controls.stageTemplateId;
      if (type === 'FreeStyle') {
        template.setValue(null);
        template.clearValidators();
        template.disable();
      } else {
        template.enable();
        template.setValidators([Validators.required]);
      }
      template.updateValueAndValidity();
    });
  }

  ngOnInit(): void {
    this.clientsApi
      .getAll()
      .subscribe((list) =>
        this.clientOptions.set(
          list.map((c) => ({ value: c.id, label: `${c.firstName} ${c.lastName}` })),
        ),
      );
    this.templatesApi
      .list()
      .subscribe((list) =>
        this.templateOptions.set(
          list
            .filter((t) => t.isActive)
            .map((t) => ({ value: t.id, label: t.isDefault ? `${t.name} (default)` : t.name })),
        ),
      );
  }

  errorOf(name: string): string {
    const control = this.form.get(name);
    if (control && control.touched && control.errors) return firstErrorMessage(control.errors);
    if (
      name === 'estimatedEndDate' &&
      this.form.errors?.['dateRange'] &&
      this.form.get(name)?.touched
    ) {
      return firstErrorMessage(this.form.errors);
    }
    return '';
  }

  cancel(): void {
    void this.router.navigate(['/projects']);
  }

  submit(): void {
    if (this.form.invalid) {
      this.form.markAllAsTouched();
      return;
    }
    this.submitting.set(true);
    this.serverError.set(null);
    const v = this.form.getRawValue();
    const payload = {
      code: v.code.trim(),
      name: v.name.trim(),
      address: v.address.trim(),
      clientId: v.clientId,
      workflowType: v.workflowType,
      stageTemplateId: v.workflowType === 'Stage' ? v.stageTemplateId : null,
      estimatedStartDate: v.estimatedStartDate || null,
      estimatedEndDate: v.estimatedEndDate || null,
      description: v.description.trim() || null,
      notes: v.notes.trim() || null,
    } as unknown as CreateProjectRequest;

    this.projects.create(payload).subscribe({
      next: (id) => {
        this.toast.show({ tone: 'success', message: 'Project created' });
        void this.router.navigate(['/projects', id]);
      },
      error: (err) => {
        const parsed = this.errorHandler.parse(err);
        this.serverError.set({ ...parsed, generalMessage: friendly(parsed) });
        this.submitting.set(false);
      },
    });
  }
}
