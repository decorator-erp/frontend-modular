import { TestBed } from '@angular/core/testing';
import { of } from 'rxjs';
import { describe, expect, it, vi } from 'vitest';
import { PERA_MODAL_DATA, PeraModalRef } from '@ds';
import { ProjectDocumentsService } from '@modules/projects';
import { CrmArtifactService } from '../../data/crm-artifact.service';
import {
  ArtifactLinkDialogData,
  CrmArtifactLinkDialogComponent,
} from './artifact-link-dialog.component';

/** Sync F4c: link a project document (or a fresh upload) to a CRM subject. */
describe('CrmArtifactLinkDialogComponent (sync F4c)', () => {
  function make(data: Partial<ArtifactLinkDialogData> = {}) {
    const api = { link: vi.fn().mockReturnValue(of('a1')) };
    const docs = {
      getByProject: vi.fn().mockReturnValue(
        of([
          { id: 'd1', fileName: 'plan.pdf' },
          { id: 'd2', fileName: 'mood.jpg' },
        ]),
      ),
      upload: vi.fn().mockReturnValue(of('d9')),
    };
    const close = vi.fn();
    TestBed.configureTestingModule({
      imports: [CrmArtifactLinkDialogComponent],
      providers: [
        { provide: CrmArtifactService, useValue: api },
        { provide: ProjectDocumentsService, useValue: docs },
        { provide: PeraModalRef, useValue: { close } },
        {
          provide: PERA_MODAL_DATA,
          useValue: {
            subject: 'meeting',
            subjectId: 'm1',
            projectId: 'p1',
            linkedDocumentIds: ['d2'],
            ...data,
          },
        },
      ],
    });
    const f = TestBed.createComponent(CrmArtifactLinkDialogComponent);
    f.detectChanges();
    return { c: f.componentInstance, api, docs, close };
  }

  it("offers the project's documents not yet linked, and links the picked one", () => {
    const { c, api, close } = make();
    expect(c.options()).toEqual([{ value: 'd1', label: 'plan.pdf' }]);
    expect(c.ready()).toBe(false);
    c.documentId.set('d1');
    c.submit();
    expect(api.link).toHaveBeenCalledWith('meeting', 'm1', 'd1');
    expect(close).toHaveBeenCalledWith(true);
  });

  it('uploads a new file into the project, then links the new document', () => {
    const { c, api, docs } = make({ subject: 'requirement-item', subjectId: 'r1' });
    c.mode.set('upload');
    const file = new File(['x'], 'sketch.png');
    c.file.set(file);
    c.submit();
    expect(docs.upload).toHaveBeenCalledWith('p1', file);
    expect(api.link).toHaveBeenCalledWith('requirement-item', 'r1', 'd9');
  });
});
