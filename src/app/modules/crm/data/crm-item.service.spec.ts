import { TestBed } from '@angular/core/testing';
import { HttpTestingController, provideHttpClientTesting } from '@angular/common/http/testing';
import { provideHttpClient } from '@angular/common/http';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { environment } from '../../../../environments/environment';
import { CrmItemService } from './crm-item.service';

describe('CrmItemService', () => {
  let service: CrmItemService;
  let http: HttpTestingController;

  beforeEach(() => {
    TestBed.configureTestingModule({
      providers: [CrmItemService, provideHttpClient(), provideHttpClientTesting()],
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
});
