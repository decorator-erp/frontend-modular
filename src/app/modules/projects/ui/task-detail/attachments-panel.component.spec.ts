import { TestBed } from '@angular/core/testing';
import { of } from 'rxjs';
import { vi } from 'vitest';
import { AttachmentsPanelComponent } from './attachments-panel.component';
import { TaskAttachmentService } from '../../data/task-attachment.service';
import { ErrorHandlerService } from '@platform/http/error-handler.service';
import { ToastService } from '@platform/feedback/toast.service';
import { PermissionsService } from '@platform/permissions';
import { PERM } from '@platform/permissions';
import { ModalService } from '@ds';
import { FilesFolderModalComponent } from './files-folder-modal.component';
import { DocumentationModalComponent } from './documentation-modal.component';
import type { TaskAttachment } from '../../model/project.model';
import { ProjectAccessStore } from '../../stores/project-access.store';

function att(o: Partial<TaskAttachment> = {}): TaskAttachment {
  return {
    id: 'a1',
    taskId: 't1',
    ruleId: null,
    fileName: 'plan.pdf',
    contentType: 'application/pdf',
    fileSizeBytes: 2048,
    uploadedById: 'u1',
    uploadedOnUtc: '2026-06-18T10:00:00Z',
    ...o,
  };
}

describe('AttachmentsPanelComponent (files browser)', () => {
  let openedComponent: unknown;
  let openedConfig: { data: { folderName?: string; files?: unknown[] } } | null;
  let canManage: boolean;
  let upload: ReturnType<typeof vi.fn>;
  let getByTask: ReturnType<typeof vi.fn>;

  const modal = {
    open: (component: unknown, config: { data: unknown }) => {
      openedComponent = component;
      openedConfig = config as typeof openedConfig;
      return { afterClosed: () => Promise.resolve(false) };
    },
  };

  function make(attachments: TaskAttachment[], opts: { canManage?: boolean } = {}) {
    openedComponent = null;
    openedConfig = null;
    canManage = opts.canManage ?? true;
    upload = vi.fn(() => of('d9'));
    getByTask = vi.fn(() => of(attachments));
    TestBed.configureTestingModule({
      imports: [AttachmentsPanelComponent],
      providers: [
        { provide: ProjectAccessStore, useValue: { project: () => () => null } },
        {
          provide: TaskAttachmentService,
          useValue: {
            getByTask,
            upload,
            download: () => of(new Blob()),
            remove: () => of(undefined),
          },
        },
        { provide: ErrorHandlerService, useValue: { parse: () => ({}) } },
        { provide: ToastService, useValue: { show: () => undefined } },
        { provide: ModalService, useValue: modal },
        {
          provide: PermissionsService,
          // UI-1: Upload needs documents.upload.
          useValue: { can: (p: string) => (p === PERM.documents.upload ? canManage : true) },
        },
      ],
    });
    const fixture = TestBed.createComponent(AttachmentsPanelComponent);
    fixture.componentRef.setInput('taskId', 't1');
    fixture.componentRef.setInput('projectId', 'p1');
    fixture.componentRef.setInput('stageName', 'Design Phase');
    fixture.detectChanges();
    return fixture;
  }

  it('renders only folders that actually contain files', () => {
    const fixture = make([att({ id: 'p', fileName: 'plan.pdf' })]);
    const text = fixture.nativeElement.textContent as string;
    expect(text).toContain('Drawings'); // holds the pdf
    expect(text).not.toContain('Schedules'); // empty bucket → hidden
    expect(text).not.toContain('References'); // empty bucket → hidden
    expect(fixture.componentInstance.visibleFolders().length).toBe(1);
  });

  it('shows the empty state and no folders when the task has no files', () => {
    const fixture = make([]);
    expect(fixture.componentInstance.visibleFolders().length).toBe(0);
    expect(fixture.nativeElement.textContent).toContain('This task has no files yet.');
  });

  it('groups attachments into folders by content kind', () => {
    const fixture = make([
      att({ id: 'p', fileName: 'plan.pdf' }),
      att({ id: 'i', fileName: 'photo.jpg' }),
    ]);
    const drawings = fixture.componentInstance.FOLDERS.find((f) => f.key === 'drawings')!;
    const refs = fixture.componentInstance.FOLDERS.find((f) => f.key === 'references')!;
    expect(fixture.componentInstance.count(drawings)).toBe(1);
    expect(fixture.componentInstance.count(refs)).toBe(1);
  });

  it("opening a folder pops the floating files window with that folder's files", () => {
    const fixture = make([
      att({ id: 'p', fileName: 'plan.pdf' }),
      att({ id: 'i', fileName: 'photo.jpg' }),
    ]);
    const drawings = fixture.componentInstance.FOLDERS.find((f) => f.key === 'drawings')!;
    fixture.componentInstance.openFolder(drawings);
    expect(openedComponent).toBe(FilesFolderModalComponent);
    expect(openedConfig?.data.folderName).toBe('Drawings');
    expect(openedConfig?.data.files?.length).toBe(1); // only the pdf, not the jpg
  });

  it('Documentation launches the project-documents modal', () => {
    const fixture = make([att()]);
    fixture.componentInstance.openDocumentation();
    expect(openedComponent).toBe(DocumentationModalComponent);
  });

  it('shows the Documentation action and the folder count in the header', () => {
    const fixture = make([att({ id: 'p', fileName: 'plan.pdf' })]);
    const text = fixture.nativeElement.textContent as string;
    expect(text).toContain('Documentation');
    expect(text).toContain('1 folder');
  });

  it('hides Upload without documents.upload', () => {
    const fixture = make([att()], { canManage: false });
    expect(fixture.nativeElement.textContent).not.toContain('Upload');
  });

  it('shows Upload with documents.upload', () => {
    const fixture = make([att()], { canManage: true });
    expect(fixture.nativeElement.textContent).toContain('Upload');
  });

  it('uploads a picked file through the Documents task route (TaskAttachmentService.upload) and reloads', () => {
    const fixture = make([att()], { canManage: true });
    const file = new File(['x'], 'site.png', { type: 'image/png' });
    const input = { files: [file], value: 'C:/fake/site.png' };
    fixture.componentInstance.onPick({ target: input } as unknown as Event);
    expect(upload).toHaveBeenCalledWith('t1', file);
    expect(getByTask).toHaveBeenCalledTimes(2);
    expect(input.value).toBe('');
  });
});
