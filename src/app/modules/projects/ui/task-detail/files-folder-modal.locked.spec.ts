import { TestBed } from '@angular/core/testing';
import { of } from 'rxjs';
import { describe, expect, it } from 'vitest';
import { ConfirmService, PERA_MODAL_DATA, PeraModalRef } from '@ds';
import { ErrorHandlerService } from '@platform/http/error-handler.service';
import { ToastService } from '@platform/feedback/toast.service';
import { TaskAttachmentService } from '../../data/task-attachment.service';
import { FilesFolderModalComponent, FilesFolderModalData } from './files-folder-modal.component';
import type { AttTile } from './attachments-panel.component';

function tile(o: Partial<AttTile>): AttTile {
  return {
    id: 'a1',
    name: 'plan.pdf',
    ext: 'pdf',
    sub: '2 KB',
    kind: 'pdf',
    badgeBg: 'bg-danger',
    badge: 'PDF',
    sizeBytes: 2048,
    uploadedOn: null,
    isImage: false,
    ...o,
  };
}

/** Sync W2-3: a locked document shows a lock and no delete; a later revision shows `v{n}`. */
describe('FilesFolderModalComponent — locked documents and versions (sync W2-3)', () => {
  it('replaces delete with a lock on a locked tile and tags revisions above 1', () => {
    const data: FilesFolderModalData = {
      taskId: 't1',
      folderName: 'Drawings',
      canDelete: true,
      files: [
        tile({ id: 'open', name: 'a.pdf' }),
        tile({ id: 'locked', name: 'b.pdf', locked: true, version: 3 }),
      ],
    };
    TestBed.configureTestingModule({
      imports: [FilesFolderModalComponent],
      providers: [
        { provide: TaskAttachmentService, useValue: { download: () => of(new Blob()) } },
        { provide: ErrorHandlerService, useValue: { parse: () => ({}) } },
        { provide: ToastService, useValue: { show: () => undefined } },
        { provide: ConfirmService, useValue: { open: () => Promise.resolve(false) } },
        { provide: PeraModalRef, useValue: { close: () => undefined } },
        { provide: PERA_MODAL_DATA, useValue: data },
      ],
    });
    const fixture = TestBed.createComponent(FilesFolderModalComponent);
    fixture.detectChanges();
    const el = fixture.nativeElement as HTMLElement;
    expect(el.querySelector('[aria-label="Delete a.pdf"]')).not.toBeNull();
    expect(el.querySelector('[aria-label="Delete b.pdf"]')).toBeNull();
    expect(el.querySelectorAll('[data-locked]').length).toBe(1);
    expect(
      Array.from(el.querySelectorAll('[data-version]')).map((n) => n.textContent?.trim()),
    ).toEqual(['v3']);
  });
});
