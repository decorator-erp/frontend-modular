import { TestBed } from '@angular/core/testing';
import { describe, expect, it, vi, beforeEach } from 'vitest';
import { NEVER, of, throwError } from 'rxjs';
import { CrmItemService, isClientAuthoredItem } from '../data/crm-item.service';
import { ApprovalState, RequirementCategory, RequirementPriority } from '../model/crm-enums';
import type { RequirementItem } from '../model';
import { isLocked } from '../ui/trust/trust-chip';
import { ItemsStore } from './items.store';

const PROJECT_ID = 'project-1';

function item(over: Partial<RequirementItem> = {}): RequirementItem {
  return {
    id: 'item-1',
    projectId: PROJECT_ID,
    periodId: 'period-1',
    category: RequirementCategory.SpaceLayout,
    spaceTypeId: null,
    room: 'Kitchen',
    title: 'Open kitchen',
    details: null,
    priority: RequirementPriority.Medium,
    sourceType: null,
    meetingId: null,
    briefId: null,
    noteId: null,
    approvalStatus: ApprovalState.Draft,
    supersedesItemId: null,
    createdByEmployeeId: 'employee-1',
    createdByContactId: null,
    projectTaskId: null,
    ...over,
  };
}

function apiMock() {
  return {
    listByProject: vi.fn().mockReturnValue(of([item()])),
    portalSearch: vi.fn().mockReturnValue(of([item()])),
    create: vi.fn().mockReturnValue(of('new-id')),
    update: vi.fn().mockReturnValue(of(undefined)),
    send: vi.fn().mockReturnValue(of(undefined)),
    supersede: vi.fn().mockReturnValue(of('new-id')),
    portalCreate: vi.fn().mockReturnValue(of('new-id')),
  };
}

describe('ItemsStore', () => {
  let api: ReturnType<typeof apiMock>;

  beforeEach(() => {
    api = apiMock();
    TestBed.configureTestingModule({
      providers: [ItemsStore, { provide: CrmItemService, useValue: api }],
    });
  });

  const store = () => TestBed.inject(ItemsStore);

  describe('load()', () => {
    it('fetches items for the project', () => {
      const s = store();
      s.load(PROJECT_ID);
      expect(api.listByProject).toHaveBeenCalledWith(PROJECT_ID);
      expect(s.items()).toHaveLength(1);
    });

    it('sets loading true while in flight', () => {
      api.listByProject.mockReturnValueOnce(NEVER);
      const s = store();
      s.load(PROJECT_ID);
      expect(s.loading()).toBe(true);
    });

    it('surfaces a friendly error on failure', () => {
      api.listByProject.mockReturnValue(throwError(() => new Error('boom')));
      const s = store();
      s.load(PROJECT_ID);
      expect(s.error()).toBe('Could not load requirement items.');
    });
  });

  describe('FR-012 — the client-authored asymmetry', () => {
    it('a client-authored item lands NotRequired and is recognized as client-authored', () => {
      const clientItem = item({
        id: 'client-item',
        approvalStatus: ApprovalState.NotRequired,
        createdByEmployeeId: null,
        createdByContactId: 'contact-1',
      });
      expect(isClientAuthoredItem(clientItem)).toBe(true);
      expect(clientItem.approvalStatus).not.toBe(ApprovalState.Draft);
      expect(clientItem.approvalStatus).not.toBe(ApprovalState.PendingApproval);
    });

    it('an employee-authored item is never recognized as client-authored', () => {
      const employeeItem = item({ createdByEmployeeId: 'employee-1', createdByContactId: null });
      expect(isClientAuthoredItem(employeeItem)).toBe(false);
    });

    it('a client-authored item is locked (trusted on arrival) regardless of its raw status', () => {
      const clientItem = item({ createdByContactId: 'contact-1', createdByEmployeeId: null });
      expect(isLocked(clientItem.approvalStatus, isClientAuthoredItem(clientItem))).toBe(true);
    });
  });

  describe('groupedByCategory (FR-024a)', () => {
    it('groups items by category, current and superseded together', () => {
      const layout = item({ id: 's1', category: RequirementCategory.SpaceLayout });
      const style = item({ id: 's2', category: RequirementCategory.Style });
      const supersededLayout = item({
        id: 's3',
        category: RequirementCategory.SpaceLayout,
        approvalStatus: ApprovalState.NotRequired,
      });
      const newLayout = item({
        id: 's4',
        category: RequirementCategory.SpaceLayout,
        supersedesItemId: 's3',
      });
      api.listByProject.mockReturnValue(of([layout, style, supersededLayout, newLayout]));
      const s = store();

      s.load(PROJECT_ID);

      const groups = s.groupedByCategory();
      const layoutGroup = groups.find((g) => g.category === RequirementCategory.SpaceLayout);
      expect(layoutGroup?.items.map((i) => i.id).sort()).toEqual(['s1', 's3', 's4']);
      expect(s.isSuperseded()(supersededLayout)).toBe(true);
      expect(s.isSuperseded()(newLayout)).toBe(false);
    });
  });

  describe('supersede()', () => {
    it('a locked item is corrected via supersede, which reloads on success', () => {
      const s = store();
      s.load(PROJECT_ID);
      api.listByProject.mockClear();

      s.supersede('item-1', {
        category: RequirementCategory.SpaceLayout,
        title: 'Open kitchen (revised)',
        priority: RequirementPriority.Medium,
      });

      expect(api.supersede).toHaveBeenCalledWith(
        'item-1',
        expect.objectContaining({ title: 'Open kitchen (revised)' }),
      );
      expect(api.listByProject).toHaveBeenCalledWith(PROJECT_ID);
    });
  });

  describe('create() (009b #22)', () => {
    it('creates on the period and reloads the project carried by the request', () => {
      const s = store();

      s.create('period-1', {
        projectId: PROJECT_ID,
        category: RequirementCategory.Furniture,
        title: 'Reading nook',
        priority: RequirementPriority.Low,
      });

      expect(api.create).toHaveBeenCalledWith(
        'period-1',
        expect.objectContaining({ projectId: PROJECT_ID }),
      );
      expect(api.listByProject).toHaveBeenCalledWith(PROJECT_ID);
    });
  });

  describe('portal methods', () => {
    it('portalCreate calls the api and reloads the portal list for that project', () => {
      const s = store();

      s.portalCreate({
        projectId: PROJECT_ID,
        periodId: 'period-1',
        category: RequirementCategory.Furniture,
        title: 'Reading nook',
        priority: RequirementPriority.Low,
      });

      expect(api.portalCreate).toHaveBeenCalled();
      expect(api.portalSearch).toHaveBeenCalledWith(PROJECT_ID);
    });
  });
});
