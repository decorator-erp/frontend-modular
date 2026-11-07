import { TestBed } from '@angular/core/testing';
import { of } from 'rxjs';
import { MemberFormDialogComponent, MemberFormDialogData } from './member-form-dialog.component';
import { StageTeamsService } from '../../data/stage-teams.service';
import { EmployeeService } from '@modules/people';
import { ErrorHandlerService } from '@platform/http/error-handler.service';
import { ToastService } from '@platform/feedback/toast.service';
import { PERA_MODAL_DATA, PeraModalRef } from '@ds';

describe('MemberFormDialogComponent', () => {
  let added: { projectId: string; stageTeamId: string; employeeId: string; role: string } | null;
  let roleChanged: { projectId: string; memberId: string; role: string } | null;
  let closedWith: unknown;
  const modalRef = {
    close: (r: unknown) => {
      closedWith = r;
    },
  };

  function make(data: MemberFormDialogData): MemberFormDialogComponent {
    added = null;
    roleChanged = null;
    closedWith = undefined;
    TestBed.resetTestingModule();
    TestBed.configureTestingModule({
      imports: [MemberFormDialogComponent],
      providers: [
        {
          provide: StageTeamsService,
          useValue: {
            getByProject: () =>
              of([{ id: 'team1', departmentName: 'Engineering', memberCount: 2 }]),
            addMember: (
              projectId: string,
              stageTeamId: string,
              employeeId: string,
              role: string,
            ) => {
              added = { projectId, stageTeamId, employeeId, role };
              return of(undefined);
            },
            changeMemberRole: (projectId: string, memberId: string, role: string) => {
              roleChanged = { projectId, memberId, role };
              return of(undefined);
            },
          },
        },
        {
          provide: EmployeeService,
          useValue: { listPaged: () => of({ items: [{ id: 'e1', fullName: 'Sara Mohamed' }] }) },
        },
        {
          provide: ErrorHandlerService,
          useValue: {
            parse: () => ({
              status: 409,
              generalMessage: 'x',
              fieldErrors: {},
              code: 'stage_teams.MemberExists',
              raw: null,
            }),
          },
        },
        { provide: ToastService, useValue: { show: () => undefined } },
        { provide: PeraModalRef, useValue: modalRef },
        { provide: PERA_MODAL_DATA, useValue: data },
      ],
    });
    return TestBed.createComponent(MemberFormDialogComponent).componentInstance;
  }

  it('create calls the real addMember endpoint with stage team + employee + role', () => {
    const c = make({ mode: 'create', projectId: 'p1', stageTeamId: 'team1' });
    c.form.patchValue({ employeeId: 'e1', role: 'Lead' });
    c.submit();
    expect(added).toEqual({
      projectId: 'p1',
      stageTeamId: 'team1',
      employeeId: 'e1',
      role: 'Lead',
    });
    expect(closedWith).toBe(true);
  });

  it('edit calls changeMemberRole — not the design 404 /project-members/{id}/access route', () => {
    const c = make({ mode: 'edit', projectId: 'p1', memberId: 'm9', initial: { role: 'Member' } });
    expect(c.isEdit).toBe(true);
    c.form.patchValue({ role: 'Reviewer' });
    c.submit();
    expect(roleChanged).toEqual({ projectId: 'p1', memberId: 'm9', role: 'Reviewer' });
    expect(added).toBeNull();
  });

  it('blocks create submit when no employee is chosen', () => {
    const c = make({ mode: 'create', projectId: 'p1', stageTeamId: 'team1' });
    c.submit();
    expect(added).toBeNull();
    expect(closedWith).toBeUndefined();
  });
});
