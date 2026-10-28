import { ChangeDetectionStrategy, Component, inject, signal } from '@angular/core';
import { FormsModule } from '@angular/forms';
import { ProjectService } from '../../data/project.service';
import { ToastService } from '@platform/feedback/toast.service';
import { ProjectStatus } from '../../model/project.model';
import { projectStatusLabel } from '@shared/ui/status';
import {
  PERA_MODAL_DATA,
  PeraButtonComponent,
  PeraFormFieldComponent,
  PeraModalComponent,
  PeraModalFooterDirective,
  PeraModalRef,
  PeraSelectComponent,
  SelectOption,
} from '@ds';

export interface ChangeStatusDialogData {
  projectId: string;
  projectName: string;
  current: ProjectStatus;
}

/** Allowed forward transitions, mirroring the backend state machine. */
const TRANSITIONS: Record<ProjectStatus, ProjectStatus[]> = {
  Draft: ['InProgress', 'Cancelled'],
  InProgress: ['OnHold', 'Completed', 'Cancelled'],
  OnHold: ['InProgress', 'Cancelled'],
  Completed: [],
  Cancelled: [],
};

@Component({
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [
    FormsModule,
    PeraModalComponent,
    PeraModalFooterDirective,
    PeraFormFieldComponent,
    PeraSelectComponent,
    PeraButtonComponent,
  ],
  template: `
    <pera-modal title="Change status" size="sm">
      <div class="flex flex-col gap-3">
        <p class="m-0 text-sm text-text-secondary">
          {{ data.projectName }} is currently <strong>{{ label(data.current) }}</strong
          >.
        </p>
        @if (options.length > 0) {
          <pera-form-field label="New status" [required]="true">
            <pera-select
              [options]="options"
              [ngModel]="next()"
              (ngModelChange)="next.set($event)"
              placeholder="Select a status"
            />
          </pera-form-field>
        } @else {
          <p class="m-0 text-sm text-text-muted">No further transitions from this status.</p>
        }
      </div>
      <div peraModalFooter class="flex gap-2">
        <pera-button variant="ghost" (click)="close()">Cancel</pera-button>
        <pera-button
          variant="primary"
          [disabled]="!next()"
          [loading]="submitting()"
          (click)="submit()"
        >
          Update status
        </pera-button>
      </div>
    </pera-modal>
  `,
})
export class ChangeStatusDialogComponent {
  private readonly projects = inject(ProjectService);
  private readonly toast = inject(ToastService);
  private readonly modalRef = inject(PeraModalRef) as PeraModalRef<ProjectStatus | undefined>;
  readonly data = inject(PERA_MODAL_DATA) as ChangeStatusDialogData;

  readonly options: SelectOption[] = TRANSITIONS[this.data.current].map((status) => ({
    value: status,
    label: projectStatusLabel(status),
  }));

  readonly next = signal<ProjectStatus | null>(null);
  readonly submitting = signal(false);
  readonly label = projectStatusLabel;

  close(): void {
    this.modalRef.close(undefined);
  }

  submit(): void {
    const status = this.next();
    if (!status) return;
    this.submitting.set(true);
    this.projects.setStatus(this.data.projectId, status).subscribe({
      next: () => {
        this.toast.show({
          tone: 'success',
          message: `Status changed to ${projectStatusLabel(status)}`,
        });
        this.modalRef.close(status);
      },
      error: () => this.submitting.set(false),
    });
  }
}
