import { TestBed } from '@angular/core/testing';
import { HttpTestingController, provideHttpClientTesting } from '@angular/common/http/testing';
import { provideHttpClient } from '@angular/common/http';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { HANDLED_ERROR_STATUSES } from '@platform/http/handled-errors';
import { environment } from '../../../../environments/environment';
import { ApprovalState } from '../model/crm-enums';
import type { BriefHead, BriefSpace } from '../model';
import { CrmBriefService } from './crm-brief.service';

describe('CrmBriefService', () => {
  let service: CrmBriefService;
  let http: HttpTestingController;

  beforeEach(() => {
    TestBed.configureTestingModule({
      providers: [provideHttpClient(), provideHttpClientTesting()],
    });
    service = TestBed.inject(CrmBriefService);
    http = TestBed.inject(HttpTestingController);
  });

  afterEach(() => http.verify());

  const url = (path: string) => `${environment.apiUrl}${path}`;

  /** `CrmDesignBriefResponse` (`BriefContracts.cs:38-40`): the head fields nest under `head`. */
  const wireBrief = {
    id: 'B',
    projectId: 'P',
    projectStageId: 'S',
    createdById: 'E',
    lastMeetingId: 'M',
    status: ApprovalState.PendingApproval,
    head: {
      unitType: 2,
      unitCondition: 3,
      address: '12 Nile St',
      areaSqm: 140,
      hiringReasons: 5,
      sector: 1,
      isRented: true,
    },
  };

  describe('getBriefByStage (009b #9) — one brief per stage', () => {
    it('GETs /api/crm/stages/{stageId}/brief and flattens id/status with head.*', () => {
      let head: BriefHead | undefined;
      service.getBriefByStage('S').subscribe((h) => (head = h));

      const req = http.expectOne(url('/crm/stages/S/brief'));
      expect(req.request.method).toBe('GET');
      req.flush(wireBrief);

      expect(head?.id).toBe('B');
      expect(head?.status).toBe(ApprovalState.PendingApproval);
      expect(head?.projectId).toBe('P');
      expect(head?.projectStageId).toBe('S');
      expect(head?.createdById).toBe('E');
      expect(head?.lastMeetingId).toBe('M');
      expect(head?.unitType).toBe(2);
      expect(head?.unitCondition).toBe(3);
      expect(head?.address).toBe('12 Nile St');
      expect(head?.hiringReasons).toBe(5);
      expect(head?.sector).toBe(1);
      expect(head?.isRented).toBe(true);
    });

    it('carries none of the retired head fields', () => {
      let head: BriefHead | undefined;
      service.getBriefByStage('S').subscribe((h) => (head = h));
      http.expectOne(url('/crm/stages/S/brief')).flush(wireBrief);

      for (const gone of [
        'createdAtUtc',
        'decisionMakerContactId',
        'utilityMetersNote',
        'parentsHobbies',
        'childrenHobbies',
        'hobbiesInDesign',
      ]) {
        expect(head).not.toHaveProperty(gone);
      }
    });
  });

  describe('createBrief (009b #10) — POST /api/crm/projects/{projectId}/brief', () => {
    it('posts { data, projectStageId } and emits the id read off the 201 { briefId } body', () => {
      let id: string | undefined;
      service
        .createBrief('P', { data: { unitType: 0, unitCondition: 2 }, projectStageId: 'S' })
        .subscribe((v) => (id = v));

      const req = http.expectOne(url('/crm/projects/P/brief'));
      expect(req.request.method).toBe('POST');
      expect(req.request.body).toEqual({
        data: { unitType: 0, unitCondition: 2 },
        projectStageId: 'S',
      });
      expect(req.request.context.get(HANDLED_ERROR_STATUSES)).toEqual([403]);
      req.flush({ briefId: 'B' }, { status: 201, statusText: 'Created' });

      expect(id).toBe('B');
    });
  });

  describe('getBrief (N-11, the obsolete project fallback)', () => {
    it('reads the same flattened CrmDesignBriefResponse off the project route', () => {
      let head: BriefHead | undefined;
      service.getBrief('P').subscribe((h) => (head = h));

      http.expectOne(url('/crm/projects/P/brief')).flush(wireBrief);

      expect(head?.id).toBe('B');
      expect(head?.status).toBe(ApprovalState.PendingApproval);
      expect(head?.unitType).toBe(2);
    });
  });

  describe('listSpaces (009b #11) — GET /api/crm/briefs/{briefId}/spaces', () => {
    const flushSpaces = (): void => {
      http.expectOne(url('/crm/projects/P/spaces')).flush([
        {
          id: 'SP1',
          projectId: 'P',
          spaceTypeId: 'st-1',
          name: 'Reception',
          description: null,
          sortOrder: 1,
          isActive: false,
        },
      ]);
      http.expectOne(url('/crm/space-types')).flush([
        {
          id: 'st-1',
          code: 'rec',
          nameEn: 'Reception',
          nameAr: 'استقبال',
          sortOrder: 1,
          isActive: true,
        },
      ]);
    };

    it('keeps the server order and isCurrent, and resolves space from the project spaces (inactive too)', () => {
      let entries: BriefSpace[] = [];
      service.listSpaces('B', 'P').subscribe((e) => (entries = e));

      const req = http.expectOne(url('/crm/briefs/B/spaces'));
      expect(req.request.method).toBe('GET');
      req.flush([
        {
          id: 'E2',
          briefId: 'B',
          spaceId: 'SP1',
          countOrPieces: 2,
          requirements: 'new',
          meetingId: null,
          approvalStatus: ApprovalState.Draft,
          supersedesSpaceId: 'E1',
          projectTaskId: null,
          createdById: 'emp',
          isCurrent: true,
        },
        {
          id: 'E1',
          briefId: 'B',
          spaceId: 'SP1',
          countOrPieces: null,
          requirements: 'old',
          meetingId: null,
          approvalStatus: ApprovalState.Approved,
          supersedesSpaceId: null,
          projectTaskId: null,
          createdById: 'emp',
          isCurrent: false,
        },
        {
          id: 'E0',
          briefId: 'B',
          spaceId: null,
          countOrPieces: null,
          requirements: 'general',
          meetingId: null,
          approvalStatus: ApprovalState.Draft,
          supersedesSpaceId: null,
          projectTaskId: null,
          createdById: 'emp',
          isCurrent: true,
        },
      ]);
      flushSpaces();

      expect(entries.map((e) => e.id)).toEqual(['E2', 'E1', 'E0']);
      expect(entries.map((e) => e.isCurrent)).toEqual([true, false, true]);
      expect(entries[0].spaceId).toBe('SP1');
      expect(entries[0].space?.name).toBe('Reception');
      expect(entries[0].space?.spaceType.nameEn).toBe('Reception');
      expect(entries[2].space).toBeNull();
      expect(entries[0]).not.toHaveProperty('createdAtUtc');
    });

    it('keeps an entry on an unresolvable space grouped by its id', () => {
      let entries: BriefSpace[] = [];
      service.listSpaces('B', 'P').subscribe((e) => (entries = e));

      http.expectOne(url('/crm/briefs/B/spaces')).flush([
        {
          id: 'E9',
          briefId: 'B',
          spaceId: 'SP-gone',
          approvalStatus: ApprovalState.Draft,
          createdById: 'emp',
          isCurrent: true,
        },
      ]);
      flushSpaces();

      expect(entries[0].space?.id).toBe('SP-gone');
      expect(entries[0].space?.name).toBe('');
    });
  });
});
