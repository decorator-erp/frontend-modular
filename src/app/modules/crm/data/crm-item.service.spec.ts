import { TestBed } from '@angular/core/testing';
import { HttpTestingController, provideHttpClientTesting } from '@angular/common/http/testing';
import { provideHttpClient } from '@angular/common/http';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { environment } from '../../../../environments/environment';
import { of } from 'rxjs';
import { vi } from 'vitest';
import { CrmItemService } from './crm-item.service';
import { CrmPeriodService } from './crm-period.service';

describe('CrmItemService', () => {
  let service: CrmItemService;
  let http: HttpTestingController;
  const periodsApi = { list: vi.fn() };

  beforeEach(() => {
    TestBed.configureTestingModule({
      providers: [
        CrmItemService,
        provideHttpClient(),
        provideHttpClientTesting(),
        { provide: CrmPeriodService, useValue: periodsApi },
      ],
    });
    service = TestBed.inject(CrmItemService);
    http = TestBed.inject(HttpTestingController);
  });

  afterEach(() => http.verify());

  const url = (path: string) => `${environment.apiUrl}${path}`;

  describe('create (009b #22)', () => {
    it('posts to the period route with projectId in the body and reads { itemId }', () => {
      let id: string | undefined;
      service
        .create('Per', {
          projectId: 'P',
          category: 1,
          title: 'Sofa',
          priority: 2,
          spaceTypeId: 'T',
        })
        .subscribe((v) => (id = v));

      const req = http.expectOne({ method: 'POST', url: url('/crm/periods/Per/items') });
      expect(req.request.body).toEqual({
        projectId: 'P',
        category: 1,
        title: 'Sofa',
        priority: 2,
        spaceTypeId: 'T',
        room: null,
        description: null,
        sourceType: null,
        meetingId: null,
        briefId: null,
        noteId: null,
        projectTaskId: null,
      });
      expect(req.request.body).not.toHaveProperty('periodId');
      req.flush({ itemId: 'I' }, { status: 201, statusText: 'Created' });

      expect(id).toBe('I');
    });
  });

  describe('listByPeriod / listByTask / listByProject (009b #23)', () => {
    const wireItem = (id: string, periodId: string) => ({
      id,
      projectId: 'P',
      periodId,
      category: 1,
      spaceTypeId: 'T',
      room: null,
      title: id,
      description: null,
      priority: 2,
      sourceType: null,
      meetingId: null,
      briefId: null,
      noteId: null,
      approvalStatus: 1,
      supersedesItemId: null,
      createdByEmployeeId: 'E',
      createdByContactId: null,
      projectTaskId: null,
    });
    const page = (items: unknown[], pageNumber = 1, totalPages = 1) => ({
      items,
      pageNumber,
      pageSize: 200,
      totalCount: items.length,
      totalPages,
    });

    it('listByPeriod pages on pageNumber/pageSize and reads spaceTypeId, no createdAtUtc', () => {
      let result: { items: unknown[]; page: number; totalCount: number } | undefined;
      service.listByPeriod('Per', 1).subscribe((r) => (result = r));

      const req = http.expectOne(
        (r) => r.method === 'GET' && r.url === url('/crm/periods/Per/items'),
      );
      expect(req.request.params.get('pageNumber')).toBe('1');
      expect(req.request.params.get('pageSize')).toBe('50');
      expect(req.request.params.keys().sort()).toEqual(['pageNumber', 'pageSize']);
      req.flush({
        items: [wireItem('I', 'Per')],
        pageNumber: 1,
        pageSize: 50,
        totalCount: 1,
        totalPages: 1,
      });

      expect(result?.page).toBe(1);
      expect(result?.totalCount).toBe(1);
      expect(result?.items[0]).toMatchObject({ id: 'I', spaceTypeId: 'T', details: null });
      expect(result?.items[0]).not.toHaveProperty('createdAtUtc');
    });

    it('listByTask reads the per-task route', () => {
      service.listByTask('Tk', 2, 10).subscribe();

      const req = http.expectOne(
        (r) => r.method === 'GET' && r.url === url('/crm/project-tasks/Tk/requirement-items'),
      );
      expect(req.request.params.get('pageNumber')).toBe('2');
      expect(req.request.params.get('pageSize')).toBe('10');
      req.flush(page([]));
    });

    it("listByProject loads the project's periods, then every page of each period's items", () => {
      periodsApi.list.mockReturnValue(of([{ id: 'Cur' }, { id: 'Old' }]));
      let items: { id: string }[] = [];
      service.listByProject('P').subscribe((r) => (items = r));

      expect(periodsApi.list).toHaveBeenCalledWith('P');
      const first = (periodId: string) =>
        http.expectOne(
          (r) =>
            r.url === url(`/crm/periods/${periodId}/items`) &&
            r.params.get('pageNumber') === '1' &&
            r.params.get('pageSize') === '200',
        );
      first('Cur').flush(page([wireItem('C2', 'Cur')], 1, 2));
      first('Old').flush(page([wireItem('O1', 'Old')]));
      http
        .expectOne(
          (r) => r.url === url('/crm/periods/Cur/items') && r.params.get('pageNumber') === '2',
        )
        .flush(page([wireItem('C1', 'Cur')], 2, 2));

      expect(items.map((i) => i.id)).toEqual(['C2', 'C1', 'O1']);
    });

    it('listByProject is empty, with no item call, when the project has no period', () => {
      periodsApi.list.mockReturnValue(of([]));
      let items: unknown[] | undefined;
      service.listByProject('P').subscribe((r) => (items = r));

      expect(items).toEqual([]);
    });
  });

  describe('update / supersede (009b #24)', () => {
    const request = {
      category: 1,
      title: 'Sofa',
      priority: 2,
      spaceTypeId: 'T',
      room: 'Living',
    };
    const body = {
      category: 1,
      title: 'Sofa',
      priority: 2,
      spaceTypeId: 'T',
      room: 'Living',
      description: null,
      sourceType: null,
      meetingId: null,
      briefId: null,
      noteId: null,
      projectTaskId: null,
    };

    it('update sends spaceTypeId (positional binding would clear it when omitted)', () => {
      service.update('I', request).subscribe();

      const req = http.expectOne({ method: 'PUT', url: url('/crm/requirement-items/I') });
      expect(req.request.body).toEqual(body);
      req.flush(null, { status: 204, statusText: 'No Content' });
    });

    it('supersede sends spaceTypeId and reads the new { itemId }', () => {
      let id: string | undefined;
      service.supersede('I', request).subscribe((v) => (id = v));

      const req = http.expectOne({
        method: 'POST',
        url: url('/crm/requirement-items/I/supersede'),
      });
      expect(req.request.body).toEqual(body);
      req.flush({ itemId: 'I2' }, { status: 201, statusText: 'Created' });

      expect(id).toBe('I2');
    });
  });
});
