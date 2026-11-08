import { TestBed } from '@angular/core/testing';
import { of } from 'rxjs';
import { describe, expect, it } from 'vitest';
import { ModalService } from '@ds';
import { PermissionsService } from '@platform/permissions';
import { DmsStageFilesComponent } from './dms-stage-files.component';
import { TaskAttachmentService } from '../../../data/task-attachment.service';
import { DocumentVersionsService } from '../../../data/document-versions.service';
import { ProjectAccessStore } from '../../../stores/project-access.store';
import type { ProjectAccess } from '../../../model/access-grant.model';

/** crmp P1-B: stage files are managed with the grant's implied stage_tasks.manage, for its stages. */
describe('DmsStageFilesComponent — grantees (crmp P1-B)', () => {
  function canManage(myAccess: ProjectAccess | null, token: boolean, stageId = 's1'): boolean {
    TestBed.configureTestingModule({
      imports: [DmsStageFilesComponent],
      providers: [
        { provide: TaskAttachmentService, useValue: { getByStage: () => of([]) } },
        // Sync F2: the panel also lists the stage's document versions.
        { provide: DocumentVersionsService, useValue: { getByStage: () => of([]) } },
        { provide: ModalService, useValue: {} },
        { provide: PermissionsService, useValue: { can: () => token } },
        { provide: ProjectAccessStore, useValue: { project: () => () => ({ myAccess }) } },
      ],
    });
    const f = TestBed.createComponent(DmsStageFilesComponent);
    f.componentRef.setInput('stageId', stageId);
    f.componentRef.setInput('projectId', 'p1');
    return f.componentInstance.canManage();
  }
  const grant = (level: ProjectAccess['level'], stageIds: string[] = []): ProjectAccess => ({
    source: 'Grant',
    level,
    areas: ['StagesAndTasks'],
    stageIds,
    expiresAtUtc: null,
  });

  it('an Editor grant manages without the token claim; a Viewer grant does not', () => {
    expect(canManage(grant('Editor'), false)).toBe(true);
    TestBed.resetTestingModule();
    expect(canManage(grant('Viewer'), true)).toBe(false);
  });

  it('a stage-limited grant manages only its stages', () => {
    expect(canManage(grant('Editor', ['s1']), false, 's1')).toBe(true);
    TestBed.resetTestingModule();
    expect(canManage(grant('Editor', ['s1']), false, 's2')).toBe(false);
  });

  it('a member keeps the token', () => {
    expect(canManage(null, false)).toBe(false);
    TestBed.resetTestingModule();
    expect(canManage(null, true)).toBe(true);
  });
});
