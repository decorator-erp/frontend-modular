import { HttpErrorResponse } from '@angular/common/http';
import { TestBed } from '@angular/core/testing';
import { describe, expect, it, vi, beforeEach } from 'vitest';
import { NEVER, Subject, of, throwError } from 'rxjs';
import { CrmApprovalsService } from '../data/crm-approvals.service';
import { CrmBriefService } from '../data/crm-brief.service';
import { ApprovalState } from '../model/crm-enums';
import type { BriefHead, BriefRound, BriefSpace, BriefSpaceRef, CrmSpaceType } from '../model';
import { BriefStore } from './brief.store';

const PROJECT_ID = 'project-1';

const RECEPTION_TYPE: CrmSpaceType = {
  id: 'st-reception',
  code: 'reception',
  nameEn: 'Reception',
  nameAr: 'الاستقبال',
};
const KITCHEN_TYPE: CrmSpaceType = {
  id: 'st-kitchen',
  code: 'kitchen',
  nameEn: 'Kitchen',
  nameAr: 'المطبخ',
};
const RECEPTION: BriefSpaceRef = {
  id: 'space-reception',
  name: 'Reception',
  spaceType: RECEPTION_TYPE,
};
const KITCHEN: BriefSpaceRef = { id: 'space-kitchen', name: 'Kitchen', spaceType: KITCHEN_TYPE };

function head(over: Partial<BriefHead> = {}): BriefHead {
  return {
    id: 'brief-1',
    projectId: PROJECT_ID,
    projectStageId: 'stage-1',
    createdById: 'employee-1',
    unitType: 1,
    unitCondition: 1,
    address: null,
    floorNo: null,
    unitsPerFloor: null,
    areaSqm: null,
    buildingKind: null,
    isLicensed: null,
    isRented: null,
    finishingPurpose: null,
    position: null,
    elevatorStatus: null,
    receivesFrequentVisitors: null,
    visitorsNote: null,
    usedDesignerBefore: null,
    designerExperience: null,
    designerExperienceReason: null,
    hiringReasons: 0,
    preferredStyle: null,
    preferredColors: null,
    furnitureStatus: null,
    expectedBudget: null,
    timelinePressure: null,
    architecturalRequests: null,
    otherNeeds: null,
    sector: null,
    status: ApprovalState.Draft,
    lastMeetingId: null,
    ...over,
  };
}

function space(over: Partial<BriefSpace> = {}): BriefSpace {
  return {
    id: 'space-1',
    briefId: 'brief-1',
    spaceId: RECEPTION.id,
    space: RECEPTION,
    countOrPieces: null,
    requirements: 'L-seating for 10 guests',
    meetingId: null,
    approvalStatus: ApprovalState.Draft,
    supersedesSpaceId: null,
    projectTaskId: null,
    createdById: 'employee-1',
    isCurrent: true,
    ...over,
  };
}

/** `CrmBriefRoundResponse` rows, in round order (009b #14). */
function rounds(...numbers: number[]): BriefRound[] {
  return numbers.map((round) => ({
    round,
    sentAtUtc: '2026-07-01T00:00:00Z',
    outcome: 1,
    decidedAtUtc: null,
  }));
}

function briefApiMock() {
  return {
    getBrief: vi.fn().mockReturnValue(of(head())),
    getBriefByStage: vi.fn().mockReturnValue(of(head())),
    listSpaces: vi.fn().mockReturnValue(of([space()])),
    createBrief: vi.fn().mockReturnValue(of('brief-new')),
    updateHead: vi.fn().mockReturnValue(of(undefined)),
    sendForConfirmation: vi.fn().mockReturnValue(of(undefined)),
    addSpace: vi.fn().mockReturnValue(of('new-space-id')),
    updateSpace: vi.fn().mockReturnValue(of(undefined)),
    sendSpace: vi.fn().mockReturnValue(of(undefined)),
    supersedeSpace: vi.fn().mockReturnValue(of('new-space-id')),
    getHeadDiff: vi.fn(),
    listRounds: vi.fn().mockReturnValue(of([])),
    getMyBrief: vi.fn(),
  };
}

function approvalsApiMock() {
  return {
    bySubject: vi.fn().mockReturnValue(of([])),
    pending: vi.fn(),
    decide: vi.fn(),
    decideAsClient: vi.fn(),
    portalPending: vi.fn(),
  };
}

