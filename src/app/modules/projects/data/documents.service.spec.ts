import { TestBed } from '@angular/core/testing';
import { HttpTestingController, provideHttpClientTesting } from '@angular/common/http/testing';
import { provideHttpClient } from '@angular/common/http';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { environment } from '../../../../environments/environment';
import {
  DocumentFolder,
  DocumentFoldersService,
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
});
