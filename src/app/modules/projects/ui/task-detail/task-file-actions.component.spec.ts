import { TestBed } from '@angular/core/testing';
import { of } from 'rxjs';
import { ModalService, PERA_MODAL_DATA, PeraModalRef } from '@ds';
import { FileTemplatesService } from '@modules/library';
import { ToastService } from '@platform/feedback/toast.service';
import { PermissionsService } from '@platform/permissions';
import { ProjectAccessStore } from '../../stores/project-access.store';
import { ScopedFolderDialogComponent } from '../documents/scoped-folder-dialog.component';
import { ApplyFileTemplateDialogComponent } from './apply-file-template-dialog.component';
import { TaskFileActionsComponent } from './task-file-actions.component';

/** Sync F3 + F2(e): the task page's Apply template and New folder actions. */
describe('TaskFileActionsComponent (sync F3)', () => {
  let granted: string[];
  let opened: { component: unknown; data: unknown }[];
  let closeWith: unknown;

  function make() {
    opened = [];
    TestBed.configureTestingModule({
      imports: [TaskFileActionsComponent],
      providers: [
        {
          provide: ModalService,
          useValue: {
            open: (component: unknown, cfg: { data: unknown }) => {
              opened.push({ component, data: cfg.data });
              return { afterClosed: async () => closeWith };
            },
          },
        },
        { provide: PermissionsService, useValue: { can: (p: string) => granted.includes(p) } },
        { provide: ProjectAccessStore, useValue: { project: () => () => null } },
      ],
    });
    const f = TestBed.createComponent(TaskFileActionsComponent);
    f.componentRef.setInput('taskId', 'k1');
    f.componentRef.setInput('projectId', 'p1');
    f.detectChanges();
    return f;
  }

  it('shows nothing without documents.upload', () => {
    granted = [];
    expect(make().nativeElement.querySelector('[data-task-file-actions]')).toBeNull();
  });

  it('Apply template opens the picker for the task and reports a change', async () => {
    granted = ['documents.upload'];
    closeWith = true;
    const f = make();
    let changed = 0;
    f.componentInstance.changed.subscribe(() => changed++);
    await f.componentInstance.applyTemplate();
    expect(opened[0]).toEqual({
      component: ApplyFileTemplateDialogComponent,
      data: { taskId: 'k1' },
    });
    expect(changed).toBe(1);
  });

  it('New folder opens a task-scoped folder dialog; a cancel reports nothing', async () => {
    granted = ['documents.upload'];
    closeWith = undefined;
    const f = make();
    let changed = 0;
    f.componentInstance.changed.subscribe(() => changed++);
    await f.componentInstance.newFolder();
    expect(opened[0]).toEqual({
      component: ScopedFolderDialogComponent,
      data: { scope: 'task', scopeId: 'k1' },
    });
    expect(changed).toBe(0);
  });
});

describe('ApplyFileTemplateDialogComponent (sync F3)', () => {
  it('offers only active templates and applies the picked one to the task', () => {
    const applied: string[] = [];
    let closed: unknown;
    TestBed.configureTestingModule({
      imports: [ApplyFileTemplateDialogComponent],
      providers: [
        {
          provide: FileTemplatesService,
          useValue: {
            list: () =>
              of([
                { id: 'a', name: 'Title block', category: 'Cad', isActive: true },
                { id: 'b', name: 'Old', category: 'Document', isActive: false },
              ]),
            applyToTask: (taskId: string, id: string) => {
              applied.push(`${taskId} ${id}`);
              return of('d1');
            },
          },
        },
        { provide: ToastService, useValue: { show: () => undefined } },
        { provide: PeraModalRef, useValue: { close: (r: unknown) => (closed = r) } },
        { provide: PERA_MODAL_DATA, useValue: { taskId: 'k1' } },
      ],
    });
    const f = TestBed.createComponent(ApplyFileTemplateDialogComponent);
    f.detectChanges();
    const c = f.componentInstance;
    expect(c.options()).toEqual([{ value: 'a', label: 'Title block · CAD' }]);
    c.templateId.set('a');
    c.submit();
    expect(applied).toEqual(['k1 a']);
    expect(closed).toBe(true);
  });
});
