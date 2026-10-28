import { TestBed } from '@angular/core/testing';
import { HttpTestingController, provideHttpClientTesting } from '@angular/common/http/testing';
import { provideHttpClient } from '@angular/common/http';
import { describe, expect, it, beforeEach, afterEach } from 'vitest';
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

  it('normalizes the seven-field ClientDesignProfileResponse (009b #17)', () => {
    let profile: ClientDesignProfile | undefined;
    service.getFor('project-1').subscribe((p) => (profile = p));

    http.expectOne(url('/crm/projects/project-1/design-profile')).flush({
      projectId: 'project-1',
      preferredStyle: 'x',
      preferredColors: null,
      furnitureStatus: 2,
      hiringReasons: 3,
      architecturalRequests: 'Open the kitchen',
      otherNeeds: null,
    });

    expect(profile).toEqual({
      projectId: 'project-1',
      preferredStyle: 'x',
      preferredColors: null,
      furnitureStatus: 2,
      hiringReasons: 3,
      architecturalRequests: 'Open the kitchen',
      otherNeeds: null,
    });
  });

  it('defaults the omitted fields and carries nothing beyond the seven', () => {
    let profile: ClientDesignProfile | undefined;
    service.getFor('project-1').subscribe((p) => (profile = p));

    http.expectOne(url('/crm/projects/project-1/design-profile')).flush({
      projectId: 'project-1',
      preferredStyle: 'x',
      hiringReasons: 3,
      // A buggy backend response with budget-shaped or retired fields must never surface.
      expectedBudget: 1800000,
      client: { clientId: 'c1' },
      spaces: [],
    });

    expect(profile?.preferredStyle).toBe('x');
    expect(profile?.hiringReasons).toBe(3);
    expect(profile?.furnitureStatus).toBeNull();
    expect(profile).not.toHaveProperty('expectedBudget');
    expect(profile).not.toHaveProperty('client');
    expect(profile).not.toHaveProperty('spaces');
  });
});
