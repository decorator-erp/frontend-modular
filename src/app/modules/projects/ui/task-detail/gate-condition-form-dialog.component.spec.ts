import { TestBed } from '@angular/core/testing';
import { of } from 'rxjs';
import {
  GateConditionFormDialogComponent,
  GateConditionFormDialogData,
} from './gate-condition-form-dialog.component';
import { TaskGateConditionService } from '../../data/task-gate-condition.service';
import { StageGateConditionService } from '../../data/stage-gate-condition.service';
import { ProjectTaskService } from '../../data/project-task.service';
import { ProjectStageService } from '../../data/project-stage.service';
import { ErrorHandlerService } from '@platform/http/error-handler.service';
import { ToastService } from '@platform/feedback/toast.service';
import { PERA_MODAL_DATA, PeraModalRef } from '@ds';

describe('GateConditionFormDialogComponent', () => {
  let created: Record<string, unknown> | null;
  let updated: { id: string; req: unknown } | null;
  let closedWith: unknown;
  const modalRef = {
    close: (r: unknown) => {
      closedWith = r;
    },
  };

  function make(data: GateConditionFormDialogData): GateConditionFormDialogComponent {
    created = null;
    updated = null;
    closedWith = undefined;
    TestBed.resetTestingModule();
    TestBed.configureTestingModule({
      imports: [GateConditionFormDialogComponent],
      providers: [
        {
          provide: TaskGateConditionService,
          useValue: {
            create: (req: Record<string, unknown>) => {
              created = req;
              return of('g-new');
            },
            update: (id: string, req: unknown) => {
              updated = { id, req };
              return of(undefined);
            },
          },
        },
        {
          provide: StageGateConditionService,
          useValue: { create: () => of('s'), update: () => of(undefined) },
        },
        {
          provide: ProjectTaskService,
          useValue: { getByProject: () => of([{ id: 't2', name: 'Task 2' }]) },
        },
        { provide: ProjectStageService, useValue: { getByProject: () => of([]) } },
        {
          provide: ErrorHandlerService,
          useValue: {
            parse: () => ({
              status: 409,
              generalMessage: 'x',
              fieldErrors: {},
              code: 'gate_conditions.CreationFailed',
              raw: null,
            }),
          },
        },
        { provide: ToastService, useValue: { show: () => undefined } },
        { provide: PeraModalRef, useValue: modalRef },
        { provide: PERA_MODAL_DATA, useValue: data },
      ],
    });
    return TestBed.createComponent(GateConditionFormDialogComponent).componentInstance;
  }

  const base = { ownerKind: 'task' as const, ownerId: 't1', projectId: 'p1' };

  it('create Task gate posts conditionType + the referenced task the backend requires', () => {
    const c = make({ mode: 'create', ...base });
    c.form.patchValue({
      conditionType: 'Task',
      referencedTaskId: 't2',
      label: 'Prior task done',
      trigger: 'Complete',
    });
    c.submit();
    expect(created?.['conditionType']).toBe('Task');
    expect(created?.['referencedTaskId']).toBe('t2');
    expect(created?.['label']).toBe('Prior task done');
    expect(closedWith).toBe(true);
  });

  it('Approval requires an approval type before it submits', () => {
    const c = make({ mode: 'create', ...base });
    c.form.controls.conditionType.setValue('Approval');
    c.form.patchValue({ label: 'Manager sign-off' });
    c.submit();
    expect(created).toBeNull(); // approvalType missing → blocked

    c.form.patchValue({ approvalType: 'ManagerApproval' });
    c.submit();
    expect(created?.['conditionType']).toBe('Approval');
    expect(created?.['approvalType']).toBe('ManagerApproval');
    expect(created?.['referencedTaskId']).toBeNull();
  });

  it('edit PUTs only label + trigger', () => {
    const c = make({
      mode: 'edit',
      ...base,
      gateId: 'g1',
      initial: {
        conditionType: 'Approval',
        trigger: 'Complete',
        label: 'Old',
        approvalType: 'ManagerApproval',
        referencedTaskId: null,
        referencedStageId: null,
      },
    });
    expect(c.isEdit).toBe(true);
    c.form.patchValue({ label: 'New label', trigger: 'Unlock' });
    c.submit();
    expect(updated?.id).toBe('g1');
    expect(updated?.req).toEqual({ label: 'New label', trigger: 'Unlock' });
    expect(created).toBeNull();
  });
});
