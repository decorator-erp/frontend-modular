import { TestBed } from '@angular/core/testing';
import { of } from 'rxjs';
import { ConfirmService, DrawerService, ModalService } from '@ds';
import { ToastService } from '@platform/feedback/toast.service';
import { PermissionsService } from '@platform/permissions';
import { DocumentFoldersService, ProjectDocumentsService } from '../../data/documents.service';
import { DocumentVersion, DocumentVersionsService } from '../../data/document-versions.service';
import { ProjectAccessStore } from '../../stores/project-access.store';
import { DocumentsTabComponent } from './documents-tab.component';
import { DocumentVersionsDialogComponent } from './document-versions-dialog.component';

const v = (id: string, root: string, version: number, isLocked = false): DocumentVersion => ({
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
  isLocked,
});

/** Sync F2: the project documents page shows one row per lineage and respects locks. */
describe('DocumentsTabComponent — versions (sync F2)', () => {
  let removed: string[];
  let toasts: string[];
  let opened: { component: unknown; data: unknown }[];
  let drawerData: { actions?: { label: string; run: () => void }[] } | null;

  function make() {
    removed = [];
    toasts = [];
    opened = [];
    drawerData = null;
    TestBed.configureTestingModule({
      imports: [DocumentsTabComponent],
      providers: [
        { provide: DocumentFoldersService, useValue: { getByProject: () => of([]) } },
        {
          provide: ProjectDocumentsService,
          useValue: {
            remove: (id: string) => {
              removed.push(id);
              return of(null);
            },
            download: () => of(new Blob()),
          },
        },
        {
          provide: DocumentVersionsService,
          useValue: {
            getByProject: () => of([v('a1', 'a1', 1), v('a2', 'a1', 2, true), v('b1', 'b1', 1)]),
          },
        },
        { provide: PermissionsService, useValue: { can: () => true } },
        { provide: ProjectAccessStore, useValue: { project: () => () => null } },
        { provide: ConfirmService, useValue: { open: async () => true } },
        {
          provide: ToastService,
          useValue: { show: (t: { message: string }) => toasts.push(t.message) },
        },
        {
          provide: DrawerService,
          useValue: {
            open: (_c: unknown, cfg: { data: typeof drawerData }) => (drawerData = cfg.data),
          },
        },
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
    const f = TestBed.createComponent(DocumentsTabComponent);
    f.componentRef.setInput('projectId', 'p1');
    f.detectChanges();
    return f.componentInstance;
  }

  it('lists the newest version of each lineage, labelled with its version and lock', () => {
    const c = make();
    expect(c.items().map((i) => [i.id, i.linkLabel])).toEqual([
      ['a2', 'v2 · Locked'],
      ['b1', null],
    ]);
  });

  it('refuses to delete a locked document, deletes an unlocked one', async () => {
    const c = make();
    await c.onDelete(c.items()[0]);
    expect(removed).toEqual([]);
    expect(toasts[0]).toContain('locked');
    await c.onDelete(c.items()[1]);
    expect(removed).toEqual(['b1']);
  });

  it('bulk delete skips locked documents', async () => {
    const c = make();
    await c.onBulkDelete(['a2', 'b1']);
    expect(removed).toEqual(['b1']);
  });

  it('the preview drawer offers "Versions and review", which opens the versions dialog', () => {
    const c = make();
    c.openPreview(c.items()[0]);
    expect(drawerData?.actions?.map((a) => a.label)).toEqual(['Versions and review']);
    drawerData!.actions![0].run();
    expect(opened[0].component).toBe(DocumentVersionsDialogComponent);
    expect(opened[0].data).toEqual({
      documentId: 'a2',
      projectId: 'p1',
      canUpload: true,
      canRequestReview: true,
    });
  });
});
