import { TestBed } from '@angular/core/testing';
import { provideHttpClient } from '@angular/common/http';
import { HttpTestingController, provideHttpClientTesting } from '@angular/common/http/testing';
import {
  DocumentVersion,
  DocumentVersionsService,
  latestPerLineage,
  lineageOf,
} from './document-versions.service';

const row = (o: Partial<Record<string, unknown>> = {}) => ({
  id: 'd2',
  projectId: 'p1',
  folderId: null,
  projectStageId: 's1',
  projectTaskId: null,
  fileName: 'plan-v2.pdf',
  contentType: 'application/pdf',
  fileSizeBytes: 2048,
  fileExtension: '.pdf',
  description: 'rev',
  uploadedById: 'e1',
  uploadedOnUtc: '2026-11-01T10:00:00Z',
  version: 2,
  rootDocumentId: 'd1',
  isLocked: false,
  ...o,
});

/** Sync F2: document versions, review requests, stage uploads and scoped folders. */
describe('DocumentVersionsService (sync F2)', () => {
  let service: DocumentVersionsService;
  let http: HttpTestingController;

  beforeEach(() => {
    TestBed.configureTestingModule({
      providers: [provideHttpClient(), provideHttpClientTesting()],
    });
    service = TestBed.inject(DocumentVersionsService);
    http = TestBed.inject(HttpTestingController);
  });

  afterEach(() => http.verify());

  const one = (method: string, suffix: string) =>
    http.expectOne((r) => r.method === method && r.url.endsWith(suffix));

  it('getById GETs /project-documents/{id} and maps the lineage pair + lock', () => {
    let d: DocumentVersion | undefined;
    service.getById('d2').subscribe((r) => (d = r));
    one('GET', '/project-documents/d2').flush(row({ isLocked: true }));
    expect(d).toEqual({
      id: 'd2',
      projectId: 'p1',
      folderId: null,
      projectStageId: 's1',
      projectTaskId: null,
      fileName: 'plan-v2.pdf',
      contentType: 'application/pdf',
      sizeBytes: 2048,
      description: 'rev',
      uploadedById: 'e1',
      uploadedOnUtc: '2026-11-01T10:00:00Z',
      version: 2,
      rootDocumentId: 'd1',
      isLocked: true,
    });
  });

  it('a row without the lineage fields reads as its own v1, unlocked', () => {
    let list: DocumentVersion[] = [];
    service.getByProject('p1').subscribe((r) => (list = r));
    one('GET', '/projects/p1/documents').flush([{ id: 'x', fileName: 'a.pdf' }]);
    expect(list[0]).toMatchObject({ id: 'x', version: 1, rootDocumentId: 'x', isLocked: false });
  });

  it('getByStage GETs /project-stages/{id}/documents', () => {
    service.getByStage('s1').subscribe();
    one('GET', '/project-stages/s1/documents').flush([row()]);
  });

  it('uploadRevision POSTs multipart `file` + description to /project-documents/{id}/revisions', () => {
    let id = '';
    const file = new File(['x'], 'plan-v3.pdf');
    service.uploadRevision('d2', file, 'Client comments').subscribe((r) => (id = r));
    const req = one('POST', '/project-documents/d2/revisions');
    const body = req.request.body as FormData;
    expect(body.get('file')).toBe(file);
    expect(body.get('description')).toBe('Client comments');
    req.flush({ documentId: 'd3' });
    expect(id).toBe('d3');
  });

  it('uploadRevision leaves out an empty description', () => {
    service.uploadRevision('d2', new File(['x'], 'a.pdf'), '  ').subscribe();
    const req = one('POST', '/project-documents/d2/revisions');
    expect((req.request.body as FormData).has('description')).toBe(false);
    req.flush({ documentId: 'd3' });
  });

  it('requestReview POSTs { approverEmployeeId } and reads { approvalId }', () => {
    let id = '';
    service.requestReview('d2', 'e9').subscribe((r) => (id = r));
    const req = one('POST', '/project-documents/d2/request-review');
    expect(req.request.body).toEqual({ approverEmployeeId: 'e9' });
    req.flush({ approvalId: 'a1' });
    expect(id).toBe('a1');
  });

  it('uploadToStage POSTs multipart to /project-stages/{id}/documents with an optional folder', () => {
    const file = new File(['x'], 'site.jpg');
    service.uploadToStage('s1', file, 'f1').subscribe();
    const req = one('POST', '/project-stages/s1/documents');
    const body = req.request.body as FormData;
    expect(body.get('file')).toBe(file);
    expect(body.get('folderId')).toBe('f1');
    req.flush({ documentId: 'd9' });
  });

  it('createStageFolder / createTaskFolder POST { name, parentFolderId } and read { folderId }', () => {
    let a = '';
    let b = '';
    service.createStageFolder('s1', 'Drawings').subscribe((r) => (a = r));
    const s = one('POST', '/project-stages/s1/document-folders');
    expect(s.request.body).toEqual({ name: 'Drawings', parentFolderId: null });
    s.flush({ folderId: 'f1' });
    service.createTaskFolder('t1', 'Photos', 'f1').subscribe((r) => (b = r));
    const t = one('POST', '/project-tasks/t1/document-folders');
    expect(t.request.body).toEqual({ name: 'Photos', parentFolderId: 'f1' });
    t.flush({ folderId: 'f2' });
    expect([a, b]).toEqual(['f1', 'f2']);
  });

  it('stageFolders GETs /project-stages/{id}/document-folders', () => {
    let names: string[] = [];
    service.stageFolders('s1').subscribe((r) => (names = r.map((f) => f.name)));
    one('GET', '/project-stages/s1/document-folders').flush([{ id: 'f1', name: 'Drawings' }]);
    expect(names).toEqual(['Drawings']);
  });
});

describe('lineage helpers (sync F2)', () => {
  const v = (id: string, root: string, version: number): DocumentVersion => ({
    id,
    projectId: 'p1',
    folderId: null,
    projectStageId: null,
    projectTaskId: null,
    fileName: `${id}.pdf`,
    contentType: '',
    sizeBytes: 1,
    description: null,
    uploadedById: '',
    uploadedOnUtc: '',
    version,
    rootDocumentId: root,
    isLocked: false,
  });

  it('latestPerLineage keeps only the highest version of each root, in list order', () => {
    const list = [v('b2', 'b1', 2), v('a1', 'a1', 1), v('b1', 'b1', 1), v('b3', 'b1', 3)];
    expect(latestPerLineage(list).map((d) => d.id)).toEqual(['b3', 'a1']);
  });

  it('lineageOf returns every version of the root, newest first', () => {
    const list = [v('b2', 'b1', 2), v('a1', 'a1', 1), v('b1', 'b1', 1)];
    expect(lineageOf(list, 'b1').map((d) => d.version)).toEqual([2, 1]);
  });
});
