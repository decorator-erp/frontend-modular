import { TestBed } from '@angular/core/testing';
import { HttpTestingController, provideHttpClientTesting } from '@angular/common/http/testing';
import { provideHttpClient } from '@angular/common/http';
import { describe, expect, it, beforeEach, afterEach } from 'vitest';
import { RequirementCategory } from '../model/crm-enums';
import type { ClientDesignProfile } from '../model';
import { environment } from '../../../../environments/environment';
import { CrmDesignProfileService } from './crm-design-profile.service';

describe('CrmDesignProfileService', () => {
  let service: CrmDesignProfileService;
  let http: HttpTestingController;

  beforeEach(() => {
    TestBed.configureTestingModule({
      providers: [CrmDesignProfileService, provideHttpClient(), provideHttpClientTesting()],
    });
    service = TestBed.inject(CrmDesignProfileService);
    http = TestBed.inject(HttpTestingController);
  });

  afterEach(() => http.verify());

  const url = (path: string) => `${environment.apiUrl}${path}`;

  it('normalizes the full profile, including a null briefHead (T124 — nothing approved yet)', () => {
    let profile: ClientDesignProfile | undefined;
    service.getFor('project-1').subscribe((p) => (profile = p));

    http.expectOne(url('/crm/projects/project-1/design-profile')).flush({
      projectId: 'project-1',
      client: {
        clientId: 'client-1',
        fullName: 'Ahmed Mansour',
        jobTitle: 'Engineer',
        maritalStatus: 'Married',
        address: 'Villa Kafr El-Sheikh',
        children: [{ gender: 'M', age: 8 }],
      },
      primaryContact: null,
      briefHead: null,
      spaces: [],
      itemsByCategory: {},
      attachments: [],
    });

    expect(profile?.client.fullName).toBe('Ahmed Mansour');
    expect(profile?.client.children).toEqual([{ gender: 'M', age: 8 }]);
    expect(profile?.primaryContact).toBeNull();
    expect(profile?.briefHead).toBeNull();
  });

  it('never carries an expectedBudget-shaped field — the wire has none to normalize (FR-018)', () => {
    let profile: ClientDesignProfile | undefined;
    service.getFor('project-1').subscribe((p) => (profile = p));

    http.expectOne(url('/crm/projects/project-1/design-profile')).flush({
      projectId: 'project-1',
      client: {
        clientId: 'c1',
        fullName: null,
        jobTitle: null,
        maritalStatus: null,
        address: null,
        children: [],
      },
      primaryContact: null,
      briefHead: {
        id: 'brief-1',
        unitType: 1,
        unitCondition: 1,
        // A malicious/buggy backend response including budget-shaped fields must still
        // never surface — the normalizer only reads the fields DesignProfileBriefHead has.
        expectedBudget: 1800000,
      },
      spaces: [],
      itemsByCategory: {},
      attachments: [],
    });

    expect(profile?.briefHead).not.toHaveProperty('expectedBudget');
  });

  it('parses itemsByCategory from its wire shape — a JSON object keyed by bare-integer STRINGS', () => {
    let profile: ClientDesignProfile | undefined;
    service.getFor('project-1').subscribe((p) => (profile = p));

    http.expectOne(url('/crm/projects/project-1/design-profile')).flush({
      projectId: 'project-1',
      client: {
        clientId: 'c1',
        fullName: null,
        jobTitle: null,
        maritalStatus: null,
        address: null,
        children: [],
      },
      primaryContact: null,
      briefHead: null,
      spaces: [],
      itemsByCategory: {
        '1': [
          {
            id: 'item-1',
            room: 'Kitchen',
            title: 'Island layout',
            description: null,
            priority: 2,
            approvalStatus: 3,
            projectTaskId: null,
          },
        ],
        '6': [],
      },
      attachments: [],
    });

    expect(Object.keys(profile?.itemsByCategory ?? {})).toEqual(['1', '6']);
    expect(profile?.itemsByCategory[RequirementCategory.SpaceLayout]).toHaveLength(1);
    expect(profile?.itemsByCategory[RequirementCategory.SpaceLayout]?.[0].title).toBe(
      'Island layout',
    );
    expect(profile?.itemsByCategory[RequirementCategory.Lighting]).toEqual([]);
  });

  it('normalizes attachments, keeping the subjectKind discriminator', () => {
    let profile: ClientDesignProfile | undefined;
    service.getFor('project-1').subscribe((p) => (profile = p));

    http.expectOne(url('/crm/projects/project-1/design-profile')).flush({
      projectId: 'project-1',
      client: {
        clientId: 'c1',
        fullName: null,
        jobTitle: null,
        maritalStatus: null,
        address: null,
        children: [],
      },
      primaryContact: null,
      briefHead: null,
      spaces: [],
      itemsByCategory: {},
      attachments: [
        {
          linkId: 'link-1',
          documentId: 'doc-1',
          fileName: 'floor-plan.pdf',
          contentType: 'application/pdf',
          fileSizeBytes: 2048,
          subjectKind: 'BriefSpace',
          subjectId: 'space-1',
        },
      ],
    });

    expect(profile?.attachments).toEqual([
      {
        linkId: 'link-1',
        documentId: 'doc-1',
        fileName: 'floor-plan.pdf',
        contentType: 'application/pdf',
        fileSizeBytes: 2048,
        subjectKind: 'BriefSpace',
        subjectId: 'space-1',
      },
    ]);
  });
});