describe('BriefStore', () => {
  let api: ReturnType<typeof briefApiMock>;
  let approvals: ReturnType<typeof approvalsApiMock>;

  beforeEach(() => {
    api = briefApiMock();
    approvals = approvalsApiMock();
    TestBed.configureTestingModule({
      providers: [
        BriefStore,
        { provide: CrmBriefService, useValue: api },
        { provide: CrmApprovalsService, useValue: approvals },
      ],
    });
  });

  const store = () => TestBed.inject(BriefStore);

  describe('load()', () => {
    it('loads the head, spaces, and the rounds — never the approvals trail (009b #14)', () => {
      const s = store();
      s.load(PROJECT_ID);
      expect(api.getBrief).toHaveBeenCalledWith(PROJECT_ID);
      expect(api.listRounds).toHaveBeenCalledWith('brief-1');
      expect(approvals.bySubject).not.toHaveBeenCalled();
      expect(s.head()?.id).toBe('brief-1');
      expect(s.spaces()).toHaveLength(1);
      expect(s.loading()).toBe(false);
    });

    it('sets loading true while in flight', () => {
      api.getBrief.mockReturnValueOnce(NEVER);
      const s = store();
      s.load(PROJECT_ID);
      expect(s.loading()).toBe(true);
    });

    it('surfaces a friendly error on failure', () => {
      api.getBrief.mockReturnValue(throwError(() => new Error('boom')));
      const s = store();
      s.load(PROJECT_ID);
      expect(s.error()).toBe('Could not load the brief.');
    });

    it("with a stage, reads that stage's brief (009b #9), then its entries by brief id (009b #11)", () => {
      const s = store();
      s.load(PROJECT_ID, 'stage-2');
      expect(api.getBriefByStage).toHaveBeenCalledWith('stage-2');
      expect(api.getBrief).not.toHaveBeenCalled();
      expect(api.listSpaces).toHaveBeenCalledWith('brief-1', PROJECT_ID);
      expect(s.stageId()).toBe('stage-2');
      expect(s.spaces()).toHaveLength(1);
    });

    it('without a stage, falls back to the obsolete project route (N-11)', () => {
      const s = store();
      s.load(PROJECT_ID);
      expect(api.getBrief).toHaveBeenCalledWith(PROJECT_ID);
      expect(api.getBriefByStage).not.toHaveBeenCalled();
      expect(s.stageId()).toBeNull();
    });

    it('reload() re-reads the same stage after a mutation', () => {
      const s = store();
      s.load(PROJECT_ID, 'stage-2');
      api.getBriefByStage.mockClear();
      s.addSpace({ spaceId: RECEPTION.id, requirements: 'x' });
      expect(api.getBriefByStage).toHaveBeenCalledWith('stage-2');
      expect(api.getBrief).not.toHaveBeenCalled();
    });

    it('an entries fetch failure does not blank the head — spaces just stay empty', () => {
      api.listSpaces.mockReturnValue(throwError(() => new Error('boom')));
      const s = store();
      s.load(PROJECT_ID);
      expect(s.head()?.id).toBe('brief-1');
      expect(s.spaces()).toEqual([]);
    });

    it('a stage pick cancels the fallback load: a late fallback head never replaces it (FINDING-5-5)', () => {
      const fallback$ = new Subject<BriefHead>();
      const stage$ = new Subject<BriefHead>();
      api.getBrief.mockReturnValue(fallback$);
      api.getBriefByStage.mockReturnValue(stage$);
      const s = store();
      s.load(PROJECT_ID);
      s.load(PROJECT_ID, 'stage-B');

      stage$.next(head({ id: 'brief-B', projectStageId: 'stage-B' }));
      fallback$.next(head({ id: 'brief-C', projectStageId: 'stage-C' }));

      expect(s.head()?.id).toBe('brief-B');
      expect(api.listSpaces).not.toHaveBeenCalledWith('brief-C', expect.anything());
    });

    it("drops a superseded load's late spaces and rounds (FINDING-5-5)", () => {
      const spacesA$ = new Subject<BriefSpace[]>();
      const roundsA$ = new Subject<BriefRound[]>();
      const spacesB$ = new Subject<BriefSpace[]>();
      const roundsB$ = new Subject<BriefRound[]>();
      api.getBriefByStage.mockImplementation((stageId: string) =>
        of(head({ id: `brief-${stageId}`, projectStageId: stageId })),
      );
      api.listSpaces.mockImplementation((briefId: string) =>
        briefId === 'brief-A' ? spacesA$ : spacesB$,
      );
      api.listRounds.mockImplementation((briefId: string) =>
        briefId === 'brief-A' ? roundsA$ : roundsB$,
      );
      const s = store();
      s.load(PROJECT_ID, 'A');
      s.load(PROJECT_ID, 'B');

      spacesB$.next([space({ id: 'entry-B', briefId: 'brief-B' })]);
      roundsB$.next(rounds(1));
      spacesA$.next([space({ id: 'entry-A', briefId: 'brief-A' })]);
      roundsA$.next(rounds(1, 2, 3));

      expect(s.head()?.id).toBe('brief-B');
      expect(s.spaces().map((e) => e.id)).toEqual(['entry-B']);
      expect(s.headRound()).toBe(1);
    });

    it('a rounds fetch failure does not blank the head — rounds just stay empty', () => {
      api.listRounds.mockReturnValue(throwError(() => new Error('boom')));
      const s = store();
      s.load(PROJECT_ID);
      expect(s.head()?.id).toBe('brief-1');
      expect(s.rounds()).toEqual([]);
      expect(s.headRound()).toBe(0);
    });
  });

  describe('no brief yet (009b #10)', () => {
    const notFound = (code: string) =>
      new HttpErrorResponse({
        status: 404,
        error: { title: code, status: 404, errors: { [code]: ['Design brief not found.'] } },
      });

    it('a 404 crm.briefs.NotFound is the "no brief yet" state, not an error', () => {
      api.getBriefByStage.mockReturnValue(throwError(() => notFound('crm.briefs.NotFound')));
      const s = store();
      s.load(PROJECT_ID, 'stage-2');
      expect(s.noBrief()).toBe(true);
      expect(s.error()).toBeNull();
      expect(s.head()).toBeNull();
      expect(api.listSpaces).not.toHaveBeenCalled();
    });

    it('any other failure stays an error', () => {
      api.getBriefByStage.mockReturnValue(throwError(() => new HttpErrorResponse({ status: 500 })));
      const s = store();
      s.load(PROJECT_ID, 'stage-2');
      expect(s.noBrief()).toBe(false);
      expect(s.error()).toBe('Could not load the brief.');
    });

    it('createBrief posts { data, projectStageId } and loads the new brief by its stage', () => {
      api.getBriefByStage.mockReturnValueOnce(throwError(() => notFound('crm.briefs.NotFound')));
      const s = store();
      s.load(PROJECT_ID, 'stage-2');

      s.createBrief('stage-2', { unitType: 0, unitCondition: 0 });

      expect(api.createBrief).toHaveBeenCalledWith(PROJECT_ID, {
        data: { unitType: 0, unitCondition: 0 },
        projectStageId: 'stage-2',
      });
      expect(api.getBriefByStage).toHaveBeenLastCalledWith('stage-2');
      expect(s.noBrief()).toBe(false);
      expect(s.head()?.id).toBe('brief-1');
    });

    it("a failed create shows the code's catalog message", () => {
      api.createBrief.mockReturnValue(
        throwError(
          () =>
            new HttpErrorResponse({
              status: 400,
              error: { errors: { 'crm.briefs.UnitDetailsRequired': ['x'] } },
            }),
        ),
      );
      const s = store();
      s.load(PROJECT_ID, 'stage-2');
      s.createBrief('stage-2', { unitType: 0, unitCondition: 0 });
      expect(s.creating()).toBe(false);
      expect(s.error()).toBe(
        "Unit type and unit condition are required unless the lead's intake supplies them.",
      );
    });
  });

  describe('updateHead (009b #12)', () => {
    const conflict = (code: string) =>
      new HttpErrorResponse({ status: 409, error: { title: code, errors: { [code]: ['x'] } } });

    it('keys the PUT by the loaded brief id and wraps the fields in { data, lastMeetingId }', () => {
      const s = store();
      s.load(PROJECT_ID, 'stage-1');
      s.updateHead({ data: { unitType: 2, unitCondition: 3 }, lastMeetingId: 'm-1' });
      expect(api.updateHead).toHaveBeenCalledWith('brief-1', {
        data: { unitType: 2, unitCondition: 3 },
        lastMeetingId: 'm-1',
      });
    });

    it('409 crm.briefs.ConcurrencyConflict reloads the brief (X-3) instead of erroring', () => {
      api.updateHead.mockReturnValue(throwError(() => conflict('crm.briefs.ConcurrencyConflict')));
      const s = store();
      s.load(PROJECT_ID, 'stage-1');
      api.getBriefByStage.mockClear();
      const onError = vi.fn();

      s.updateHead({ data: { unitType: 1, unitCondition: 1 } }, { onError });

      expect(api.getBriefByStage).toHaveBeenCalledWith('stage-1');
      expect(s.error()).toBeNull();
      expect(s.savingHead()).toBe(false);
      expect(onError).not.toHaveBeenCalled();
    });

    it('409 crm.briefs.HeadLockedPendingApproval shows its catalog message', () => {
      api.updateHead.mockReturnValue(
        throwError(() => conflict('crm.briefs.HeadLockedPendingApproval')),
      );
      const s = store();
      s.load(PROJECT_ID);
      s.updateHead({ data: { unitType: 1, unitCondition: 1 } });
      expect(s.error()).toBe(
        "The brief head can't be edited while it is waiting for the client's decision.",
      );
    });

    it('hands a validation failure to onError for the form', () => {
      const validation = new HttpErrorResponse({
        status: 400,
        error: { title: 'Validation.General', errors: { 'Data.AreaSqm': ['Must be > 0.'] } },
      });
      api.updateHead.mockReturnValue(throwError(() => validation));
      const s = store();
      s.load(PROJECT_ID);
      const onError = vi.fn();
      s.updateHead({ data: { unitType: 1, unitCondition: 1 } }, { onError });
      expect(onError).toHaveBeenCalledWith(expect.objectContaining({ status: 400 }));
      expect(s.error()).toBe('Could not save the brief head.');
    });
  });

  describe('sendForConfirmation errors (009b #13)', () => {
    const conflict = (status: number, code: string) =>
      new HttpErrorResponse({ status, error: { title: code, errors: { [code]: ['x'] } } });

    it('409 crm.briefs.ConcurrentSend reloads the brief (X-3)', () => {
      api.sendForConfirmation.mockReturnValue(
        throwError(() => conflict(409, 'crm.briefs.ConcurrentSend')),
      );
      const s = store();
      s.load(PROJECT_ID, 'stage-1');
      api.getBriefByStage.mockClear();

      s.sendForConfirmation();

      expect(api.getBriefByStage).toHaveBeenCalledWith('stage-1');
      expect(s.error()).toBeNull();
      expect(s.sending()).toBe(false);
    });

    it.each([
      ['crm.briefs.NotSendable', 409, 'Only a draft or rejected brief can be sent for approval.'],
      [
        'approvals.OpenApprovalExists',
        409,
        'An undecided approval already exists for this subject.',
      ],
      ['crm.clients.NotFound', 404, 'Client not found.'],
    ])('%s shows its catalog message', (code, status, message) => {
      api.sendForConfirmation.mockReturnValue(throwError(() => conflict(status, code)));
      const s = store();
      s.load(PROJECT_ID);
      s.sendForConfirmation();
      expect(s.error()).toBe(message);
    });
  });

  describe('headRound / isHeadRoundOutstanding', () => {
    it('is 0 when the head has never been sent (no rounds)', () => {
      const s = store();
      s.load(PROJECT_ID);
      expect(s.headRound()).toBe(0);
      expect(s.isHeadRoundOutstanding()).toBe(false);
    });

    it('is the last round of the list once sent (009b #14)', () => {
      api.listRounds.mockReturnValue(of(rounds(1, 2, 3)));
      api.getBrief.mockReturnValue(of(head({ status: ApprovalState.PendingApproval })));
      const s = store();

      s.load(PROJECT_ID);

      expect(s.headRound()).toBe(3);
      expect(s.isHeadRoundOutstanding()).toBe(true);
    });

    it('an edit that returns an Approved head to PendingApproval does NOT itself open a new round — round is unchanged until send()', () => {
      api.listRounds.mockReturnValue(of(rounds(1)));
      api.getBrief.mockReturnValueOnce(of(head({ status: ApprovalState.Approved })));
      const s = store();
      s.load(PROJECT_ID);
      expect(s.headRound()).toBe(1);

      // Simulate the server's real behavior: editing flips status to PendingApproval but
      // the rounds (fetched fresh on reload) still report the SAME round — FR-009.
      api.getBrief.mockReturnValue(of(head({ status: ApprovalState.PendingApproval })));
      s.updateHead({ data: { unitType: 1, unitCondition: 1 } });

      expect(api.updateHead).toHaveBeenCalled();
      expect(s.headRound()).toBe(1); // unchanged — the round only moves on send()
      expect(s.isHeadRoundOutstanding()).toBe(true);
    });

    it('sendForConfirmation() is what advances the round (FR-009)', () => {
      api.listRounds.mockReturnValueOnce(of(rounds(1)));
      api.getBrief.mockReturnValueOnce(of(head({ status: ApprovalState.Rejected })));
      const s = store();
      s.load(PROJECT_ID);
      expect(s.headRound()).toBe(1);

      api.listRounds.mockReturnValue(of(rounds(1, 2)));
      api.getBrief.mockReturnValue(of(head({ status: ApprovalState.PendingApproval })));
      s.sendForConfirmation();

      expect(api.sendForConfirmation).toHaveBeenCalledWith('brief-1');
      expect(s.headRound()).toBe(2);
    });
  });

  describe('groupedBySpace (FR-024a, feature 006)', () => {
    it('collects entries of the SAME space into ONE group', () => {
      const a = space({ id: 's1', space: RECEPTION });
      const b = space({ id: 's2', space: RECEPTION, requirements: 'more seating' });
      api.listSpaces.mockReturnValue(of([a, b]));
      const s = store();

      s.load(PROJECT_ID);

      const groups = s.groupedBySpace();
      expect(groups).toHaveLength(1);
      expect(groups[0].space?.id).toBe(RECEPTION.id);
      expect(groups[0].entries.map((e) => e.id).sort()).toEqual(['s1', 's2']);
    });

    it('splits entries into separate groups by space', () => {
      api.listSpaces.mockReturnValue(
        of([space({ id: 's1', space: RECEPTION }), space({ id: 's2', space: KITCHEN })]),
      );
      const s = store();

      s.load(PROJECT_ID);

      expect(
        s
          .groupedBySpace()
          .map((g) => g.space?.name)
          .sort(),
      ).toEqual(['Kitchen', 'Reception']);
    });

    it('puts null-space entries into a General group that sorts last', () => {
      api.listSpaces.mockReturnValue(
        of([space({ id: 's1', space: null }), space({ id: 's2', space: RECEPTION })]),
      );
      const s = store();

      s.load(PROJECT_ID);

      const groups = s.groupedBySpace();
      expect(groups).toHaveLength(2);
      expect(groups[groups.length - 1].space).toBeNull();
    });
  });

  describe('addSpace() / supersedeSpace()', () => {
    it('addSpace reloads the brief on success', () => {
      const s = store();
      s.load(PROJECT_ID);
      api.getBrief.mockClear();

      s.addSpace({ spaceId: RECEPTION.id, requirements: 'New need' });

      expect(api.addSpace).toHaveBeenCalledWith(
        'brief-1',
        expect.objectContaining({ spaceId: RECEPTION.id }),
      );
      expect(api.getBrief).toHaveBeenCalledWith(PROJECT_ID);
      expect(s.mutatingSpace()).toBe(false);
    });

    it('supersedeSpace posts to the OLD entry id and reloads on success', () => {
      const s = store();
      s.load(PROJECT_ID);

      s.supersedeSpace('old-space', { spaceId: RECEPTION.id, requirements: 'x' });

      expect(api.supersedeSpace).toHaveBeenCalledWith('old-space', expect.anything());
    });

    it('surfaces a friendly error and does not reload on failure', () => {
      api.addSpace.mockReturnValue(throwError(() => new Error('boom')));
      const s = store();
      s.load(PROJECT_ID);
      api.getBrief.mockClear();

      s.addSpace({ spaceId: RECEPTION.id, requirements: 'x' });

      expect(s.error()).toBe('Could not add the entry.');
      expect(api.getBrief).not.toHaveBeenCalled();
    });
  });

  describe('loadAsClient (009b #43) — the portal brief', () => {
    it('a null head is "nothing sent yet": no head, no error', () => {
      api.getMyBrief.mockReturnValue(of({ head: null, spaces: [] }));
      const s = store();
      s.loadAsClient(PROJECT_ID);
      expect(s.head()).toBeNull();
      expect(s.nothingSent()).toBe(true);
      expect(s.error()).toBeNull();
      expect(api.listRounds).not.toHaveBeenCalled();
    });

    it("the round label comes from the sent head's round", () => {
      api.getMyBrief.mockReturnValue(
        of({ head: { ...head({ status: ApprovalState.PendingApproval }), round: 3 }, spaces: [] }),
      );
      const s = store();
      s.loadAsClient(PROJECT_ID);
      expect(s.nothingSent()).toBe(false);
      expect(s.headRound()).toBe(3);
    });

    it.each([
      [404, 'crm.portal.NotFound', 'Nothing was found for that request.'],
      [403, 'crm.portal.NotAClient', 'This page is for clients only.'],
      [403, 'crm.access.NoStanding', 'Your account has no active access to this area.'],
    ])('a %s %s shows its catalog message', (status, code, message) => {
      api.getMyBrief.mockReturnValue(
        throwError(
          () =>
            new HttpErrorResponse({
              status,
              error: { title: code, status, errors: { [code]: ['x'] } },
            }),
        ),
      );
      const s = store();
      s.loadAsClient(PROJECT_ID);
      expect(s.error()).toBe(message);
      expect(s.nothingSent()).toBe(false);
    });
  });
});
