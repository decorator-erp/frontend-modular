import { TestBed } from '@angular/core/testing';
import { of } from 'rxjs';
import { DmsStageFilesComponent } from './dms-stage-files.component';
import { TaskAttachmentService } from '../../../data/task-attachment.service';
import { PermissionsService } from '@platform/permissions';
import { ModalService } from '@ds';
import { FilesFolderModalComponent } from '../../task-detail/files-folder-modal.component';
import { DocumentationModalComponent } from '../../task-detail/documentation-modal.component';
import type { TaskAttachment } from '../../../model/project.model';

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

describe('DmsStageFilesComponent', () => {
  let opened: {
    component: unknown;
    data: { folderName?: string; files?: unknown[]; initialFolder?: string | null };
  } | null;

  const modal = {
    open: (component: unknown, config: { data: unknown }) => {
      opened = { component, data: config.data as { folderName?: string } };
      return { afterClosed: () => Promise.resolve(false) };
    },
  };

  function make(attachments: TaskAttachment[]) {
    opened = null;
    TestBed.configureTestingModule({
      imports: [DmsStageFilesComponent],
      providers: [
        { provide: TaskAttachmentService, useValue: { getByStage: () => of(attachments) } },
        { provide: ModalService, useValue: modal },
        { provide: PermissionsService, useValue: { can: () => true } },
      ],
    });
    const fixture = TestBed.createComponent(DmsStageFilesComponent);
    fixture.componentRef.setInput('stageId', 's1');
    fixture.componentRef.setInput('projectId', 'p1');
    fixture.componentRef.setInput('stageOrder', 3);
    fixture.componentRef.setInput('stageName', 'Design Phase');
    fixture.detectChanges();
    return fixture;
  }

  it('shows only content-kind folders that hold files', () => {
    const fixture = make([att({ id: 'p', fileName: 'plan.pdf' })]);
    const text = fixture.nativeElement.textContent as string;
    expect(text).toContain('Drawings');
    expect(text).not.toContain('Schedules');
    expect(text).not.toContain('References');
    expect(fixture.componentInstance.visibleFolders().length).toBe(1);
  });

  it("opening a folder pops the shared floating files window with that folder's files", () => {
    const fixture = make([
      att({ id: 'p', fileName: 'plan.pdf' }),
      att({ id: 'i', fileName: 'photo.jpg' }),
    ]);
    const drawings = fixture.componentInstance.visibleFolders().find((f) => f.key === 'drawings')!;
    fixture.componentInstance.openFolder(drawings);
    expect(opened?.component).toBe(FilesFolderModalComponent);
    expect(opened?.data.folderName).toBe('Drawings');
    expect(opened?.data.files?.length).toBe(1); // only the pdf
  });

  it('Documentation opens the project-documents browser unscoped', () => {
    const fixture = make([att()]);
    fixture.componentInstance.openDocumentation();
    expect(opened?.component).toBe(DocumentationModalComponent);
    expect(opened?.data.initialFolder).toBeNull();
  });

  it('shows an empty state when the stage has no files', () => {
    const fixture = make([]);
    expect(fixture.componentInstance.visibleFolders().length).toBe(0);
    expect(fixture.nativeElement.textContent).toContain('no files yet');
  });
});
