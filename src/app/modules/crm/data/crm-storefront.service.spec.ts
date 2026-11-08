import { TestBed } from '@angular/core/testing';
import { HttpTestingController, provideHttpClientTesting } from '@angular/common/http/testing';
import { provideHttpClient } from '@angular/common/http';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { environment } from '../../../../environments/environment';
import { HANDLED_ERROR_STATUSES } from '@platform/http/handled-errors';
import type { SpaceSelection } from '../model';
import { CrmStorefrontService, normalizeSpaceSelections } from './crm-storefront.service';

const WIRE = {
  id: 'sel-1',
  spaceId: 'SP',
  catalogItemId: 'item-1',
  itemCode: 'SOFA',
  itemNameEn: 'Sofa',
  itemNameAr: 'كنبة',
  quantity: 2.5,
  notes: 'grey',
  sortOrder: 1,
  options: [
    {
      attributeId: 'a-1',
      attributeNameEn: 'Fabric',
      attributeNameAr: 'القماش',
      optionId: 'o-1',
      optionCode: 'LINEN',
      optionNameEn: 'Linen',
      optionNameAr: 'كتان',
    },
  ],
};

// crmp C-6: contract §2.9.1 #110–#114, CrmStorefrontEndpoints.cs:21-58.
describe('CrmStorefrontService (crmp C-6)', () => {
  let service: CrmStorefrontService;
  let http: HttpTestingController;
  const url = (path: string) => `${environment.apiUrl}${path}`;

  beforeEach(() => {
    TestBed.configureTestingModule({
      providers: [CrmStorefrontService, provideHttpClient(), provideHttpClientTesting()],
    });
    service = TestBed.inject(CrmStorefrontService);
    http = TestBed.inject(HttpTestingController);
  });

  afterEach(() => http.verify());

  it('route 110: GET /crm/spaces/{spaceId}/selections → normalized picks', () => {
    let rows: SpaceSelection[] = [];
    service.list('SP').subscribe((r) => (rows = r));
    const req = http.expectOne(url('/crm/spaces/SP/selections'));
    expect(req.request.method).toBe('GET');
    expect(req.request.context.get(HANDLED_ERROR_STATUSES)).toEqual([404]);
    req.flush([WIRE]);
    expect(rows).toEqual([WIRE]);
  });

  it('route 111: POST /crm/spaces/{spaceId}/selections {catalogItemId, quantity, notes, options} → selectionId', () => {
    let id = '';
    service
      .add('SP', {
        catalogItemId: 'item-1',
        quantity: 1.125,
        options: [{ attributeId: 'a-1', optionId: 'o-1' }],
      })
      .subscribe((r) => (id = r));
    const req = http.expectOne(url('/crm/spaces/SP/selections'));
    expect(req.request.method).toBe('POST');
    expect(req.request.body).toEqual({
      catalogItemId: 'item-1',
      quantity: 1.125,
      notes: null,
      options: [{ attributeId: 'a-1', optionId: 'o-1' }],
    });
    req.flush({ selectionId: 'sel-9' });
    expect(id).toBe('sel-9');
  });

  it('route 112: PUT /crm/spaces/{spaceId}/selections/order {selectionIds}', () => {
    service.reorder('SP', ['b', 'a']).subscribe();
    const req = http.expectOne(url('/crm/spaces/SP/selections/order'));
    expect(req.request.method).toBe('PUT');
    expect(req.request.body).toEqual({ selectionIds: ['b', 'a'] });
    expect(req.request.context.get(HANDLED_ERROR_STATUSES)).toEqual([400, 404, 409]);
    req.flush(null, { status: 204, statusText: 'No Content' });
  });

  it('route 113: PUT /crm/spaces/{spaceId}/selections/{selectionId}: omitted options are sent as null (keep), [] clears', () => {
    service.update('SP', 'sel-1', { quantity: 3, notes: null }).subscribe();
    const keep = http.expectOne(url('/crm/spaces/SP/selections/sel-1'));
    expect(keep.request.method).toBe('PUT');
    expect(keep.request.body).toEqual({ quantity: 3, notes: null, options: null });
    keep.flush(null, { status: 204, statusText: 'No Content' });

    service.update('SP', 'sel-1', { quantity: 3, notes: 'x', options: [] }).subscribe();
    const clear = http.expectOne(url('/crm/spaces/SP/selections/sel-1'));
    expect(clear.request.body).toEqual({ quantity: 3, notes: 'x', options: [] });
    clear.flush(null, { status: 204, statusText: 'No Content' });
  });

  it('route 114: DELETE /crm/spaces/{spaceId}/selections/{selectionId}', () => {
    service.remove('SP', 'sel-1').subscribe();
    const req = http.expectOne(url('/crm/spaces/SP/selections/sel-1'));
    expect(req.request.method).toBe('DELETE');
    req.flush(null, { status: 204, statusText: 'No Content' });
  });

  it('normalizeSpaceSelections reads a missing or null snapshot as []', () => {
    expect(normalizeSpaceSelections(undefined)).toEqual([]);
    expect(normalizeSpaceSelections(null)).toEqual([]);
    expect(normalizeSpaceSelections([{ ...WIRE, notes: null }])[0].notes).toBeNull();
  });
});
