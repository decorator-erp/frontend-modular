import { TestBed } from '@angular/core/testing';
import { of } from 'rxjs';
import { FilesFolderModalComponent, FilesFolderModalData } from './files-folder-modal.component';
import { TaskAttachmentService } from '../../data/task-attachment.service';
import { ErrorHandlerService } from '@platform/http/error-handler.service';
import { ToastService } from '@platform/feedback/toast.service';
import { ConfirmService, PERA_MODAL_DATA, PeraModalRef } from '@ds';
import type { AttTile } from './attachments-panel.component';

function tile(o: Partial<AttTile> = {}): AttTile {
  return {
    id: 'a1',
    name: 'plan.pdf',
    ext: 'pdf',
    sub: '2 KB · Jun 18',
    kind: 'pdf',
    badgeBg: 'bg-danger',
    badge: 'PDF',
    sizeBytes: 2048,
    uploadedOn: '2026-06-18T10:00:00Z',
    isImage: false,
    ...o,
  };
}

describe('FilesFolderModalComponent', () => {
  let downloaded: string[];
  let removed: string[];
  let confirmResult: boolean;
  let closedWith: unknown;

  const api = {
    download: (id: string) => {
      downloaded.push(id);
      return of(new Blob());
    },
    remove: (id: string) => {
      removed.push(id);
      return of(undefined);
    },
  };
  const modalRef = {
    close: (r: unknown) => {
      closedWith = r;
    },
  };

  beforeEach(() => {
    downloaded = [];
    removed = [];
    confirmResult = true;
    closedWith = undefined;
    // happy-dom may not implement object-URL helpers — stub them.
    URL.createObjectURL = () => 'blob:stub';
    URL.revokeObjectURL = () => undefined;
  });

  function make(data: FilesFolderModalData): FilesFolderModalComponent {
    TestBed.resetTestingModule();
    TestBed.configureTestingModule({
      imports: [FilesFolderModalComponent],
      providers: [
        { provide: TaskAttachmentService, useValue: api },
        { provide: ErrorHandlerService, useValue: { parse: () => ({}) } },
        { provide: ToastService, useValue: { show: () => undefined } },
        { provide: ConfirmService, useValue: { open: () => Promise.resolve(confirmResult) } },
        { provide: PeraModalRef, useValue: modalRef },
        { provide: PERA_MODAL_DATA, useValue: data },
      ],
    });
    return TestBed.createComponent(FilesFolderModalComponent).componentInstance;
  }

  const base = { taskId: 't1', folderName: 'Drawings', canManage: true };

  it('starts on the grid listing the folder files', () => {
    const c = make({ ...base, files: [tile(), tile({ id: 'a2', name: 'b.pdf' })] });
    expect(c.files().length).toBe(2);
    expect(c.selected()).toBeNull();
    expect(c.title()).toBe('Drawings');
  });

  it('opening a doc file switches to the viewer with no inline preview', () => {
    const c = make({ ...base, files: [tile()] });
    c.open(tile());
    expect(c.selected()?.name).toBe('plan.pdf');
    expect(c.selectedUrl()).toBeNull();
    expect(c.title()).toBe('plan.pdf');
  });

  it('opening an image file fetches a preview blob', () => {
    const img = tile({ id: 'img', name: 'photo.jpg', ext: 'jpg', kind: 'image', isImage: true });
    const c = make({ ...base, files: [img] });
    downloaded = []; // ignore the thumbnail prefetch from the effect
    c.open(img);
    expect(downloaded).toContain('img');
    expect(c.selectedUrl()).toBe('blob:stub');
  });

  it('back returns to the grid', () => {
    const c = make({ ...base, files: [tile()] });
    c.open(tile());
    c.back();
    expect(c.selected()).toBeNull();
  });

  it('download fetches the file blob', () => {
    const c = make({ ...base, files: [tile()] });
    c.download(tile());
    expect(downloaded).toContain('a1');
  });

  it('deleting a file removes it and closes with changed=true', async () => {
    const c = make({ ...base, files: [tile(), tile({ id: 'a2', name: 'b.pdf' })] });
    await c.remove(tile(), { stopPropagation: () => undefined } as unknown as Event);
    expect(removed).toContain('a1');
    expect(c.files().length).toBe(1);
    c.close();
    expect(closedWith).toBe(true);
  });

  it('closing without a deletion reports no change', () => {
    const c = make({ ...base, files: [tile()] });
    c.close();
    expect(closedWith).toBe(false);
  });
});
