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
import type { CreateGateConditionRequest, GateCondition } from '../../model/project.model';

function gate(overrides: Partial<GateCondition> = {}): GateCondition {
  return {
    id: 'g1',
    ownerId: 't1',
    conditionType: 'Approval',
    trigger: 'Complete',
    referencedTaskId: null,
    referencedStageId: null,
    referencedDocumentId: null,
    approvalType: 'ManagerApproval',
    label: 'Manager approval',
    status: 'Pending',
    isSatisfied: false,
    approvalId: null,
    satisfiedById: null,
    satisfiedAt: null,
    satisfiedNote: null,
    ...overrides,
  };
}

describe('GateConditionModalComponent', () => {
  let created: CreateGateConditionRequest | null;
  let recreated: {
    projectId: string;
    ownerId: string;
    id: string;
    req: CreateGateConditionRequest;
  } | null;
  let satisfied: string | null;
  let removed: string | null;
  let closedWith: unknown;

  const taskGates = {
    create: (_projectId: string, _ownerId: string, req: CreateGateConditionRequest) => {
      created = req;
      return of('g-new');
    },
    recreate: (projectId: string, ownerId: string, id: string, req: CreateGateConditionRequest) => {
      recreated = { projectId, ownerId, id, req };
      return of('g-re');
    },
    satisfy: (_projectId: string, id: string) => {
      satisfied = id;
      return of(undefined);
    },
    remove: (_projectId: string, id: string) => {
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
    recreated = null;
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
            recreate: () => of('s'),
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

  it('Edit mode with a new label deletes and re-creates the gate with its type and references (crmp A-2: no update route)', () => {
    const c = make({ ...base, mode: 'edit', gate: gate({ label: 'Old label' }) });
    c.label.set('New label');
    c.save();
    expect(created).toBeNull();
    expect(recreated).toEqual({
      projectId: 'p1',
      ownerId: 't1',
      id: 'g1',
      req: {
        conditionType: 'Approval',
        trigger: 'Complete',
        label: 'New label',
        referencedTaskId: null,
        referencedStageId: null,
        referencedDocumentId: null,
        approvalType: 'ManagerApproval',
      },
    });
    expect(closedWith).toBe(true);
  });

  it('R1-F4: a DocumentApproved gate keeps its document when re-created', () => {
    const c = make({
      ...base,
      mode: 'edit',
      gate: gate({
        conditionType: 'DocumentApproved',
        approvalType: null,
        referencedDocumentId: 'D1',
        label: 'Old',
      }),
    });
    c.label.set('New');
    c.save();
    expect(recreated?.req).toMatchObject({
      conditionType: 'DocumentApproved',
      referencedDocumentId: 'D1',
    });
  });

  it('Edit mode with an unchanged label flipping status to Satisfied only satisfies the same gate', () => {
    const c = make({ ...base, mode: 'edit', gate: gate({ isSatisfied: false }) });
    c.status.set('sat');
    c.save();
    expect(recreated).toBeNull();
    expect(satisfied).toBe('g1');
  });

  it('Edit mode with a new label and status Satisfied satisfies the re-created gate', () => {
    const c = make({ ...base, mode: 'edit', gate: gate({ label: 'Old', isSatisfied: false }) });
    c.label.set('New');
    c.status.set('sat');
    c.save();
    expect(recreated?.id).toBe('g1');
    expect(satisfied).toBe('g-re');
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
