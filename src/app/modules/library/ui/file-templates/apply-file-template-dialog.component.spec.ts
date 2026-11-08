import { TestBed } from '@angular/core/testing';
import { of } from 'rxjs';
import { PERA_MODAL_DATA, PeraModalRef } from '@ds';
import { ToastService } from '@platform/feedback/toast.service';
import { FileTemplatesService } from '../../data/file-templates.service';
import { ApplyFileTemplateDialogComponent } from './apply-file-template-dialog.component';

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
