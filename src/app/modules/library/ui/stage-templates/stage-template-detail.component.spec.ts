import { TestBed } from '@angular/core/testing';
import { provideRouter } from '@angular/router';
import { of } from 'rxjs';
import { ConfirmService, ModalService } from '@ds';
import { DepartmentService } from '@modules/people';
import { ToastService } from '@platform/feedback/toast.service';
import { PermissionsService } from '@platform/permissions';
import { StageTemplatesService } from '../../data/stage-templates.service';
import { StageTemplateDetailComponent } from './stage-template-detail.component';
import { TemplateStructureDialogComponent } from './template-structure-dialog.component';

/** Sync F1: the template structure editor page. */
describe('StageTemplateDetailComponent (sync F1)', () => {
  let granted: boolean;
  let calls: string[];
  let confirmAnswer: boolean;
  let dialogs: { component: unknown; data: unknown }[];

  const api = {
    getById: () =>
      of({
        id: 't1',
        name: 'Fit-out',
        description: null,
        type: 'Custom',
        isDefault: false,
        isActive: true,
      }),
    stages: () =>
      of([
        {
          id: 's2',
          stageTemplateId: 't1',
          name: 'Execution',
          description: null,
          order: 2,
          weightPercent: 60,
          defaultFee: null,
          taskCount: 0,
        },
        {
          id: 's1',
          stageTemplateId: 't1',
          name: 'Design',
          description: null,
          order: 1,
          weightPercent: 40,
          defaultFee: 500,
          taskCount: 1,
        },
      ]),
    stageTasks: (stageId: string) =>
      of(
        stageId === 's1'
          ? [
              {
                id: 'k1',
                stageId: 's1',
                name: 'Survey',
                description: null,
                order: 1,
                weight: 2,
                departmentId: 'd1',
              },
            ]
          : [],
      ),
    subTasks: () =>
      of([
        {
          id: 'x1',
          stageTaskId: 'k1',
          title: 'Measure',
          description: null,
          order: 1,
          isRequired: true,
        },
      ]),
    stageDepartments: (stageId: string) => of(stageId === 's1' ? ['d1'] : []),
    addStageDepartment: (s: string, d: string) => {
      calls.push(`link ${s} ${d}`);
      return of(null);
    },
    removeStageDepartment: (s: string, d: string) => {
      calls.push(`unlink ${s} ${d}`);
      return of(null);
    },
    removeStage: (id: string) => {
      calls.push(`delete stage ${id}`);
      return of(null);
    },
    removeStageTask: (id: string) => {
      calls.push(`delete task ${id}`);
      return of(null);
    },
    removeSubTask: (id: string) => {
      calls.push(`delete sub ${id}`);
      return of(null);
    },
  };

  async function render() {
    calls = [];
    dialogs = [];
    TestBed.configureTestingModule({
      imports: [StageTemplateDetailComponent],
      providers: [
        provideRouter([]),
        { provide: StageTemplatesService, useValue: api },
        {
          provide: DepartmentService,
          useValue: {
            getAll: () =>
              of([
                { id: 'd1', name: 'Design dept' },
                { id: 'd2', name: 'Site dept' },
              ]),
          },
        },
        { provide: PermissionsService, useValue: { can: () => granted } },
        { provide: ConfirmService, useValue: { open: async () => confirmAnswer } },
        { provide: ToastService, useValue: { show: () => undefined } },
        {
          provide: ModalService,
          useValue: {
            open: (component: unknown, cfg: { data: unknown }) => {
              dialogs.push({ component, data: cfg.data });
              return { afterClosed: async () => false };
            },
          },
        },
      ],
    });
    const fixture = TestBed.createComponent(StageTemplateDetailComponent);
    fixture.componentRef.setInput('id', 't1');
    fixture.detectChanges();
    await fixture.whenStable();
    fixture.detectChanges();
    return fixture;
  }

  beforeEach(() => {
    granted = true;
    confirmAnswer = true;
  });

  it('shows the stages in order, each with its tasks, sub-tasks and linked departments', async () => {
    const f = await render();
    const el: HTMLElement = f.nativeElement;
    const stages = [...el.querySelectorAll('[data-stage]')].map((s) =>
      s.getAttribute('data-stage'),
    );
    expect(stages).toEqual(['s1', 's2']);
    const design = el.querySelector('[data-stage="s1"]')!;
    expect(design.querySelector('[data-task="k1"]')?.textContent).toContain('Survey');
    expect(design.querySelector('[data-sub="x1"]')?.textContent).toContain('Measure');
    expect(design.querySelector('[data-department="d1"]')?.textContent).toContain('Design dept');
  });

  it('hides every write control without stages.manage', async () => {
    granted = false;
    const f = await render();
    const el: HTMLElement = f.nativeElement;
    for (const sel of [
      '[data-add-stage]',
      '[data-edit-stage]',
      '[data-delete-stage]',
      '[data-add-task]',
      '[data-add-sub]',
      '[data-unlink]',
      '[data-link]',
    ]) {
      expect(el.querySelector(sel), sel).toBeNull();
    }
  });

  it('offers only unlinked departments and links the picked one', async () => {
    const f = await render();
    const c = f.componentInstance;
    const node = c.nodes().find((n) => n.stage.id === 's1')!;
    expect(c.departmentOptions(node).map((o) => o.value)).toEqual(['d2']);
    c.pick('s1', 'd2');
    c.linkDepartment('s1');
    expect(calls).toContain('link s1 d2');
  });

  it('unlinks a department', async () => {
    const f = await render();
    (f.nativeElement.querySelector('[data-stage="s1"] [data-unlink]') as HTMLButtonElement).click();
    expect(calls).toContain('unlink s1 d1');
  });

  it('deletes a stage only after the confirm', async () => {
    const f = await render();
    const c = f.componentInstance;
    confirmAnswer = false;
    await c.removeStage(c.nodes()[0].stage);
    expect(calls).toEqual([]);
    confirmAnswer = true;
    await c.removeStage(c.nodes()[0].stage);
    expect(calls).toEqual(['delete stage s1']);
  });

  it('opens the structure dialog for a new task with the stage as parent and the next order', async () => {
    const f = await render();
    const c = f.componentInstance;
    await c.openTask(c.nodes()[0]);
    expect(dialogs[0].component).toBe(TemplateStructureDialogComponent);
    expect(dialogs[0].data).toMatchObject({ kind: 'task', parentId: 's1', nextOrder: 2 });
  });
});
