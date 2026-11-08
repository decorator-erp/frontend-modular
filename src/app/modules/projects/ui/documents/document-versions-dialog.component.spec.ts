import { TestBed } from '@angular/core/testing';
import { of, throwError } from 'rxjs';
import { HttpErrorResponse } from '@angular/common/http';
import { PERA_MODAL_DATA, PeraModalRef } from '@ds';
import { EmployeeService } from '@modules/people';
import { ToastService } from '@platform/feedback/toast.service';
import { DocumentVersion, DocumentVersionsService } from '../../data/document-versions.service';
import {
  DocumentVersionsDialogComponent,
  DocumentVersionsDialogData,
} from './document-versions-dialog.component';

const v = (id: string, version: number, o: Partial<DocumentVersion> = {}): DocumentVersion => ({
  id,
  projectId: 'p1',
  folderId: null,
  projectStageId: null,
  projectTaskId: null,
  fileName: `plan-v${version}.pdf`,
  contentType: 'application/pdf',
  sizeBytes: 10,
  description: null,
  uploadedById: 'e1',
  uploadedOnUtc: '2026-11-01T10:00:00Z',
  version,
  rootDocumentId: 'd1',
  isLocked: false,
  ...o,
});

/** Sync F2(a-c): versions, upload a new version, request a review. */
describe('DocumentVersionsDialogComponent (sync F2)', () => {
  let calls: string[];
  let closedWith: unknown;
  let byId: Record<string, DocumentVersion>;
  let list: DocumentVersion[];
  let reviewError: HttpErrorResponse | null;

  async function make(data: Partial<DocumentVersionsDialogData> = {}) {
    calls = [];
    closedWith = undefined;
    TestBed.configureTestingModule({
      imports: [DocumentVersionsDialogComponent],
      providers: [
        {
          provide: DocumentVersionsService,
          useValue: {
            getById: (id: string) => of(byId[id]),
            getByProject: () => of(list),
            uploadRevision: (id: string, file: File, note: string) => {
              calls.push(`revision ${id} ${file.name} ${note}`);
              return of('d3');
            },
            requestReview: (id: string, approver: string) => {
              calls.push(`review ${id} ${approver}`);
              return reviewError ? throwError(() => reviewError) : of('ap1');
            },
          },
        },
        {
          provide: EmployeeService,
          useValue: { getAll: () => of({ items: [{ id: 'e9', fullName: 'Mona' }] }) },
        },
        { provide: ToastService, useValue: { show: () => undefined } },
        { provide: PeraModalRef, useValue: { close: (r: unknown) => (closedWith = r) } },
        {
          provide: PERA_MODAL_DATA,
          useValue: {
            documentId: 'd2',
            projectId: 'p1',
            canUpload: true,
            canRequestReview: true,
            ...data,
          },
        },
      ],
    });
    const f = TestBed.createComponent(DocumentVersionsDialogComponent);
    f.detectChanges();
    await f.whenStable();
    f.detectChanges();
    return f;
  }

  beforeEach(() => {
    reviewError = null;
    byId = { d2: v('d2', 2), d3: v('d3', 3) };
    list = [v('d2', 2), v('x', 1, { rootDocumentId: 'x' }), v('d1', 1)];
  });

  it('shows the lineage from the project list, newest first, and marks the current one', async () => {
    const f = await make();
    const el: HTMLElement = f.nativeElement;
    const versions = [...el.querySelectorAll('[data-version]')].map((r) =>
      r.getAttribute('data-version'),
    );
    expect(versions).toEqual(['2', '1']);
    expect(el.querySelector('[data-only-current]')).toBeNull();
  });

  it('says so when only the current version is known', async () => {
    list = [];
    const f = await make();
    expect(f.nativeElement.querySelectorAll('[data-version]').length).toBe(1);
    expect(f.nativeElement.querySelector('[data-only-current]')).not.toBeNull();
  });

  it('uploads a new version with the note and reloads on the new id', async () => {
    const f = await make();
    const c = f.componentInstance;
    c.file.set(new File(['x'], 'plan-v3.pdf'));
    c.note.set('Client comments');
    c.uploadVersion();
    expect(calls).toEqual(['revision d2 plan-v3.pdf Client comments']);
    await f.whenStable();
    expect(c.current()?.id).toBe('d3');
    c.close();
    expect(closedWith).toBe(true);
  });

  it('requests a review from the picked employee', async () => {
    const f = await make();
    const c = f.componentInstance;
    expect(c.employees()).toEqual([{ value: 'e9', label: 'Mona' }]);
    c.approverId.set('e9');
    c.requestReview();
    expect(calls).toEqual(['review d2 e9']);
    expect(c.requested()).toBe(true);
  });

  it('names a ReviewInProgress refusal in the catalog message', async () => {
    reviewError = new HttpErrorResponse({
      status: 409,
      error: { status: 409, errors: { 'project_documents.ReviewInProgress': ['open review'] } },
    });
    const f = await make();
    const c = f.componentInstance;
    c.approverId.set('e9');
    c.requestReview();
    expect(c.error()).toBe('This document already has an open review request.');
  });

  it('a locked document offers neither a new version nor a review', async () => {
    byId['d2'] = v('d2', 2, { isLocked: true });
    const f = await make();
    const el: HTMLElement = f.nativeElement;
    expect(el.querySelector('[data-locked]')).not.toBeNull();
    expect(el.querySelector('[data-new-version]')).toBeNull();
    expect(el.querySelector('[data-review]')).toBeNull();
  });

  it('an older version cannot be sent for review', async () => {
    byId['d1'] = v('d1', 1);
    const f = await make({ documentId: 'd1' });
    expect(f.nativeElement.querySelector('[data-review]')).toBeNull();
  });

  it('hides the actions without the rights', async () => {
    const f = await make({ canUpload: false, canRequestReview: false });
    expect(f.nativeElement.querySelector('[data-new-version]')).toBeNull();
    expect(f.nativeElement.querySelector('[data-review]')).toBeNull();
  });
});
