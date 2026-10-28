import { TestBed } from '@angular/core/testing';
import { of } from 'rxjs';
import {
  GateConditionModalComponent,
  GateConditionModalData,
} from './gate-condition-modal.component';
import { TaskGateConditionService } from '../../data/task-gate-condition.service';
import { StageGateConditionService } from '../../data/stage-gate-condition.service';
import { ProjectTaskService } from '../../data/project-task.service';
import { ProjectStageService } from '../../data/project-stage.service';
import { ErrorHandlerService } from '@platform/http/error-handler.service';
import { PermissionsService } from '@platform/permissions';
import { PERM } from '@platform/permissions';
import { PERA_MODAL_DATA, PeraModalRef } from '@ds';
import type {
  CreateTaskGateConditionRequest,
  GateCondition,
  UpdateGateConditionRequest,
} from '../../model/project.model';

function gate(overrides: Partial<GateCondition> = {}): GateCondition {
  return {
    id: 'g1',
    ownerId: 't1',
    conditionType: 'Approval',
    trigger: 'Complete',
    referencedTaskId: null,
    referencedStageId: null,
    approvalType: 'ManagerApproval',
    label: 'Manager approval',
    isSatisfied: false,
    satisfiedById: null,
    satisfiedAt: null,
    satisfiedNote: null,
    ...overrides,
  };
}

describe('GateConditionModalComponent', () => {
  let created: CreateTaskGateConditionRequest | null;
  let updated: { id: string; req: UpdateGateConditionRequest } | null;
  let satisfied: string | null;
  let removed: string | null;
  let closedWith: unknown;

  const taskGates = {
    create: (req: CreateTaskGateConditionRequest) => {
      created = req;
      return of('g-new');
    },
    update: (id: string, req: UpdateGateConditionRequest) => {
      updated = { id, req };
      return of(undefined);
    },
    satisfy: (id: string) => {
      satisfied = id;
      return of(undefined);
    },
    remove: (id: string) => {
      removed = id;
      return of(undefined);
    },
  };
  const modalRef = {
    close: (r: unknown) => {
      closedWith = r;
    },
  };

  function setup(data: GateConditionModalData): void {
    created = null;
    updated = null;
    satisfied = null;
    removed = null;
    closedWith = undefined;
    TestBed.resetTestingModule();
    TestBed.configureTestingModule({
      imports: [GateConditionModalComponent],
      providers: [
        { provide: TaskGateConditionService, useValue: taskGates },
        {
          provide: StageGateConditionService,
          useValue: {
            create: () => of('s'),
            update: () => of(undefined),
            satisfy: () => of(undefined),
            remove: () => of(undefined),
          },
        },
        { provide: ProjectTaskService, useValue: { getByProject: () => of([]) } },
        { provide: ProjectStageService, useValue: { getByProject: () => of([]) } },
        { provide: ErrorHandlerService, useValue: { parse: () => ({}) } },
        { provide: PermissionsService, useValue: { can: () => true } },
        { provide: PeraModalRef, useValue: modalRef },
        { provide: PERA_MODAL_DATA, useValue: data },
      ],
    });
  }

  function make(data: GateConditionModalData): GateConditionModalComponent {
    setup(data);
    return TestBed.createComponent(GateConditionModalComponent).componentInstance;
  }

  const base = {
    ownerKind: 'task' as const,
    ownerId: 't1',
    ownerName: 'TASK · 5',
    projectId: 'p1',
    managePermission: PERM.stageTasks.manage,
  };

  it('maps the Review type option to ManualCheck on create (New mode)', () => {
    const c = make({ ...base, mode: 'new', gate: null });
    c.label.set('Drawings reviewed');
    c.uiType.set('review');
    c.save();
    expect(created?.conditionType).toBe('ManualCheck');
    expect(created?.label).toBe('Drawings reviewed');
    expect(created?.trigger).toBe('Complete');
    expect(closedWith).toBe(true);
  });

  it('maps Checklist to ManualCheck as well', () => {
    const c = make({ ...base, mode: 'new', gate: null });
    c.label.set('Checklist done');
    c.uiType.set('checklist');
    c.save();
    expect(created?.conditionType).toBe('ManualCheck');
  });

  it('New mode + status Satisfied creates then chains a satisfy on the new gate', () => {
    const c = make({ ...base, mode: 'new', gate: null });
    c.label.set('Already done');
    c.uiType.set('attachment');
    c.status.set('sat');
    c.save();
    expect(created?.conditionType).toBe('Attachment');
    expect(satisfied).toBe('g-new');
    expect(closedWith).toBe(true);
  });

  it('Edit mode dispatches a PUT update with the label and does not POST', () => {
    const c = make({ ...base, mode: 'edit', gate: gate({ label: 'Old label' }) });
    c.label.set('New label');
    c.save();
    expect(created).toBeNull();
    expect(updated?.id).toBe('g1');
    expect(updated?.req.label).toBe('New label');
    expect(closedWith).toBe(true);
  });

  it('Edit mode flipping status to Satisfied updates then satisfies', () => {
    const c = make({ ...base, mode: 'edit', gate: gate({ isSatisfied: false }) });
    c.status.set('sat');
    c.save();
    expect(updated?.id).toBe('g1');
    expect(satisfied).toBe('g1');
  });

  it('View mode Mark resolved calls /satisfy and closes changed', () => {
    const c = make({ ...base, mode: 'view', gate: gate({ isSatisfied: false }) });
    c.markResolved();
    expect(satisfied).toBe('g1');
    expect(closedWith).toBe(true);
  });

  it('View mode Delete calls DELETE and closes changed', () => {
    const c = make({ ...base, mode: 'view', gate: gate() });
    c.remove();
    expect(removed).toBe('g1');
    expect(closedWith).toBe(true);
  });

  it('titles reflect the mode', () => {
    expect(make({ ...base, mode: 'new', gate: null }).title()).toBe('Add gate condition');
    expect(make({ ...base, mode: 'view', gate: gate() }).title()).toBe('Gate condition');
    expect(make({ ...base, mode: 'edit', gate: gate() }).title()).toBe('Edit gate condition');
  });

  it('enterEdit switches a viewed gate into edit mode seeded from the gate', () => {
    const c = make({
      ...base,
      mode: 'view',
      gate: gate({ label: 'Manager approval', conditionType: 'Approval' }),
    });
    c.enterEdit();
    expect(c.mode()).toBe('edit');
    expect(c.label()).toBe('Manager approval');
    expect(c.uiType()).toBe('approval');
  });
});
