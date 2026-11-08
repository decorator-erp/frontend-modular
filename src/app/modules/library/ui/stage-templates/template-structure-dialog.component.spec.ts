import { TestBed } from '@angular/core/testing';
import { of, throwError } from 'rxjs';
import { PERA_MODAL_DATA, PeraModalRef } from '@ds';
import { ErrorHandlerService } from '@platform/http/error-handler.service';
import { StageTemplatesService } from '../../data/stage-templates.service';
import {
  TemplateStructureDialogComponent,
  TemplateStructureDialogData,
} from './template-structure-dialog.component';

/** Sync F1: add / edit a template stage, stage task or sub-task. */
describe('TemplateStructureDialogComponent (sync F1)', () => {
  let sent: { op: string; id: string; body: unknown }[];
  let closedWith: unknown;
  let fail: boolean;

  const rec = (op: string) => (id: string, body: unknown) => {
    sent.push({ op, id, body });
    return fail ? throwError(() => new Error('x')) : of('new-id');
  };

  function make(data: TemplateStructureDialogData) {
    sent = [];
    closedWith = undefined;
    TestBed.resetTestingModule();
    TestBed.configureTestingModule({
      imports: [TemplateStructureDialogComponent],
      providers: [
        {
          provide: StageTemplatesService,
          useValue: {
            createStage: rec('createStage'),
            updateStage: rec('updateStage'),
            createStageTask: rec('createStageTask'),
            updateStageTask: rec('updateStageTask'),
            createSubTask: rec('createSubTask'),
            updateSubTask: rec('updateSubTask'),
          },
        },
        {
          provide: ErrorHandlerService,
          useValue: {
            parse: () => ({
              status: 400,
              generalMessage: 'Bad',
              fieldErrors: {},
              code: null,
              raw: null,
            }),
          },
        },
        { provide: PeraModalRef, useValue: { close: (r: unknown) => (closedWith = r) } },
        { provide: PERA_MODAL_DATA, useValue: data },
      ],
    });
    return TestBed.createComponent(TemplateStructureDialogComponent).componentInstance;
  }

  beforeEach(() => (fail = false));

  it('creates a stage with weightPercent and a default fee under the template', () => {
    const c = make({ kind: 'stage', parentId: 't1', nextOrder: 3 });
    expect(c.order()).toBe('3');
    c.name.set(' Design ');
    c.weight.set('40');
    c.fee.set('1500');
    c.submit();
    expect(sent).toEqual([
      {
        op: 'createStage',
        id: 't1',
        body: { name: 'Design', order: 3, weightPercent: 40, description: null, defaultFee: 1500 },
      },
    ]);
    expect(closedWith).toBe(true);
  });

  it('refuses a stage weight above 100 and sends nothing', () => {
    const c = make({ kind: 'stage', parentId: 't1', nextOrder: 1 });
    c.name.set('Design');
    c.weight.set('140');
    c.submit();
    expect(sent).toEqual([]);
    expect(c.shown('weight')).not.toBe('');
  });

  it('edits a task with `weight` and the picked department (empty → null)', () => {
    const c = make({
      kind: 'task',
      parentId: 's1',
      nextOrder: 2,
      departments: [{ id: 'd1', name: 'Design' }],
      item: {
        id: 'k1',
        stageId: 's1',
        name: 'Survey',
        description: 'x',
        order: 1,
        weight: 2,
        departmentId: 'd1',
      },
    });
    expect(c.departmentId()).toBe('d1');
    c.weight.set('3.5');
    c.departmentId.set('');
    c.submit();
    expect(sent).toEqual([
      {
        op: 'updateStageTask',
        id: 'k1',
        body: { name: 'Survey', order: 1, weight: 3.5, description: 'x', departmentId: null },
      },
    ]);
  });

  it('creates a sub-task with title and isRequired under the task', () => {
    const c = make({ kind: 'subTask', parentId: 'k1', nextOrder: 1 });
    c.name.set('Measure');
    c.isRequired.set(false);
    c.submit();
    expect(sent).toEqual([
      {
        op: 'createSubTask',
        id: 'k1',
        body: { title: 'Measure', order: 1, isRequired: false, description: null },
      },
    ]);
  });

  it('keeps the dialog open and shows the refusal when the save fails', () => {
    fail = true;
    const c = make({ kind: 'subTask', parentId: 'k1', nextOrder: 1 });
    c.name.set('Measure');
    c.submit();
    expect(closedWith).toBeUndefined();
    expect(c.serverError()).toBeTruthy();
  });
});
