import { HttpErrorResponse } from '@angular/common/http';
import { TestBed } from '@angular/core/testing';
import { describe, expect, it, vi, beforeEach } from 'vitest';
import { of, throwError } from 'rxjs';
import { CrmBriefService } from '../data/crm-brief.service';
import { CrmLookupService } from '../data/crm-lookup.service';
import { CrmSpaceItemService } from '../data/crm-space-item.service';
import { CrmSpaceService } from '../data/crm-space.service';
import { ApprovalState } from '../model/crm-enums';
import type { BriefSpace, BriefSpaceRef, CrmSpace, CrmSpaceType } from '../model';
import { SpacesStore, indexCurrentEntries } from './spaces.store';

const PROJECT_ID = 'project-1';

const KITCHEN_TYPE: CrmSpaceType = {
  id: 'st-kitchen',
  code: 'kitchen',
  nameEn: 'Kitchen',
  nameAr: 'المطبخ',
};
const KITCHEN: BriefSpaceRef = { id: 'space-kitchen', name: 'Kitchen', spaceType: KITCHEN_TYPE };
const SPACE: CrmSpace = {
  id: 'space-kitchen',
  projectId: PROJECT_ID,
  spaceType: KITCHEN_TYPE,
  name: 'Kitchen',
  sortOrder: 0,
  isActive: true,
  description: null,
};

function entry(over: Partial<BriefSpace> = {}): BriefSpace {
  return {
    id: 'entry-1',
    briefId: 'brief-1',
    space: KITCHEN,
    countOrPieces: null,
    requirements: 'text',
    meetingId: null,
    approvalStatus: ApprovalState.Draft,
    supersedesSpaceId: null,
    projectTaskId: null,
    createdById: 'employee-1',
    createdAtUtc: '2026-07-01T00:00:00.000Z',
    ...over,
  };
}

describe('indexCurrentEntries', () => {
  it('keeps the NEWEST entry for a space', () => {
    const older = entry({ id: 'a', createdAtUtc: '2026-07-01T00:00:00.000Z' });
    const newer = entry({ id: 'b', createdAtUtc: '2026-07-05T00:00:00.000Z' });
    expect(indexCurrentEntries([older, newer])[KITCHEN.id].id).toBe('b');
  });

  it('is order-independent — the newest wins even when listed first', () => {
    const older = entry({ id: 'a', createdAtUtc: '2026-07-01T00:00:00.000Z' });
    const newer = entry({ id: 'b', createdAtUtc: '2026-07-05T00:00:00.000Z' });
    expect(indexCurrentEntries([newer, older])[KITCHEN.id].id).toBe('b');
  });

  it('excludes an entry that a newer one supersedes, even if it is the most recent by date', () => {
    // The correction chains BACK to the original; the original is history, not current.
    const original = entry({ id: 'old', createdAtUtc: '2026-07-09T00:00:00.000Z' });
    const correction = entry({
      id: 'new',
      createdAtUtc: '2026-07-02T00:00:00.000Z',
      supersedesSpaceId: 'old',
    });
    expect(indexCurrentEntries([original, correction])[KITCHEN.id].id).toBe('new');
  });

  it('ignores general (null-space) entries — they belong to no room', () => {
    expect(indexCurrentEntries([entry({ id: 'general', space: null })])).toEqual({});
  });

  it('indexes each space independently', () => {
    const other: BriefSpaceRef = {
      id: 'space-bath',
      name: 'Bath',
      spaceType: { id: 'st-bath', code: 'bath', nameEn: 'Bath', nameAr: 'حمام' },
    };
    const result = indexCurrentEntries([entry({ id: 'k' }), entry({ id: 'b', space: other })]);
    expect(Object.keys(result).sort()).toEqual(['space-bath', 'space-kitchen']);
  });
});

/**
 * A 409 carrying a domain code. The key MUST start lowercase — `ErrorHandlerService`
 * separates domain codes from field names with `/^[a-z]/`, so `Crm.Spaces.NameTaken`
 * would parse as a field error and leave `code` null, quietly passing a weaker test.
 */
function domainError(code: string): HttpErrorResponse {
  return new HttpErrorResponse({ status: 409, error: { errors: { [code]: ['conflict'] } } });
}

