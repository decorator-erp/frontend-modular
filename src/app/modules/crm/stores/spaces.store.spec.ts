import { HttpErrorResponse } from '@angular/common/http';
import { TestBed } from '@angular/core/testing';
import { describe, expect, it, vi, beforeEach } from 'vitest';
import { of, throwError } from 'rxjs';
import { CrmBriefService } from '../data/crm-brief.service';
import { CrmLookupService } from '../data/crm-lookup.service';
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
    spaceId: KITCHEN.id,
    space: KITCHEN,
    countOrPieces: null,
    requirements: 'text',
    meetingId: null,
    approvalStatus: ApprovalState.Draft,
    supersedesSpaceId: null,
    projectTaskId: null,
    createdById: 'employee-1',
    isCurrent: true,
    ...over,
  };
}

describe('indexCurrentEntries', () => {
  // 009b #11: entries arrive newest first and carry no createdAtUtc — the server order decides.
  it('keeps the NEWEST entry for a space (the first in the server order)', () => {
    const newer = entry({ id: 'b' });
    const older = entry({ id: 'a' });
    expect(indexCurrentEntries([newer, older])[KITCHEN.id].id).toBe('b');
  });

  it('skips an entry the server marks isCurrent: false, wherever it is listed', () => {
    const stale = entry({ id: 'a', isCurrent: false });
    const live = entry({ id: 'b' });
    expect(indexCurrentEntries([stale, live])[KITCHEN.id].id).toBe('b');
  });

  it('excludes an entry that a newer one supersedes, even when it is listed first', () => {
    // The correction chains BACK to the original; the original is history, not current.
    const original = entry({ id: 'old' });
    const correction = entry({ id: 'new', supersedesSpaceId: 'old' });
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
  };
}

function briefApiMock() {
  return {
    getBrief: vi.fn().mockReturnValue(of({ id: 'brief-1' })),
    listSpaces: vi.fn().mockReturnValue(of([])),
    addSpace: vi.fn().mockReturnValue(of('id')),
    updateSpace: vi.fn().mockReturnValue(of(undefined)),
  };
}

describe('SpacesStore', () => {
  let spacesApi: ReturnType<typeof spacesApiMock>;
  let briefApi: ReturnType<typeof briefApiMock>;

  beforeEach(() => {
    spacesApi = spacesApiMock();
    briefApi = briefApiMock();
    TestBed.configureTestingModule({
      providers: [
        SpacesStore,
        { provide: CrmSpaceService, useValue: spacesApi },
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
  });

  describe('setProject() (B1)', () => {
    it('sets the project WITHOUT fetching — the provisioning page must stay bounded', () => {
      const s = store();
      s.setProject(PROJECT_ID);
      expect(spacesApi.list).not.toHaveBeenCalled();
      expect(briefApi.getBrief).not.toHaveBeenCalled();
    });
  });

  describe('saveSpaceNote() (A4)', () => {
    it('does not strand savingSpace when the entry is Approved', () => {
      briefApi.listSpaces.mockReturnValue(of([entry({ approvalStatus: ApprovalState.Approved })]));
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
      briefApi.listSpaces.mockReturnValue(of([entry({ approvalStatus: ApprovalState.Draft })]));
      const s = store();
      s.load(PROJECT_ID);

      s.saveSpaceNote(SPACE, 'updated');

      expect(briefApi.updateSpace).toHaveBeenCalled();
      expect(s.savingSpace()).toBe(false);
    });

    it('keeps the entry count, meeting and task on an in-place edit (FINDING-5-4)', () => {
      // `CrmBriefSpace.Update` overwrites all five fields, so omitted ones would be nulled.
      briefApi.listSpaces.mockReturnValue(
        of([entry({ countOrPieces: 3, meetingId: 'meeting-1', projectTaskId: 'task-1' })]),
      );
      const s = store();
      s.load(PROJECT_ID);

      s.saveSpaceNote(SPACE, 'updated');

      expect(briefApi.updateSpace).toHaveBeenCalledWith('entry-1', {
        spaceId: SPACE.id,
        countOrPieces: 3,
        requirements: 'updated',
        meetingId: 'meeting-1',
        projectTaskId: 'task-1',
      });
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
  });

  // 009b #N-5: no /crm/spaces/{id}/items* or /completeness route exists on the backend.
  describe('space board (009b #N-5)', () => {
    it('has no board, completeness or board mutation', () => {
      const s = store() as unknown as Record<string, unknown>;
      for (const name of [
        'board',
        'completeness',
        'incompleteSpaceIds',
        'boardBySpace',
        'completenessBySpace',
        'mutatingBySpace',
        'addItem',
        'addCustomItem',
        'promoteItem',
        'setItemStatus',
        'setItemAttributes',
        'removeItem',
      ]) {
        expect(s[name], name).toBeUndefined();
      }
    });

    it('loads the registry without reading any board', () => {
      const s = store();
      s.load(PROJECT_ID);
      expect(s.spaces()).toEqual([SPACE]);
      expect(s.loading()).toBe(false);
    });
  });

  // 009b #N-6: no reorder, delete or provisioning route (EP/CrmSpaceEndpoints.cs:25-71).
  it('has no reorder, delete or provisioning (009b #N-6)', () => {
    const s = store() as unknown as Record<string, unknown>;
    for (const name of [
      'reorderSpace',
      'deleteSpace',
      'loadProvisioning',
      'loadProvisioningSummary',
      'provisioning',
      'provisioningSummary',
    ]) {
      expect(s[name], name).toBeUndefined();
    }
  });
});
