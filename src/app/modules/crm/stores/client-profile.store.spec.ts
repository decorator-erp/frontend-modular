import { TestBed } from '@angular/core/testing';
import { describe, expect, it, vi, beforeEach } from 'vitest';
import { HttpErrorResponse } from '@angular/common/http';
import { NEVER, of, throwError } from 'rxjs';
import { CrmClientPortalService } from '../data/crm-portal.service';
import { ContactRole } from '../model/crm-enums';
import type { ClientProfile } from '../model';
import { ClientProfileStore } from './client-profile.store';

function profile(over: Partial<ClientProfile> = {}): ClientProfile {
  return {
    client: {
      id: 'client-1',
      name: 'Ahmed Mansour',
      email: null,
      firstName: 'Ahmed',
      lastName: 'Mansour',
      phoneNumber: null,
      address: null,
    },
    contacts: [
      {
        id: 'c1',
        firstName: 'Ahmed',
        lastName: 'Mansour',
        email: null,
        phone: null,
        mobile: null,
        role: ContactRole.Owner,
        isPrimary: true,
      },
    ],
    projects: [
      {
        id: 'p1',
        code: 'PRJ-1',
        name: 'Villa',
        status: 'InProgress',
        activeStageId: null,
        activeStageName: null,
        progressPercentage: 40,
        openPeriodId: 'period-1',
      },
    ],
    ...over,
  };
}

function apiMock() {
  return { getMyProfile: vi.fn().mockReturnValue(of(profile())) };
}

describe('ClientProfileStore', () => {
  let api: ReturnType<typeof apiMock>;

  beforeEach(() => {
    api = apiMock();
    TestBed.configureTestingModule({
      providers: [ClientProfileStore, { provide: CrmClientPortalService, useValue: api }],
    });
  });

  const store = () => TestBed.inject(ClientProfileStore);

  it('loads the client, contacts, and projects', () => {
    const s = store();
    s.load();
    expect(s.client()?.firstName).toBe('Ahmed');
    expect(s.contacts()).toHaveLength(1);
    expect(s.projects()).toHaveLength(1);
    expect(s.loading()).toBe(false);
    expect(s.loaded()).toBe(true);
  });

  it('sets loading true while in flight', () => {
    api.getMyProfile.mockReturnValueOnce(NEVER);
    const s = store();
    s.load();
    expect(s.loading()).toBe(true);
  });

  it('surfaces a catalog KEY on failure, not raw prose — Dependency 13 is not yet shipped', () => {
    api.getMyProfile.mockReturnValue(throwError(() => new Error('404')));
    const s = store();
    s.load();
    expect(s.error()).toBe('client.profileUnavailable');
    expect(s.loading()).toBe(false);
    expect(s.loaded()).toBe(true);
  });

  it('crmp C-2: a 404 (no linked client) reads client.profileNoClient', () => {
    api.getMyProfile.mockReturnValue(
      throwError(
        () =>
          new HttpErrorResponse({
            status: 404,
            error: { errors: { 'crm.portal.NotFound': ['x'] } },
          }),
      ),
    );
    const s = store();
    s.load();
    expect(s.error()).toBe('client.profileNoClient');
  });

  it('crmp C-2: a 403 (not a client login) reads client.profileNotClient', () => {
    api.getMyProfile.mockReturnValue(
      throwError(
        () =>
          new HttpErrorResponse({
            status: 403,
            error: { errors: { 'crm.portal.NotAClient': ['x'] } },
          }),
      ),
    );
    const s = store();
    s.load();
    expect(s.error()).toBe('client.profileNotClient');
  });

  it('crmp C-2: a 500 reads client.profileUnavailable and load() retries', () => {
    api.getMyProfile.mockReturnValueOnce(throwError(() => new HttpErrorResponse({ status: 500 })));
    const s = store();
    s.load();
    expect(s.error()).toBe('client.profileUnavailable');
    s.load();
    expect(s.error()).toBeNull();
    expect(s.projects()).toHaveLength(1);
  });

  it('does not re-enter while already loading', () => {
    api.getMyProfile.mockReturnValueOnce(NEVER);
    const s = store();
    s.load();
    s.load();
    expect(api.getMyProfile).toHaveBeenCalledTimes(1);
  });

  describe('derived selectors', () => {
    it('isSingleProject is true for exactly one project', () => {
      const s = store();
      s.load();
      expect(s.isSingleProject()).toBe(true);
    });

    it('isSingleProject is false for several projects', () => {
      api.getMyProfile.mockReturnValue(
        of(
          profile({
            projects: [
              {
                id: 'p1',
                code: 'PRJ-1',
                name: 'Villa',
                status: 'InProgress',
                activeStageId: null,
                activeStageName: null,
                progressPercentage: 0,
                openPeriodId: null,
              },
              {
                id: 'p2',
                code: 'PRJ-2',
                name: 'Chalet',
                status: 'InProgress',
                activeStageId: null,
                activeStageName: null,
                progressPercentage: 0,
                openPeriodId: null,
              },
            ],
          }),
        ),
      );
      const s = store();
      s.load();
      expect(s.isSingleProject()).toBe(false);
    });

    it('primaryContact picks the isPrimary=true contact', () => {
      api.getMyProfile.mockReturnValue(
        of(
          profile({
            contacts: [
              {
                id: 'c1',
                firstName: 'A',
                lastName: 'B',
                email: null,
                phone: null,
                mobile: null,
                role: ContactRole.Spouse,
                isPrimary: false,
              },
              {
                id: 'c2',
                firstName: 'C',
                lastName: 'D',
                email: null,
                phone: null,
                mobile: null,
                role: ContactRole.Owner,
                isPrimary: true,
              },
            ],
          }),
        ),
      );
      const s = store();
      s.load();
      expect(s.primaryContact()?.id).toBe('c2');
    });

    it('primaryContact is null when no contact is primary', () => {
      api.getMyProfile.mockReturnValue(
        of(
          profile({
            contacts: [
              {
                id: 'c1',
                firstName: 'A',
                lastName: 'B',
                email: null,
                phone: null,
                mobile: null,
                role: ContactRole.Spouse,
                isPrimary: false,
              },
            ],
          }),
        ),
      );
      const s = store();
      s.load();
      expect(s.primaryContact()).toBeNull();
    });
  });
});
