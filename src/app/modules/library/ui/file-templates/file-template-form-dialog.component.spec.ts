import { TestBed } from '@angular/core/testing';
import { HttpErrorResponse } from '@angular/common/http';
import { of, throwError } from 'rxjs';
import { PERA_MODAL_DATA, PeraModalRef } from '@ds';
import { FileTemplatesService } from '../../data/file-templates.service';
import type { FileTemplate, FileTemplateInput } from '../../model/file-template.model';
import {
  FileTemplateFormDialogComponent,
  FileTemplateFormDialogData,
} from './file-template-form-dialog.component';

/** Sync F3: create / edit a file template. */
describe('FileTemplateFormDialogComponent (sync F3)', () => {
  let sent: unknown[];
  let closedWith: unknown;
  let fail: HttpErrorResponse | null;

  function make(data: FileTemplateFormDialogData | null) {
    sent = [];
    closedWith = undefined;
    TestBed.configureTestingModule({
      imports: [FileTemplateFormDialogComponent],
      providers: [
        {
          provide: FileTemplatesService,
          useValue: {
            create: (file: File, input: FileTemplateInput) => {
              sent.push({ op: 'create', file: file.name, input });
              return fail ? throwError(() => fail) : of('t9');
            },
            update: (id: string, input: FileTemplateInput) => {
              sent.push({ op: 'update', id, input });
              return of(null);
            },
          },
        },
        { provide: PeraModalRef, useValue: { close: (r: unknown) => (closedWith = r) } },
        { provide: PERA_MODAL_DATA, useValue: data },
      ],
    });
    return TestBed.createComponent(FileTemplateFormDialogComponent).componentInstance;
  }

  beforeEach(() => (fail = null));

  it('create needs a non-empty file and a name, then sends them with the category', () => {
    const c = make(null);
    c.submit();
    expect(sent).toEqual([]);
    expect(c.shown('file')).not.toBe('');
    c.file.set(new File(['x'], 'tb.dwg'));
    c.name.set(' Title block ');
    c.category.set('Cad');
    c.submit();
    expect(sent).toEqual([
      {
        op: 'create',
        file: 'tb.dwg',
        input: { name: 'Title block', category: 'Cad', description: null },
      },
    ]);
    expect(closedWith).toBe(true);
  });

  it('edit PUTs name, category and description, with no file', () => {
    const template: FileTemplate = {
      id: 't1',
      name: 'Old',
      description: 'd',
      category: 'Document',
      fileName: 'a.docx',
      contentType: '',
      sizeBytes: 1,
      isActive: true,
    };
    const c = make({ template });
    expect(c.isEdit).toBe(true);
    c.name.set('New');
    c.category.set('Spreadsheet');
    c.submit();
    expect(sent).toEqual([
      { op: 'update', id: 't1', input: { name: 'New', category: 'Spreadsheet', description: 'd' } },
    ]);
  });

  it('names a taken template name', () => {
    fail = new HttpErrorResponse({
      status: 409,
      error: { status: 409, errors: { 'file_templates.NameAlreadyExists': ['taken'] } },
    });
    const c = make(null);
    c.file.set(new File(['x'], 'a.pdf'));
    c.name.set('A');
    c.submit();
    expect(c.serverError()).toBe('A file template with this name already exists.');
    expect(closedWith).toBeUndefined();
  });
});
