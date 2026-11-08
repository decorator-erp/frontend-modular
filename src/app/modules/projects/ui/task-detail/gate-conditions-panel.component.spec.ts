import { TestBed } from '@angular/core/testing';
import { of } from 'rxjs';
import { GateConditionsPanelComponent } from './gate-conditions-panel.component';
import { TaskGateConditionService } from '../../data/task-gate-condition.service';
import { StageGateConditionService } from '../../data/stage-gate-condition.service';
import { ModalService } from '@ds';
import type { GateCondition } from '../../model/project.model';

function gate(o: Partial<GateCondition> = {}): GateCondition {
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
    ...o,
  };
}

describe('GateConditionsPanelComponent', () => {
  let opened: { mode?: string } | null;
  let getByTaskCalls: number;
  let closeResult: boolean;

  const modal = {
    open: (_c: unknown, cfg: { data: { mode: string } }) => {
      opened = cfg.data;
      return { afterClosed: () => Promise.resolve(closeResult) };
    },
  };

  function make(gates: GateCondition[]) {
    opened = null;
    getByTaskCalls = 0;
    TestBed.configureTestingModule({
      imports: [GateConditionsPanelComponent],
      providers: [
        {
          provide: TaskGateConditionService,
          useValue: {
            getByTask: () => {
              getByTaskCalls++;
              return of(gates);
            },
          },
        },
        { provide: StageGateConditionService, useValue: { getByStage: () => of([]) } },
        { provide: ModalService, useValue: modal },
      ],
    });
    const fixture = TestBed.createComponent(GateConditionsPanelComponent);
    fixture.componentRef.setInput('ownerKind', 'task');
    fixture.componentRef.setInput('ownerId', 't1');
    fixture.componentRef.setInput('ownerName', 'TASK · 5');
    fixture.componentRef.setInput('projectId', 'p1');
    fixture.detectChanges();
    return fixture;
  }

  it('renders one clickable row per gate', () => {
    const fixture = make([
      gate(),
      gate({ id: 'g2', label: 'Concept sign-off', isSatisfied: true }),
    ]);
    const rows = fixture.nativeElement.querySelectorAll('[role="button"]');
    expect(rows.length).toBe(2);
  });

  it('openNew opens the DMS Forms gate dialog in create mode', async () => {
    closeResult = false;
    const fixture = make([]);
    await fixture.componentInstance.openNew();
    expect(opened?.mode).toBe('create');
  });

  it('openView opens the modal in View mode', async () => {
    closeResult = false;
    const fixture = make([gate()]);
    await fixture.componentInstance.openView(gate());
    expect(opened?.mode).toBe('view');
  });

  it('reloads and emits changed when the modal reports a mutation', async () => {
    closeResult = true;
    const fixture = make([gate()]);
    let changed = 0;
    fixture.componentInstance.changed.subscribe(() => changed++);
    const before = getByTaskCalls; // 1 from ngOnInit
    await fixture.componentInstance.openNew();
    expect(getByTaskCalls).toBe(before + 1);
    expect(changed).toBe(1);
  });

  it('does not reload when the modal is dismissed without changes', async () => {
    closeResult = false;
    const fixture = make([gate()]);
    const before = getByTaskCalls;
    await fixture.componentInstance.openView(gate());
    expect(getByTaskCalls).toBe(before);
  });

  it('uses the stage-tasks manage permission for task owners', () => {
    const fixture = make([]);
    expect(fixture.componentInstance.managePermission()).toBe('stage_tasks.manage');
  });
});
