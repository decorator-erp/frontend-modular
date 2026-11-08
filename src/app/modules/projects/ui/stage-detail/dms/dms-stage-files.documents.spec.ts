import { TestBed } from '@angular/core/testing';
import { of } from 'rxjs';
import { ModalService } from '@ds';
import { PermissionsService } from '@platform/permissions';
import { DmsStageFilesComponent } from './dms-stage-files.component';
import { TaskAttachmentService } from '../../../data/task-attachment.service';
import { DocumentVersion, DocumentVersionsService } from '../../../data/document-versions.service';
import { ProjectAccessStore } from '../../../stores/project-access.store';
import { DocumentVersionsDialogComponent } from '../../documents/document-versions-dialog.component';
import { StageUploadDialogComponent } from '../../documents/stage-upload-dialog.component';
import { ScopedFolderDialogComponent } from '../../documents/scoped-folder-dialog.component';

const v = (id: string, root: string, version: number, isLocked = false): DocumentVersion => ({
  id,
  projectId: 'p1',
  folderId: null,
  projectStageId: 's1',
  projectTaskId: null,
  fileName: `${root}.pdf`,
  contentType: 'application/pdf',
  sizeBytes: 10,
  description: null,
  uploadedById: 'e1',
  uploadedOnUtc: '2026-11-01T10:00:00Z',
  version,
  rootDocumentId: root,
  isLocked,
});

/** Sync F2(d,e): stage upload, stage folder, and the stage's documents with their versions. */
describe('DmsStageFilesComponent — stage documents (sync F2)', () => {
  let granted: string[];
  let opened: { component: unknown; data: unknown }[];

  function make(versions: DocumentVersion[]) {
    opened = [];
    TestBed.configureTestingModule({
      imports: [DmsStageFilesComponent],
      providers: [
        { provide: TaskAttachmentService, useValue: { getByStage: () => of([]) } },
        { provide: DocumentVersionsService, useValue: { getByStage: () => of(versions) } },
        {
          provide: ModalService,
          useValue: {
            open: (component: unknown, cfg: { data: unknown }) => {
              opened.push({ component, data: cfg.data });
              return { afterClosed: () => Promise.resolve(undefined) };
            },
          },
        },
        { provide: PermissionsService, useValue: { can: (p: string) => granted.includes(p) } },
        { provide: ProjectAccessStore, useValue: { project: () => () => null } },
      ],
    });
    const f = TestBed.createComponent(DmsStageFilesComponent);
    f.componentRef.setInput('stageId', 's1');
    f.componentRef.setInput('projectId', 'p1');
    f.detectChanges();
    return f;
  }

  it('lists the newest version of each stage document, with its lock', () => {
    granted = ['documents.upload'];
    const f = make([v('a1', 'a1', 1), v('a2', 'a1', 2, true), v('b1', 'b1', 1)]);
    const el: HTMLElement = f.nativeElement;
    const rows = [...el.querySelectorAll('[data-doc]')].map((r) => r.getAttribute('data-doc'));
    expect(rows).toEqual(['a2', 'b1']);
    expect(el.querySelector('[data-doc="a2"] [data-doc-locked]')).not.toBeNull();
    expect(el.querySelector('[data-doc="b1"] [data-doc-locked]')).toBeNull();
  });

  it('Upload and New folder need documents.upload', () => {
    granted = [];
    const f = make([]);
    expect(f.nativeElement.querySelector('[data-stage-upload]')).toBeNull();
    expect(f.nativeElement.querySelector('[data-stage-folder]')).toBeNull();
  });

  it('Upload opens the stage upload dialog; New folder opens a stage-scoped folder dialog', () => {
    granted = ['documents.upload'];
    const f = make([]);
    (f.nativeElement.querySelector('[data-stage-upload]') as HTMLButtonElement).click();
    (f.nativeElement.querySelector('[data-stage-folder]') as HTMLButtonElement).click();
    expect(opened[0]).toEqual({ component: StageUploadDialogComponent, data: { stageId: 's1' } });
    expect(opened[1]).toEqual({
      component: ScopedFolderDialogComponent,
      data: { scope: 'stage', scopeId: 's1' },
    });
  });

  it('Versions opens the versions dialog with the caller rights', () => {
    granted = ['documents.upload'];
    const f = make([v('b1', 'b1', 1)]);
    (f.nativeElement.querySelector('[data-doc-versions]') as HTMLButtonElement).click();
    expect(opened[0]).toEqual({
      component: DocumentVersionsDialogComponent,
      data: { documentId: 'b1', projectId: 'p1', canUpload: true, canRequestReview: false },
    });
  });
});
