import { TestBed } from '@angular/core/testing';
import { of } from 'rxjs';
import { describe, expect, it } from 'vitest';
import { EmployeeService } from '@modules/people';
import { StageTeamsService } from '../../../data/stage-teams.service';
import { DmsStageTeamComponent } from './dms-stage-team.component';

/** crmp review R1-F3: member names come from the directory (StageTeamMemberResponse has none). */
describe('DmsStageTeamComponent — member names (crmp R1-F3)', () => {
  it('resolves each member through the employee directory', () => {
    TestBed.configureTestingModule({
      imports: [DmsStageTeamComponent],
      providers: [
        {
          provide: StageTeamsService,
          useValue: {
            getByProjectStage: () =>
              of([
                {
                  members: [
                    { id: 'M1', employeeId: 'E1', employeeName: '', isHead: true, role: null },
                  ],
                },
              ]),
          },
        },
        {
          provide: EmployeeService,
          useValue: { listPaged: () => of({ items: [{ id: 'E1', fullName: 'Sara Adel' }] }) },
        },
      ],
    });
    const f = TestBed.createComponent(DmsStageTeamComponent);
    f.componentRef.setInput('projectId', 'P1');
    f.componentRef.setInput('stageId', 'S1');
    f.detectChanges();
    expect(
      (f.componentInstance as unknown as { members: () => { name: string }[] }).members()[0]?.name,
    ).toBe('Sara Adel');
  });
});
