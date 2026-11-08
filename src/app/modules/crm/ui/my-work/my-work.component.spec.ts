import { TestBed } from '@angular/core/testing';
import { HttpErrorResponse } from '@angular/common/http';
import { provideRouter } from '@angular/router';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { of, throwError } from 'rxjs';
import { EN } from '@platform/i18n/catalog/en';
import {
  CrmMyGatheringWorkService,
  type MyGatheringWorkItem,
} from '../../data/crm-my-gathering-work.service';
import { CrmMyWorkComponent } from './my-work.component';

function row(over: Partial<MyGatheringWorkItem> = {}): MyGatheringWorkItem {
  return {
    projectTaskId: 't1',
    taskName: 'Gather kitchen',
    projectId: 'p1',
    projectName: 'Villa',
    projectStageId: 's1',
    stageName: 'Design',
    taskBlock: {
      briefId: 'b1',
      briefStatus: 3,
      entryTotal: 0,
      entryPending: 0,
      itemTotal: 0,
      itemPending: 0,
      unresolvedTotal: 0,
      meetingsUpcoming: 0,
    },
    openPeriodClosesAtUtc: null,
    nextMeetingAtUtc: null,
    trackKey: 't1',
    ...over,
  };
}

// crmp C-3: GET /api/crm/my-gathering-work (CrmMyWorkEndpoints.cs:19, contract §2.18).
describe('CrmMyWorkComponent (crmp C-3)', () => {
  const list = vi.fn();

  beforeEach(() => {
    list.mockReset();
    TestBed.configureTestingModule({
      imports: [CrmMyWorkComponent],
      providers: [provideRouter([]), { provide: CrmMyGatheringWorkService, useValue: { list } }],
    });
  });

  function render(): HTMLElement {
    const fixture = TestBed.createComponent(CrmMyWorkComponent);
    fixture.detectChanges();
    return fixture.nativeElement as HTMLElement;
  }

  it('shows every kind the backend reports on a row, each linking to its screen', () => {
    list.mockReturnValue(
      of([
        row({
          taskBlock: {
            briefId: 'b1',
            briefStatus: 4,
            entryTotal: 3,
            entryPending: 2,
            itemTotal: 5,
            itemPending: 1,
            unresolvedTotal: 3,
            meetingsUpcoming: 1,
          },
          openPeriodClosesAtUtc: '2030-01-01T10:00:00Z',
          nextMeetingAtUtc: '2030-01-02T10:00:00Z',
        }),
      ]),
    );
    const el = render();
    const kinds = [...el.querySelectorAll('[data-kind]')].map((a) => [
      a.getAttribute('data-kind'),
      a.getAttribute('href'),
    ]);
    expect(kinds).toEqual([
      ['brief', '/crm/projects/p1/brief'],
      ['entries', '/crm/projects/p1/brief'],
      ['approvals', '/crm/projects/p1/items'],
      ['period', '/crm/projects/p1/items'],
      ['meeting', '/crm/projects/p1/scheduler'],
    ]);
    expect(el.textContent).toContain(EN['mywork.briefRejected']);
    expect(el.textContent).toContain('2 entries to send');
    const task = [...el.querySelectorAll('a')].find(
      (a) => a.textContent?.trim() === EN['mywork.openTask'],
    );
    expect(task?.getAttribute('href')).toBe('/projects/p1/tasks/t1');
  });

  it('a Draft brief reads "to finish"; an Approved brief with nothing pending shows no kind', () => {
    list.mockReturnValue(
      of([
        row({
          trackKey: 'a',
          projectTaskId: 'a',
          taskBlock: { ...row().taskBlock, briefStatus: 1 },
        }),
        row({ trackKey: 'b', projectTaskId: 'b' }),
      ]),
    );
    const el = render();
    const rows = el.querySelectorAll('[data-testid="mywork-row"]');
    expect(rows[0].textContent).toContain(EN['mywork.briefDraft']);
    expect(rows[1].querySelectorAll('[data-kind]')).toHaveLength(0);
  });

  it('upcoming meetings without a next date show the count', () => {
    list.mockReturnValue(of([row({ taskBlock: { ...row().taskBlock, meetingsUpcoming: 2 } })]));
    expect(render().textContent).toContain('2 upcoming meetings');
  });

  it('renders the empty state for no rows', () => {
    list.mockReturnValue(of([]));
    expect(render().textContent).toContain(EN['mywork.empty']);
  });

  it('a full 200 says there may be more', () => {
    list.mockReturnValue(
      of(Array.from({ length: 200 }, (_, i) => row({ trackKey: `k${i}`, projectTaskId: `t${i}` }))),
    );
    expect(render().textContent).toContain('Showing the first 200 tasks — there may be more.');
  });

  it('a 403 crm.mywork.NotAnEmployee shows its catalog message and no retry', () => {
    list.mockReturnValue(
      throwError(
        () =>
          new HttpErrorResponse({
            status: 403,
            error: { errors: { 'crm.mywork.NotAnEmployee': ['My Work is for employees.'] } },
          }),
      ),
    );
    const el = render();
    expect(el.textContent).toContain('My Work is for employees.');
    expect(el.textContent).not.toContain(EN['common.retry']);
  });

  it('any other failure offers a retry that reads again', () => {
    list.mockReturnValueOnce(throwError(() => new HttpErrorResponse({ status: 500 })));
    list.mockReturnValueOnce(of([]));
    const fixture = TestBed.createComponent(CrmMyWorkComponent);
    fixture.detectChanges();
    const el = fixture.nativeElement as HTMLElement;
    const retry = [...el.querySelectorAll('button')].find(
      (b) => b.textContent?.trim() === EN['common.retry'],
    ) as HTMLButtonElement;
    retry.click();
    fixture.detectChanges();
    expect(list).toHaveBeenCalledTimes(2);
    expect(el.textContent).toContain(EN['mywork.empty']);
  });
});
