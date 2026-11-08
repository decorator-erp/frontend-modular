import { TestBed } from '@angular/core/testing';
import { provideHttpClient } from '@angular/common/http';
import { HttpTestingController, provideHttpClientTesting } from '@angular/common/http/testing';
import { CrmSpaceTypeAdminService } from './crm-space-type-admin.service';
import { CrmClientChildrenService } from './crm-client-children.service';
import { CrmArtifactService } from './crm-artifact.service';
import { CrmPortalBriefRoundsService } from './crm-portal-brief-rounds.service';
import { CrmItemService, PortalRequirementItem } from './crm-item.service';
import { CrmCatalogItemDetailService } from './crm-catalog-item-detail.service';
import type { BriefRound, CatalogItem } from '../model';

/** Sync F4: the CRM routes the new screens call (dms Crm.Infrastructure/Endpoints). */
describe('CRM services — sync F4', () => {
  let http: HttpTestingController;

  beforeEach(() => {
    TestBed.configureTestingModule({
      providers: [provideHttpClient(), provideHttpClientTesting()],
    });
    http = TestBed.inject(HttpTestingController);
  });
  afterEach(() => http.verify());

  const one = (method: string, suffix: string) =>
    http.expectOne((r) => r.method === method && r.url.split('?')[0].endsWith(suffix));

  describe('(a) space types', () => {
    it('create POSTs { code, nameEn, nameAr, sortOrder } and reads { spaceTypeId }', () => {
      let id = '';
      TestBed.inject(CrmSpaceTypeAdminService)
        .createSpaceType({ code: 'kitchen', nameEn: 'Kitchen', nameAr: 'مطبخ', sortOrder: 3 })
        .subscribe((r) => (id = r));
      const req = one('POST', '/crm/space-types');
      expect(req.request.body).toEqual({
        code: 'kitchen',
        nameEn: 'Kitchen',
        nameAr: 'مطبخ',
        sortOrder: 3,
      });
      req.flush({ spaceTypeId: 'st1' }, { status: 201, statusText: 'Created' });
      expect(id).toBe('st1');
    });

    it('update PUTs { nameEn, nameAr, sortOrder } (no code); active PUTs { isActive }', () => {
      const api = TestBed.inject(CrmSpaceTypeAdminService);
      api.updateSpaceType('st1', { nameEn: 'K', nameAr: 'م', sortOrder: 1 }).subscribe();
      const put = one('PUT', '/crm/space-types/st1');
      expect(put.request.body).toEqual({ nameEn: 'K', nameAr: 'م', sortOrder: 1 });
      put.flush(null);
      api.setSpaceTypeActive('st1', false).subscribe();
      const active = one('PUT', '/crm/space-types/st1/active');
      expect(active.request.body).toEqual({ isActive: false });
      active.flush(null);
    });
  });

  describe('(b) client children', () => {
    it('add POSTs { gender, age } and reads { childId }; update PUTs; remove DELETEs', () => {
      const api = TestBed.inject(CrmClientChildrenService);
      let id = '';
      api.addChild('c1', { gender: 'F', age: 7 }).subscribe((r) => (id = r));
      const post = one('POST', '/clients/c1/children');
      expect(post.request.body).toEqual({ gender: 'F', age: 7 });
      post.flush({ childId: 'k1' }, { status: 201, statusText: 'Created' });
      expect(id).toBe('k1');

      api.updateChild('c1', 'k1', { gender: 'M', age: 8 }).subscribe();
      const put = one('PUT', '/clients/c1/children/k1');
      expect(put.request.body).toEqual({ gender: 'M', age: 8 });
      put.flush(null);

      api.removeChild('c1', 'k1').subscribe();
      one('DELETE', '/clients/c1/children/k1').flush(null);
    });
  });

  describe('(c) artifact link', () => {
    it.each([
      ['brief', 'briefId'],
      ['space', 'spaceId'],
      ['requirement-item', 'requirementItemId'],
      ['meeting', 'meetingId'],
    ] as const)('%s sends documentId + exactly %s', (subject, key) => {
      let id = '';
      TestBed.inject(CrmArtifactService)
        .link(subject, 's1', 'd1')
        .subscribe((r) => (id = r));
      const req = one('POST', '/crm/artifacts');
      expect(req.request.body).toEqual({ documentId: 'd1', [key]: 's1' });
      req.flush({ artifactDocumentId: 'a1' }, { status: 201, statusText: 'Created' });
      expect(id).toBe('a1');
    });
  });

  describe('(d) client brief rounds', () => {
    it('listMyRounds GETs /crm/portal/briefs/{id}/rounds', () => {
      let rounds: BriefRound[] = [];
      TestBed.inject(CrmPortalBriefRoundsService)
        .listMyRounds('b1')
        .subscribe((r) => (rounds = r));
      one('GET', '/crm/portal/briefs/b1/rounds').flush([
        { round: 1, sentAtUtc: '2026-10-01T10:00:00Z', outcome: 3, decidedAtUtc: null },
      ]);
      expect(rounds).toEqual([
        { round: 1, sentAtUtc: '2026-10-01T10:00:00Z', outcome: 3, decidedAtUtc: null },
      ]);
    });
  });

  describe('(e) portal items', () => {
    it('portalCreate sends the picked spaceTypeId', () => {
      TestBed.inject(CrmItemService)
        .portalCreate({
          projectId: 'P',
          periodId: 'Per',
          category: 1,
          title: 'Sofa',
          priority: 2,
          spaceTypeId: 'st1',
        })
        .subscribe();
      const req = one('POST', '/crm/portal/requirement-items');
      expect(req.request.body.spaceTypeId).toBe('st1');
      req.flush({ itemId: 'I' }, { status: 201, statusText: 'Created' });
    });

    it('listPortal maps category, priority and spaceTypeId, and null when absent', () => {
      let items: PortalRequirementItem[] = [];
      TestBed.inject(CrmItemService)
        .listPortal({ projectId: null, periodId: null, status: null, pageNumber: 1, pageSize: 20 })
        .subscribe((r) => (items = r.items));
      http
        .expectOne((r) => r.url.includes('/crm/portal/requirement-items'))
        .flush({
          items: [{ id: 'a', category: 5, priority: 3, spaceTypeId: 'st1' }, { id: 'b' }],
          totalCount: 2,
        });
      expect(items.map((i) => [i.category, i.priority, i.spaceTypeId])).toEqual([
        [5, 3, 'st1'],
        [null, null, null],
      ]);
    });
  });

  describe('(f) catalog item detail (S9 + S10)', () => {
    it('getItem GETs /crm/catalog/items/{id} and reads attributeValues, description and image', () => {
      let item: CatalogItem | undefined;
      TestBed.inject(CrmCatalogItemDetailService)
        .getItemDetail('i1')
        .subscribe((r) => (item = r));
      one('GET', '/crm/catalog/items/i1').flush({
        id: 'i1',
        categoryId: 'c1',
        code: 'lamp',
        nameEn: 'Lamp',
        nameAr: 'مصباح',
        isPurchasable: true,
        sortOrder: 0,
        isActive: true,
        descriptionEn: 'Brass',
        descriptionAr: null,
        imageUri: 'https://x/lamp.png',
        attributeValues: [
          { attributeId: 'a1', valueNumber: 40 },
          { attributeId: 'a2', valueBool: false },
        ],
      });
      expect(item?.descriptionEn).toBe('Brass');
      expect(item?.imageUri).toBe('https://x/lamp.png');
      expect(item?.attributes.map((a) => [a.attributeId, a.valueNumber, a.valueBool])).toEqual([
        ['a1', 40, null],
        ['a2', null, false],
      ]);
    });

    it('a detail without S9/S10 fields reads as no description, image or values', () => {
      let item: CatalogItem | undefined;
      TestBed.inject(CrmCatalogItemDetailService)
        .getItemDetail('i1')
        .subscribe((r) => (item = r));
      one('GET', '/crm/catalog/items/i1').flush({ id: 'i1', nameEn: 'Lamp' });
      expect([item?.descriptionEn, item?.imageUri, item?.attributes]).toEqual([null, null, []]);
    });
  });
});
