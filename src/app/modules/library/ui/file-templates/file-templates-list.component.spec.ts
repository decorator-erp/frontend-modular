import { TestBed } from '@angular/core/testing';
import { of } from 'rxjs';
import { ConfirmService, ModalService } from '@ds';
import { ToastService } from '@platform/feedback/toast.service';
import { PermissionsService } from '@platform/permissions';
import { FileTemplatesService } from '../../data/file-templates.service';
import type { FileTemplate } from '../../model/file-template.model';
import { FileTemplatesListComponent } from './file-templates-list.component';
import { FileTemplateFormDialogComponent } from './file-template-form-dialog.component';

const tpl = (id: string, isActive: boolean): FileTemplate => ({
  id,
  name: `T ${id}`,
  description: null,
  category: 'Cad',
  fileName: `${id}.dwg`,
  contentType: '',
  sizeBytes: 2048,
  isActive,
});

/** Sync F3: the file template library page. */
describe('FileTemplatesListComponent (sync F3)', () => {
  let granted: boolean;
  let calls: string[];
  let confirmAnswer: boolean;
  let opened: { component: unknown; data: unknown }[];

  function make() {
    calls = [];
    opened = [];
    TestBed.configureTestingModule({
      imports: [FileTemplatesListComponent],
      providers: [
        {
          provide: FileTemplatesService,
          useValue: {
            list: (c: string | null) => {
              calls.push(`list ${c}`);
              return of([tpl('a', true), tpl('b', false)]);
            },
            activate: (id: string) => (calls.push(`activate ${id}`), of(null)),
            deactivate: (id: string) => (calls.push(`deactivate ${id}`), of(null)),
            remove: (id: string) => (calls.push(`remove ${id}`), of(null)),
          },
        },
        { provide: PermissionsService, useValue: { can: () => granted } },
        { provide: ConfirmService, useValue: { open: async () => confirmAnswer } },
        { provide: ToastService, useValue: { show: () => undefined } },
        {
          provide: ModalService,
          useValue: {
            open: (component: unknown, cfg: { data: unknown }) => {
              opened.push({ component, data: cfg.data });
              return { afterClosed: async () => false };
            },
          },
        },
      ],
    });
    const f = TestBed.createComponent(FileTemplatesListComponent);
    f.detectChanges();
    return f;
  }

  beforeEach(() => {
    granted = true;
    confirmAnswer = true;
  });

  it('lists every template with its category and active state', () => {
    const f = make();
    const el: HTMLElement = f.nativeElement;
    expect(el.querySelectorAll('[data-template]').length).toBe(2);
    expect(el.querySelector('[data-template="a"]')?.textContent).toContain('CAD');
    expect(el.querySelector('[data-template="b"] [data-status]')?.textContent).toContain(
      'Inactive',
    );
    expect(el.querySelector('[data-count]')?.textContent).toContain('2 templates · 1 active');
  });

  it('filters by category through the API', () => {
    const f = make();
    f.componentInstance.setCategory('Image');
    expect(calls).toEqual(['list null', 'list Image']);
  });

  it('activates an inactive template and deactivates an active one', () => {
    const f = make();
    const c = f.componentInstance;
    c.toggle(c.templates()[0]);
    c.toggle(c.templates()[1]);
    expect(calls).toContain('deactivate a');
    expect(calls).toContain('activate b');
  });

  it('deletes only after the confirm', async () => {
    const f = make();
    const c = f.componentInstance;
    confirmAnswer = false;
    await c.remove(c.templates()[0]);
    expect(calls).not.toContain('remove a');
    confirmAnswer = true;
    await c.remove(c.templates()[0]);
    expect(calls).toContain('remove a');
  });

  it('New template and Edit open the form dialog', async () => {
    const f = make();
    (f.nativeElement.querySelector('[data-new]') as HTMLElement).click();
    (f.nativeElement.querySelector('[data-template="a"] [data-edit]') as HTMLElement).click();
    await f.whenStable();
    expect(opened.map((o) => o.component)).toEqual([
      FileTemplateFormDialogComponent,
      FileTemplateFormDialogComponent,
    ]);
    expect(opened[1].data).toEqual({ template: tpl('a', true) });
  });

  it('hides every write control without file_templates.manage', () => {
    granted = false;
    const el: HTMLElement = make().nativeElement;
    for (const sel of ['[data-new]', '[data-edit]', '[data-toggle]', '[data-delete]']) {
      expect(el.querySelector(sel), sel).toBeNull();
    }
  });
});
