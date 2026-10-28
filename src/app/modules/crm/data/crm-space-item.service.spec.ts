import { TestBed } from '@angular/core/testing';
import { HttpTestingController, provideHttpClientTesting } from '@angular/common/http/testing';
import { provideHttpClient } from '@angular/common/http';
import { describe, expect, it, beforeEach, afterEach } from 'vitest';
import { CrmProvisionStatus } from '../model/crm-enums';
import { environment } from '../../../../environments/environment';
import { CrmSpaceItemService } from './crm-space-item.service';
import type { SpaceItem } from '../model';

describe('CrmSpaceItemService', () => {
  let service: CrmSpaceItemService;
  let http: HttpTestingController;

  beforeEach(() => {
    TestBed.configureTestingModule({
      providers: [CrmSpaceItemService, provideHttpClient(), provideHttpClientTesting()],
    });
    service = TestBed.inject(CrmSpaceItemService);
    http = TestBed.inject(HttpTestingController);
  });

  afterEach(() => http.verify());

  const url = (path: string) => `${environment.apiUrl}${path}`;

  describe('list() — includeCustom', () => {
    it('always sends includeCustom=true', () => {
      service.list('space-1').subscribe();

      const req = http.expectOne(
        (r) =>
          r.url === url('/crm/spaces/space-1/items') && r.params.get('includeCustom') === 'true',
      );
      req.flush([]);
    });
  });

  describe('add() — the either/or body', () => {
    it('sends only catalogNodeId on the catalog path — no customName, no customCategoryId', () => {
      service.add('space-1', { catalogNodeId: 'item-1' }).subscribe();

      const req = http.expectOne(url('/crm/spaces/space-1/items'));
      expect(req.request.body).toEqual({
        catalogNodeId: 'item-1',
        status: CrmProvisionStatus.ToBuy,
        note: null,
        sourceBriefSpaceId: null,
      });
      req.flush('new-id');
    });

    it('OMITS catalogNodeId entirely on the custom path — never sends it as null', () => {
      service
        .add('space-1', { customName: 'Vintage lamp', customCategoryId: 'cat-lighting' })
        .subscribe();

      const req = http.expectOne(url('/crm/spaces/space-1/items'));
      expect(req.request.body).toEqual({
        customName: 'Vintage lamp',
        customCategoryId: 'cat-lighting',
        status: CrmProvisionStatus.ToBuy,
        note: null,
        sourceBriefSpaceId: null,
      });
      expect('catalogNodeId' in req.request.body).toBe(false);
      req.flush('new-id');
    });
  });

  describe('promote()', () => {
    it('POSTs catalogItemId to the promote route', () => {
      service.promote('space-1', 'row-1', { catalogItemId: 'item-9' }).subscribe();

      const req = http.expectOne(url('/crm/spaces/space-1/items/row-1/promote'));
      expect(req.request.method).toBe('POST');
      expect(req.request.body).toEqual({ catalogItemId: 'item-9' });
      req.flush(null);
    });
  });

  describe('normalizeItem() — custom rows', () => {
    it('keeps a null catalogItemId as null, never defaults it to an empty string', () => {
      let row: SpaceItem | undefined;
      service.list('space-1').subscribe((r) => (row = r[0]));

      http
        .expectOne(() => true)
        .flush([
          {
            id: 'row-1',
            spaceId: 'space-1',
            catalogNodeId: null,
            nodeNameEn: 'Vintage lamp',
            nodeNameAr: 'Vintage lamp',
            imageUri: null,
            isPurchasable: true,
            path: [],
            status: CrmProvisionStatus.ToBuy,
            note: null,
            sourceBriefSpaceId: null,
            attributes: [],
            isCustom: true,
            customName: 'Vintage lamp',
            customCategoryId: 'cat-lighting',
          },
        ]);

      expect(row?.catalogItemId).toBeNull();
      expect(row?.isCustom).toBe(true);
      expect(row?.customName).toBe('Vintage lamp');
      expect(row?.trackKey).toBe('row-1');
    });

    it('derives isCustom from customName when the server omits the flag', () => {
      let row: SpaceItem | undefined;
      service.list('space-1').subscribe((r) => (row = r[0]));

      http
        .expectOne(() => true)
        .flush([
          {
            id: 'row-1',
            spaceId: 'space-1',
            catalogNodeId: null,
            nodeNameEn: 'Vintage lamp',
            nodeNameAr: 'Vintage lamp',
            imageUri: null,
            isPurchasable: true,
            path: [],
            status: CrmProvisionStatus.ToBuy,
            note: null,
            sourceBriefSpaceId: null,
            attributes: [],
            customName: 'Vintage lamp',
            customCategoryId: 'cat-lighting',
            // isCustom omitted on purpose
          },
        ]);

      expect(row?.isCustom).toBe(true);
    });

    it('normalizes a catalog row with isCustom false and both custom fields null', () => {
      let row: SpaceItem | undefined;
      service.list('space-1').subscribe((r) => (row = r[0]));

      http
        .expectOne(() => true)
        .flush([
          {
            id: 'row-1',
            spaceId: 'space-1',
            catalogNodeId: 'item-1',
            nodeNameEn: 'Oak wardrobe',
            nodeNameAr: 'دولاب خشب',
            imageUri: null,
            isPurchasable: true,
            path: [],
            status: CrmProvisionStatus.ToBuy,
            note: null,
            sourceBriefSpaceId: null,
            attributes: [],
            isCustom: false,
            customName: null,
            customCategoryId: null,
          },
        ]);

      expect(row?.catalogItemId).toBe('item-1');
      expect(row?.isCustom).toBe(false);
      expect(row?.customName).toBeNull();
      expect(row?.customCategoryId).toBeNull();
    });
  });
});