function spacesApiMock() {
  return {
    list: vi.fn().mockReturnValue(of([SPACE])),
    create: vi.fn().mockReturnValue(of('new-id')),
    update: vi.fn().mockReturnValue(of(undefined)),
    setActive: vi.fn().mockReturnValue(of(undefined)),
    remove: vi.fn().mockReturnValue(of(undefined)),
    reorder: vi.fn().mockReturnValue(of(undefined)),
    provisioning: vi.fn().mockReturnValue(of([])),
    provisioningSummary: vi.fn().mockReturnValue(of([])),
  };
}

function itemsApiMock() {
  return {
    list: vi.fn().mockReturnValue(of([])),
    completeness: vi.fn().mockReturnValue(of({ spaceId: SPACE.id, isComplete: true })),
    add: vi.fn().mockReturnValue(of('id')),
    promote: vi.fn().mockReturnValue(of(undefined)),
    setStatus: vi.fn().mockReturnValue(of(undefined)),
    setAttributes: vi.fn().mockReturnValue(of(undefined)),
    remove: vi.fn().mockReturnValue(of(undefined)),
  };
}

function briefApiMock() {
  return {
    getBrief: vi.fn().mockReturnValue(of({ head: { id: 'brief-1' }, spaces: [] })),
    addSpace: vi.fn().mockReturnValue(of('id')),
    updateSpace: vi.fn().mockReturnValue(of(undefined)),
  };
}

