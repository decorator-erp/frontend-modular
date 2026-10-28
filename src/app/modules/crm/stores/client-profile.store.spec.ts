import { TestBed } from '@angular/core/testing';
import { describe, expect, it, vi, beforeEach } from 'vitest';
import { NEVER, of, throwError } from 'rxjs';
import { CrmClientPortalService } from '../data/crm-portal.service';
import { ContactRole } from '../model/crm-enums';
import type { ClientProfile } from '../model';
import { ClientProfileStore } from './client-profile.store';

function profile(over: Partial<ClientProfile> = {}): ClientProfile {
  return {
    client: {
      id: 'client-1',
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
        productOwnerName: 'Nourhan',
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
                productOwnerName: null,
                progressPercentage: 0,
                openPeriodId: null,
              },
              {
                id: 'p2',
                code: 'PRJ-2',
                name: 'Chalet',
                status: 'InProgress',
                productOwnerName: null,
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
