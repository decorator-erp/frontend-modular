import { TestBed } from '@angular/core/testing';
import { provideHttpClient } from '@angular/common/http';
import { HttpTestingController, provideHttpClientTesting } from '@angular/common/http/testing';
import { FileTemplatesService } from './file-templates.service';
import type { FileTemplate } from '../model/file-template.model';

/** Sync F3: dms FileTemplateEndpoints.cs + DocumentUploadEndpoints.cs:83. */
describe('FileTemplatesService (sync F3)', () => {
  let service: FileTemplatesService;
  let http: HttpTestingController;

  beforeEach(() => {
    TestBed.configureTestingModule({
      providers: [provideHttpClient(), provideHttpClientTesting()],
    });
    service = TestBed.inject(FileTemplatesService);
    http = TestBed.inject(HttpTestingController);
  });
  afterEach(() => http.verify());

  const one = (method: string, suffix: string) =>
    http.expectOne((r) => r.method === method && r.url.split('?')[0].endsWith(suffix));

  it('list GETs /file-templates, sends the category filter, maps FileTemplateResponse', () => {
    let list: FileTemplate[] = [];
    service.list('Cad').subscribe((r) => (list = r));
    const req = one('GET', '/file-templates');
    expect(req.request.params.get('category')).toBe('Cad');
    req.flush([
      {
        id: 't1',
        name: 'Title block',
        description: null,
        category: 'Cad',
        fileName: 'tb.dwg',
        contentType: 'application/acad',
        fileSizeBytes: 4096,
        isActive: false,
      },
    ]);
    expect(list).toEqual([
      {
        id: 't1',
        name: 'Title block',
        description: null,
        category: 'Cad',
        fileName: 'tb.dwg',
        contentType: 'application/acad',
        sizeBytes: 4096,
        isActive: false,
      },
    ]);
  });

  it('list without a filter sends no params; an unknown category reads as Other', () => {
    let list: FileTemplate[] = [];
    service.list().subscribe((r) => (list = r));
    const req = one('GET', '/file-templates');
    expect(req.request.params.keys()).toEqual([]);
    req.flush([{ id: 'x', category: 'Mystery' }]);
    expect(list[0].category).toBe('Other');
  });

  it('getById GETs /file-templates/{id}', () => {
    service.getById('t1').subscribe();
    one('GET', '/file-templates/t1').flush({ id: 't1' });
  });

  it('create POSTs multipart file, name, category, description and reads { fileTemplateId }', () => {
    let id = '';
    const file = new File(['x'], 'tb.dwg');
    service
      .create(file, { name: 'Title block', category: 'Cad', description: 'A1 sheet' })
      .subscribe((r) => (id = r));
    const req = one('POST', '/file-templates');
    const body = req.request.body as FormData;
    expect(body.get('file')).toBe(file);
    expect(body.get('name')).toBe('Title block');
    expect(body.get('category')).toBe('Cad');
    expect(body.get('description')).toBe('A1 sheet');
    req.flush({ fileTemplateId: 't9' });
    expect(id).toBe('t9');
  });

  it('create leaves out a null description', () => {
    service
      .create(new File(['x'], 'a.pdf'), { name: 'A', category: 'Document', description: null })
      .subscribe();
    const req = one('POST', '/file-templates');
    expect((req.request.body as FormData).has('description')).toBe(false);
    req.flush({ fileTemplateId: 't9' });
  });

  it('update PUTs { name, category, description }', () => {
    service.update('t1', { name: 'B', category: 'Image', description: null }).subscribe();
    const req = one('PUT', '/file-templates/t1');
    expect(req.request.body).toEqual({ name: 'B', category: 'Image', description: null });
    req.flush(null);
  });

  it('remove DELETEs; activate / deactivate POST their routes', () => {
    service.remove('t1').subscribe();
    one('DELETE', '/file-templates/t1').flush(null);
    service.activate('t1').subscribe();
    one('POST', '/file-templates/t1/activate').flush(null);
    service.deactivate('t1').subscribe();
    one('POST', '/file-templates/t1/deactivate').flush(null);
  });

  it('applyToTask POSTs /project-tasks/{taskId}/apply-template/{templateId} and reads { documentId }', () => {
    let id = '';
    service.applyToTask('k1', 't1').subscribe((r) => (id = r));
    one('POST', '/project-tasks/k1/apply-template/t1').flush({ documentId: 'd1' });
    expect(id).toBe('d1');
  });
});