describe('SpacesStore', () => {
  let spacesApi: ReturnType<typeof spacesApiMock>;
  let itemsApi: ReturnType<typeof itemsApiMock>;
  let briefApi: ReturnType<typeof briefApiMock>;

  beforeEach(() => {
    spacesApi = spacesApiMock();
    itemsApi = itemsApiMock();
    briefApi = briefApiMock();
    TestBed.configureTestingModule({
      providers: [
        SpacesStore,
        { provide: CrmSpaceService, useValue: spacesApi },
        { provide: CrmSpaceItemService, useValue: itemsApi },
        { provide: CrmBriefService, useValue: briefApi },
        { provide: CrmLookupService, useValue: { spaceTypes: vi.fn().mockReturnValue(of([])) } },
      ],
    });
  });

  const store = () => TestBed.inject(SpacesStore);

  describe('error handling (Group A)', () => {
    it('patches a catalog KEY, not English prose, so the message translates', () => {
      spacesApi.list.mockReturnValue(throwError(() => new Error('boom')));
      const s = store();
      s.load(PROJECT_ID);
      expect(s.error()).toBe('space.loadFailed');
    });

    it('reports a failed board read against its own key', () => {
      itemsApi.list.mockReturnValue(throwError(() => new Error('boom')));
      const s = store();
      s.load(PROJECT_ID);
      expect(s.error()).toBe('space.boardLoadFailed');
    });
  });

  describe('setProject() (B1)', () => {
    it('sets the project WITHOUT fetching — the provisioning page must stay bounded', () => {
      const s = store();
      s.setProject(PROJECT_ID);
      expect(spacesApi.list).not.toHaveBeenCalled();
      expect(briefApi.getBrief).not.toHaveBeenCalled();
      expect(itemsApi.list).not.toHaveBeenCalled();
    });

    it('is enough for loadProvisioning to work', () => {
      const s = store();
      s.setProject(PROJECT_ID);
      s.loadProvisioning();
      expect(spacesApi.provisioning).toHaveBeenCalledWith(PROJECT_ID, undefined);
    });
  });

  describe('saveSpaceNote() (A4)', () => {
    it('does not strand savingSpace when the entry is Approved', () => {
      briefApi.getBrief.mockReturnValue(
        of({
          head: { id: 'brief-1' },
          spaces: [entry({ approvalStatus: ApprovalState.Approved })],
        }),
      );
      const s = store();
      s.load(PROJECT_ID);

      s.saveSpaceNote(SPACE, 'ignored');

      // No request is issued (the caller opens the supersede modal instead), so the flag
      // must never have been raised — otherwise Save, create and rename all wedge.
      expect(briefApi.updateSpace).not.toHaveBeenCalled();
      expect(briefApi.addSpace).not.toHaveBeenCalled();
      expect(s.savingSpace()).toBe(false);
    });

    it('edits a Draft entry in place and clears the flag', () => {
      briefApi.getBrief.mockReturnValue(
        of({ head: { id: 'brief-1' }, spaces: [entry({ approvalStatus: ApprovalState.Draft })] }),
      );
      const s = store();
      s.load(PROJECT_ID);

      s.saveSpaceNote(SPACE, 'updated');

      expect(briefApi.updateSpace).toHaveBeenCalled();
      expect(s.savingSpace()).toBe(false);
    });

    it('creates an entry preset to the space when none exists', () => {
      const s = store();
      s.load(PROJECT_ID);
      s.saveSpaceNote(SPACE, 'first note');
      expect(briefApi.addSpace).toHaveBeenCalledWith(
        'brief-1',
        expect.objectContaining({ spaceId: SPACE.id }),
      );
    });

    it('surfaces a translated key and clears the flag on failure', () => {
      briefApi.addSpace.mockReturnValue(throwError(() => new Error('boom')));
      const s = store();
      s.load(PROJECT_ID);
      s.saveSpaceNote(SPACE, 'note');
      expect(s.error()).toBe('space.noteSaveFailed');
      expect(s.savingSpace()).toBe(false);
    });
  });

  describe('mutation handlers (D1)', () => {
    it('calls onDone and refetches the registry after a create', () => {
      const s = store();
      s.setProject(PROJECT_ID);
      const onDone = vi.fn();

      s.createSpace({ spaceTypeId: KITCHEN_TYPE.id, name: 'Bath' }, { onDone });

      expect(onDone).toHaveBeenCalledOnce();
      expect(spacesApi.list).toHaveBeenCalledWith(PROJECT_ID);
      expect(s.savingSpace()).toBe(false);
    });

    it('hands onError the PARSED error so a caller can name the reason', () => {
      spacesApi.create.mockReturnValue(throwError(() => domainError('crm.spaces.NameTaken')));
      const s = store();
      s.setProject(PROJECT_ID);
      const onError = vi.fn();

      s.createSpace({ spaceTypeId: KITCHEN_TYPE.id, name: 'Kitchen' }, { onError });

      expect(onError).toHaveBeenCalledWith(
        expect.objectContaining({ code: 'crm.spaces.NameTaken' }),
        'space.saveFailed',
      );
      expect(s.error()).toBe('space.saveFailed');
      expect(s.savingSpace()).toBe(false);
    });

    it('threads handlers through a rename too', () => {
      spacesApi.update.mockReturnValue(throwError(() => domainError('crm.spaces.NameTaken')));
      const s = store();
      const onError = vi.fn();

      s.renameSpace(SPACE.id, { spaceTypeId: KITCHEN_TYPE.id, name: 'Kitchen' }, { onError });

      expect(onError).toHaveBeenCalledWith(
        expect.objectContaining({ code: 'crm.spaces.NameTaken' }),
        'space.saveFailed',
      );
      expect(s.savingSpace()).toBe(false);
    });

    it('refetches the board and reports done after an item is added', () => {
      const s = store();
      s.setProject(PROJECT_ID);
      itemsApi.list.mockClear();
      const onDone = vi.fn();

      s.addItem(SPACE.id, { catalogNodeId: 'node-1' }, { onDone });

      expect(onDone).toHaveBeenCalledOnce();
      expect(itemsApi.list).toHaveBeenCalledWith(SPACE.id);
      expect(itemsApi.completeness).toHaveBeenCalledWith(SPACE.id);
      expect(s.mutatingBySpace()[SPACE.id]).toBe(false);
    });

    it('gives the picker a per-row reason instead of swallowing the error', () => {
      // `mutateBoard` used to discard `err` entirely, so a row could only ever say
      // "something failed" — the picker needs the code to name which rule was broken.
      itemsApi.add.mockReturnValue(throwError(() => domainError('crm.spaces.ItemAlreadyRecorded')));
      const s = store();
      const onError = vi.fn();

      s.addItem(SPACE.id, { catalogNodeId: 'node-1' }, { onError });

      expect(onError).toHaveBeenCalledWith(
        expect.objectContaining({ code: 'crm.spaces.ItemAlreadyRecorded' }),
        'space.itemSaveFailed',
      );
      expect(s.error()).toBe('space.itemSaveFailed');
      expect(s.mutatingBySpace()[SPACE.id]).toBe(false);
    });

    it('threads handlers through setItemAttributes', () => {
      const s = store();
      const onDone = vi.fn();
      s.setItemAttributes(SPACE.id, 'item-1', { values: [] }, { onDone });
      expect(itemsApi.setAttributes).toHaveBeenCalledWith(SPACE.id, 'item-1', { values: [] });
      expect(onDone).toHaveBeenCalledOnce();
    });

    it('addItem on the CUSTOM path calls the api with customName/customCategoryId, no catalogNodeId', () => {
      const s = store();
      const onDone = vi.fn();

      s.addItem(
        SPACE.id,
        { customName: 'Vintage lamp', customCategoryId: 'cat-lighting' },
        { onDone },
      );

      expect(itemsApi.add).toHaveBeenCalledWith(SPACE.id, {
        customName: 'Vintage lamp',
        customCategoryId: 'cat-lighting',
      });
      expect(onDone).toHaveBeenCalledOnce();
    });

    it('addCustomItem assembles the union for the caller and refetches the board', () => {
      const s = store();
      s.setProject(PROJECT_ID);
      itemsApi.list.mockClear();
      const onDone = vi.fn();

      s.addCustomItem(SPACE.id, 'cat-lighting', 'Vintage lamp', { onDone });

      expect(itemsApi.add).toHaveBeenCalledWith(SPACE.id, {
        customName: 'Vintage lamp',
        customCategoryId: 'cat-lighting',
      });
      expect(itemsApi.list).toHaveBeenCalledWith(SPACE.id);
      expect(onDone).toHaveBeenCalledOnce();
    });

    it('addCustomItem surfaces CustomNameRequired to the caller via onError', () => {
      itemsApi.add.mockReturnValue(throwError(() => domainError('crm.catalog.CustomNameRequired')));
      const s = store();
      const onError = vi.fn();

      s.addCustomItem(SPACE.id, 'cat-lighting', '', { onError });

      expect(onError).toHaveBeenCalledWith(
        expect.objectContaining({ code: 'crm.catalog.CustomNameRequired' }),
        'space.itemSaveFailed',
      );
      expect(s.mutatingBySpace()[SPACE.id]).toBe(false);
    });

    it('promoteItem calls promote with the target catalogItemId and refetches on success', () => {
      const s = store();
      s.setProject(PROJECT_ID);
      itemsApi.list.mockClear();
      const onDone = vi.fn();

      s.promoteItem(SPACE.id, 'row-1', 'item-9', { onDone });

      expect(itemsApi.promote).toHaveBeenCalledWith(SPACE.id, 'row-1', { catalogItemId: 'item-9' });
      expect(itemsApi.list).toHaveBeenCalledWith(SPACE.id);
      expect(itemsApi.completeness).toHaveBeenCalledWith(SPACE.id);
      expect(onDone).toHaveBeenCalledOnce();
    });

    it('promoteItem surfaces PromotionCategoryMismatch on failure, without refetching', () => {
      itemsApi.promote.mockReturnValue(
        throwError(() => domainError('crm.catalog.PromotionCategoryMismatch')),
      );
      const s = store();
      itemsApi.list.mockClear();
      const onError = vi.fn();

      s.promoteItem(SPACE.id, 'row-1', 'item-9', { onError });

      expect(onError).toHaveBeenCalledWith(
        expect.objectContaining({ code: 'crm.catalog.PromotionCategoryMismatch' }),
        'space.itemSaveFailed',
      );
      expect(itemsApi.list).not.toHaveBeenCalled();
      expect(s.mutatingBySpace()[SPACE.id]).toBe(false);
    });

    it('setItemAttributes on a CUSTOM row short-circuits with AttributeNotApplicable, no network call', () => {
      itemsApi.list.mockReturnValue(
        of([
          {
            id: 'row-1',
            spaceId: SPACE.id,
            catalogItemId: null,
            nodeNameEn: 'Vintage lamp',
            nodeNameAr: 'Vintage lamp',
            imageUri: null,
            isPurchasable: true,
            path: [],
            status: 1,
            note: null,
            sourceBriefSpaceId: null,
            attributes: [],
            isCustom: true,
            customName: 'Vintage lamp',
            customCategoryId: 'cat-lighting',
            trackKey: 'row-1',
          },
        ]),
      );
      const s = store();
      s.load(PROJECT_ID);
      itemsApi.setAttributes.mockClear();
      const onError = vi.fn();

      s.setItemAttributes(SPACE.id, 'row-1', { values: [] }, { onError });

      expect(itemsApi.setAttributes).not.toHaveBeenCalled();
      expect(onError).toHaveBeenCalledWith(
        expect.objectContaining({ code: 'crm.catalog.AttributeNotApplicable' }),
        'space.attrNotApplicable',
      );
      expect(s.error()).toBe('space.attrNotApplicable');
    });
  });
});
