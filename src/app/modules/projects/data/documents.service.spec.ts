import { TestBed } from '@angular/core/testing';
import { HttpTestingController, provideHttpClientTesting } from '@angular/common/http/testing';
import { provideHttpClient } from '@angular/common/http';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { environment } from '../../../../environments/environment';
import {
  DocumentFolder,
  DocumentFoldersService,
  ProjectDocument,
  ProjectDocumentsService,
} from './documents.service';

describe('documents.service', () => {
  let http: HttpTestingController;

  beforeEach(() => {
    TestBed.configureTestingModule({
      providers: [provideHttpClient(), provideHttpClientTesting()],
    });
    http = TestBed.inject(HttpTestingController);
  });

  afterEach(() => http.verify());

  describe('DocumentFoldersService.getByProject (008b #6)', () => {
    it('calls GET /api/projects/{projectId}/document-folders and maps DocumentFolderResponse', () => {
      let folders: DocumentFolder[] = [];
      TestBed.inject(DocumentFoldersService)
        .getByProject('p1')
        .subscribe((r) => (folders = r));

      const req = http.expectOne(`${environment.apiUrl}/projects/p1/document-folders`);
      expect(req.request.method).toBe('GET');
      req.flush([
        {
          id: 'f1',
          name: 'Requirement gathering',
          projectId: 'p1',
          parentFolderId: null,
          projectStageId: 's1',
          projectTaskId: null,
          isDefault: true,
        },
      ]);

      expect(folders).toEqual([
        {
          id: 'f1',
          projectId: 'p1',
          name: 'Requirement gathering',
          parentFolderId: null,
          projectStageId: 's1',
          projectTaskId: null,
          isDefault: true,
        },
      ]);
    });
  });

  describe('ProjectDocumentsService.getByFolder (008b #7)', () => {
    it('calls GET /api/document-folders/{folderId}/documents', () => {
      let count = -1;
      TestBed.inject(ProjectDocumentsService)
        .getByFolder('f1')
        .subscribe((r) => (count = r.length));

      const req = http.expectOne(`${environment.apiUrl}/document-folders/f1/documents`);
      expect(req.request.method).toBe('GET');
      req.flush([{ id: 'd1', projectId: 'p1', folderId: 'f1', fileName: 'plan.pdf' }]);

      expect(count).toBe(1);
    });
  });

  describe('ProjectDocumentsService.upload (008b #8)', () => {
    it('POSTs multipart to /api/projects/{projectId}/documents without a projectId part and emits documentId', () => {
      let id: unknown;
      const file = new File(['x'], 'plan.pdf', { type: 'application/pdf' });
      TestBed.inject(ProjectDocumentsService)
        .upload('p1', file, 'f1', 'Site plan')
        .subscribe((r) => (id = r));

      const req = http.expectOne({
        method: 'POST',
        url: `${environment.apiUrl}/projects/p1/documents`,
      });
      const form = req.request.body as FormData;
      expect(form.get('file')).toBeInstanceOf(File);
      expect(form.get('folderId')).toBe('f1');
      expect(form.get('description')).toBe('Site plan');
      expect(form.has('projectId')).toBe(false);
      req.flush({ documentId: 'd1' });

      expect(id).toBe('d1');
    });
  });

  describe('normalizeDocument (008b #9) — ProjectDocumentResponse field names', () => {
    function read(row: Record<string, unknown>): ProjectDocument {
      let docs: ProjectDocument[] = [];
      TestBed.inject(ProjectDocumentsService)
        .getByFolder('f1')
        .subscribe((r) => (docs = r));
      http.expectOne(`${environment.apiUrl}/document-folders/f1/documents`).flush([row]);
      return docs[0];
    }

    it('reads fileSizeBytes, uploadedById and uploadedOnUtc', () => {
      const doc = read({
        id: 'd',
        fileSizeBytes: 2048,
        uploadedById: 'e1',
        uploadedOnUtc: '2026-10-01T10:00:00Z',
      });
      expect(doc.sizeBytes).toBe(2048);
      expect(doc.uploadedByUserId).toBe('e1');
      expect(doc.createdAtUtc).toBe('2026-10-01T10:00:00Z');
    });

    it('still reads the old names as fallbacks', () => {
      const doc = read({
        id: 'd',
        sizeBytes: 512,
        uploadedByUserId: 'u1',
        createdAtUtc: '2026-09-01T10:00:00Z',
      });
      expect(doc.sizeBytes).toBe(512);
      expect(doc.uploadedByUserId).toBe('u1');
      expect(doc.createdAtUtc).toBe('2026-09-01T10:00:00Z');
    });
  });

  describe('crm-prod H6 — routes and bodies match Documents endpoints', () => {
    it('getByProject calls GET /api/projects/{projectId}/documents and maps ProjectDocumentResponse', () => {
      let docs: ProjectDocument[] = [];
      TestBed.inject(ProjectDocumentsService)
        .getByProject('p1')
        .subscribe((r) => (docs = r));

      const req = http.expectOne(`${environment.apiUrl}/projects/p1/documents`);
      expect(req.request.method).toBe('GET');
      req.flush([
        {
          id: 'd1',
          projectId: 'p1',
          folderId: 'f1',
          projectStageId: null,
          projectTaskId: null,
          fileName: 'plan.pdf',
          contentType: 'application/pdf',
          fileSizeBytes: 4096,
          fileExtension: '.pdf',
          description: 'Site plan',
          uploadedById: 'e1',
          uploadedOnUtc: '2026-10-01T10:00:00Z',
          version: 1,
          rootDocumentId: 'd1',
          isLocked: false,
        },
      ]);

      expect(docs).toEqual([
        {
          id: 'd1',
          projectId: 'p1',
          folderId: 'f1',
          fileName: 'plan.pdf',
          contentType: 'application/pdf',
          sizeBytes: 4096,
          description: 'Site plan',
          uploadedByUserId: 'e1',
          createdAtUtc: '2026-10-01T10:00:00Z',
        },
      ]);
    });

    it('document move sends PUT /api/project-documents/{id}/move with { folderId }', () => {
      TestBed.inject(ProjectDocumentsService).move('d1', 'f2').subscribe();

      const req = http.expectOne(`${environment.apiUrl}/project-documents/d1/move`);
      expect(req.request.method).toBe('PUT');
      expect(req.request.body).toEqual({ folderId: 'f2' });
      req.flush(null, { status: 204, statusText: 'No Content' });
    });

    it('folder move sends PUT /api/document-folders/{id}/move with { newParentFolderId }', () => {
      TestBed.inject(DocumentFoldersService).move('f1', null).subscribe();

      const req = http.expectOne(`${environment.apiUrl}/document-folders/f1/move`);
      expect(req.request.method).toBe('PUT');
      expect(req.request.body).toEqual({ newParentFolderId: null });
      req.flush(null, { status: 204, statusText: 'No Content' });
    });

    it('folder create POSTs /api/document-folders and reads { folderId } from the response', () => {
      let id: unknown;
      TestBed.inject(DocumentFoldersService)
        .create('p1', 'Drawings')
        .subscribe((r) => (id = r));

      const req = http.expectOne(`${environment.apiUrl}/document-folders`);
      expect(req.request.method).toBe('POST');
      expect(req.request.body).toEqual({ projectId: 'p1', name: 'Drawings', parentFolderId: null });
      req.flush({ folderId: 'f9' });

      expect(id).toBe('f9');
    });
  });
});
