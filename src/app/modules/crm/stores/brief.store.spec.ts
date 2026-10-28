import { HttpErrorResponse } from '@angular/common/http';
import { TestBed } from '@angular/core/testing';
import { describe, expect, it, vi, beforeEach } from 'vitest';
import { NEVER, of, throwError } from 'rxjs';
import { CrmApprovalsService } from '../data/crm-approvals.service';
import { CrmBriefService } from '../data/crm-brief.service';
import { ApprovalState, ApprovalSubjectType } from '../model/crm-enums';
import type {
  ApprovalTrailItem,
  BriefHead,
  BriefSpace,
  BriefSpaceRef,
  CrmSpaceType,
} from '../model';
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

function trailItem(over: Partial<ApprovalTrailItem> = {}): ApprovalTrailItem {
  return {
    id: 'appr-1',
    round: 1,
    decision: null,
    comment: null,
    decidedAtUtc: null,
    decidedById: null,
    ...over,
  };
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
    it('loads the head, spaces, and the head trail', () => {
      const s = store();
      s.load(PROJECT_ID);
      expect(api.getBrief).toHaveBeenCalledWith(PROJECT_ID);
      expect(approvals.bySubject).toHaveBeenCalledWith(ApprovalSubjectType.DesignBrief, 'brief-1');
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

    it('a trail fetch failure does not blank the head — headTrail just stays empty', () => {
      approvals.bySubject.mockReturnValue(throwError(() => new Error('boom')));
      const s = store();
      s.load(PROJECT_ID);
      expect(s.head()?.id).toBe('brief-1');
      expect(s.headTrail()).toEqual([]);
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

  describe('headRound / isHeadRoundOutstanding', () => {
    it('is 0 when the head has never been sent (no trail rows)', () => {
      const s = store();
      s.load(PROJECT_ID);
      expect(s.headRound()).toBe(0);
      expect(s.isHeadRoundOutstanding()).toBe(false);
    });

    it('reflects the highest round in the trail once sent', () => {
      approvals.bySubject.mockReturnValue(
        of([trailItem({ round: 1 }), trailItem({ round: 2, id: 'appr-2' })]),
      );
      api.getBrief.mockReturnValue(of(head({ status: ApprovalState.PendingApproval })));
      const s = store();

      s.load(PROJECT_ID);

      expect(s.headRound()).toBe(2);
      expect(s.isHeadRoundOutstanding()).toBe(true);
    });

    it('an edit that returns an Approved head to PendingApproval does NOT itself create a new trail row — round is unchanged until send()', () => {
      approvals.bySubject.mockReturnValue(of([trailItem({ round: 1 })]));
      api.getBrief.mockReturnValueOnce(of(head({ status: ApprovalState.Approved })));
      const s = store();
      s.load(PROJECT_ID);
      expect(s.headRound()).toBe(1);

      // Simulate the server's real behavior: editing flips status to PendingApproval but
      // the trail (fetched fresh on reload) still reports the SAME round — FR-009.
      api.getBrief.mockReturnValue(of(head({ status: ApprovalState.PendingApproval })));
      s.updateHead({ data: { unitType: 1, unitCondition: 1 } });

      expect(api.updateHead).toHaveBeenCalled();
      expect(s.headRound()).toBe(1); // unchanged — the round only moves on send()
      expect(s.isHeadRoundOutstanding()).toBe(true);
    });

    it('sendForConfirmation() is what advances the round (FR-009)', () => {
      approvals.bySubject.mockReturnValueOnce(of([trailItem({ round: 1 })]));
      api.getBrief.mockReturnValueOnce(of(head({ status: ApprovalState.Rejected })));
      const s = store();
      s.load(PROJECT_ID);
      expect(s.headRound()).toBe(1);

      approvals.bySubject.mockReturnValue(
        of([trailItem({ round: 1 }), trailItem({ id: 'appr-2', round: 2 })]),
      );
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
});
