import { TestBed } from '@angular/core/testing';
import { HttpTestingController, provideHttpClientTesting } from '@angular/common/http/testing';
import { provideHttpClient } from '@angular/common/http';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { environment } from '../../../../environments/environment';
import { TaskAttachmentService } from './task-attachment.service';

/** crmp A-2: `/task-attachments` is REMOVED (gap table P-88..93) — the Documents routes serve the files. */
describe('TaskAttachmentService (crmp A-2)', () => {
  let service: TaskAttachmentService;
  let http: HttpTestingController;
  const api = environment.apiUrl;

  beforeEach(() => {
    TestBed.configureTestingModule({
      providers: [provideHttpClient(), provideHttpClientTesting()],
    });
    service = TestBed.inject(TaskAttachmentService);
    http = TestBed.inject(HttpTestingController);
  });

  afterEach(() => http.verify());

  it('lists a task’s files on GET /project-tasks/{id}/documents and maps ProjectDocumentResponse (DocumentEndpoints.cs:87)', () => {
    let task = '';
    service.getByTask('T1').subscribe((l) => (task = `${l[0]?.taskId}:${l[0]?.fileName}`));
    http.expectOne(`${api}/project-tasks/T1/documents`).flush([
      {
        id: 'D1',
        projectId: 'P1',
        projectTaskId: 'T1',
        fileName: 'a.pdf',
        contentType: 'application/pdf',
        fileSizeBytes: 3,
      },
    ]);
    expect(task).toBe('T1:a.pdf');
  });

  it('lists stage and project files on the Documents routes (DocumentEndpoints.cs:77,57)', () => {
    service.getByStage('S1').subscribe();
    http.expectOne(`${api}/project-stages/S1/documents`).flush([]);
    service.getByProject('P1').subscribe();
    http.expectOne(`${api}/projects/P1/documents`).flush([]);
  });

  it('uploads multipart to POST /project-tasks/{id}/documents and reads documentId (DocumentUploadEndpoints.cs:68)', () => {
    let id = '';
    service.upload('T1', new File(['x'], 'x.txt'), { description: 'd' }).subscribe((v) => (id = v));
    const r = http.expectOne(`${api}/project-tasks/T1/documents`);
    expect(r.request.method).toBe('POST');
    const body = r.request.body as FormData;
    expect(body.get('description')).toBe('d');
    expect(body.has('taskId')).toBe(false);
    r.flush({ documentId: 'D9' });
    expect(id).toBe('D9');
  });

  it('downloads and deletes on /project-documents/{id} (DocumentDownloadEndpoints.cs:21, DocumentEndpoints.cs:39)', () => {
    service.download('D1').subscribe();
    expect(http.expectOne(`${api}/project-documents/D1/download`).request.responseType).toBe(
      'blob',
    );
    service.remove('D1').subscribe();
    expect(http.expectOne(`${api}/project-documents/D1`).request.method).toBe('DELETE');
  });
});
