import { TestBed } from '@angular/core/testing';
import { HttpTestingController, provideHttpClientTesting } from '@angular/common/http/testing';
import { provideHttpClient } from '@angular/common/http';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { environment } from '../../../../environments/environment';
import { CrmLookupService } from './crm-lookup.service';

describe('CrmLookupService.spaceTypes (009b #27)', () => {
  let service: CrmLookupService;
  let http: HttpTestingController;

  beforeEach(() => {
    TestBed.configureTestingModule({
      providers: [CrmLookupService, provideHttpClient(), provideHttpClientTesting()],
    });
    service = TestBed.inject(CrmLookupService);
    http = TestBed.inject(HttpTestingController);
  });

  afterEach(() => http.verify());

  it('keeps sortOrder and isActive — the server returns inactive types too', () => {
    let types: unknown;
    service.spaceTypes().subscribe((v) => (types = v));

    http.expectOne({ method: 'GET', url: `${environment.apiUrl}/crm/space-types` }).flush([
      { id: 'T1', code: 'living', nameEn: 'Living', nameAr: 'معيشة', sortOrder: 1, isActive: true },
      { id: 'T2', code: 'attic', nameEn: 'Attic', nameAr: 'علية', sortOrder: 2, isActive: false },
    ]);

    expect(types).toEqual([
      { id: 'T1', code: 'living', nameEn: 'Living', nameAr: 'معيشة', sortOrder: 1, isActive: true },
      { id: 'T2', code: 'attic', nameEn: 'Attic', nameAr: 'علية', sortOrder: 2, isActive: false },
    ]);
  });
});
