import { TestBed } from '@angular/core/testing';
import { HttpTestingController, provideHttpClientTesting } from '@angular/common/http/testing';
import { provideHttpClient } from '@angular/common/http';
import { describe, expect, it, beforeEach, afterEach } from 'vitest';
import { environment } from '../../../../environments/environment';
import { HANDLED_ERROR_STATUSES } from '@platform/http/handled-errors';
import { CrmSpaceService } from './crm-space.service';
import type { CrmSpace } from '../model';

describe('CrmSpaceService', () => {
  let service: CrmSpaceService;
  let http: HttpTestingController;

  beforeEach(() => {
    TestBed.configureTestingModule({
      providers: [CrmSpaceService, provideHttpClient(), provideHttpClientTesting()],
    });
    service = TestBed.inject(CrmSpaceService);
    http = TestBed.inject(HttpTestingController);
  });

  afterEach(() => http.verify());

  const url = (path: string) => `${environment.apiUrl}${path}`;

  /** `list()` resolves each row's `spaceType` from `/crm/space-types` (009b #28). */
  const flushTypes = (): void =>
    http.expectOne(url('/crm/space-types')).flush([
      {
        id: 'st-1',
        code: 'kitchen',
        nameEn: 'Kitchen',
        nameAr: 'المطبخ',
        sortOrder: 1,
        isActive: true,
      },
      { id: 'st-2', code: 'attic', nameEn: 'Attic', nameAr: 'علية', sortOrder: 2, isActive: false },
    ]);

  describe('list (009b #28) — flat spaceTypeId, no includeInactive binding', () => {
    const rows = [
      {
        id: 'space-1',
        projectId: 'P',
        spaceTypeId: 'st-1',
        name: 'Kitchen',
        description: null,
        sortOrder: 0,
        isActive: true,
      },
      {
        id: 'space-2',
        projectId: 'P',
        spaceTypeId: 'st-2',
        name: 'Old attic',
        description: null,
        sortOrder: 1,
        isActive: false,
      },
    ];

    it('sends no includeInactive param and resolves spaceType from the types list', () => {
      let spaces: CrmSpace[] = [];
      service.list('P').subscribe((r) => (spaces = r));

      const req = http.expectOne((r) => r.url === url('/crm/projects/P/spaces'));
      expect(req.request.method).toBe('GET');
      expect(req.request.params.keys()).toEqual([]);
      req.flush(rows);
      flushTypes();

      expect(spaces.map((s) => s.id)).toEqual(['space-1']);
      expect(spaces[0].spaceType.id).toBe('st-1');
      expect(spaces[0].spaceType.nameEn).toBe('Kitchen');
      expect(spaces[0].spaceType.nameAr).toBe('المطبخ');
    });

    it('keeps inactive spaces only when includeInactive is true', () => {
      let spaces: CrmSpace[] = [];
      service.list('P', true).subscribe((r) => (spaces = r));

      const req = http.expectOne((r) => r.url === url('/crm/projects/P/spaces'));
      expect(req.request.params.keys()).toEqual([]);
      req.flush(rows);
      flushTypes();

      expect(spaces.map((s) => [s.id, s.isActive, s.spaceType.nameEn])).toEqual([
        ['space-1', true, 'Kitchen'],
        ['space-2', false, 'Attic'],
      ]);
    });
  });

  describe('create (009b #29)', () => {
    it('emits the id read off the one-property 201 body', () => {
      let id: string | undefined;
      service.create('P', { spaceTypeId: 'st-1', name: 'Kitchen' }).subscribe((v) => (id = v));

      const req = http.expectOne({ method: 'POST', url: url('/crm/projects/P/spaces') });
      req.flush({ spaceId: 'S' }, { status: 201, statusText: 'Created' });

      expect(id).toBe('S');
    });
  });

  describe('description (F6b) — always sent, never inferred as "leave alone"', () => {
    it('normalizes description on list() from the wire field', () => {
      let spaces: CrmSpace[] = [];
      service.list('project-1').subscribe((r) => (spaces = r));

      http.expectOne(url('/crm/projects/project-1/spaces')).flush([
        {
          id: 'space-1',
          projectId: 'project-1',
          spaceTypeId: 'st-1',
          name: 'Kitchen',
          sortOrder: 0,
          isActive: true,
          description: 'North-facing, keep the built-in wardrobe.',
        },
      ]);

      flushTypes();

      expect(spaces[0].description).toBe('North-facing, keep the built-in wardrobe.');
    });

    it('normalizes a missing description field to null, not undefined', () => {
      let spaces: CrmSpace[] = [];
      service.list('project-1').subscribe((r) => (spaces = r));

      http.expectOne(url('/crm/projects/project-1/spaces')).flush([
        {
          id: 'space-1',
          projectId: 'project-1',
          spaceTypeId: 'st-1',
          name: 'Kitchen',
          sortOrder: 0,
          isActive: true,
        },
      ]);

      flushTypes();

      expect(spaces[0].description).toBeNull();
    });

    it('sends description on create()', () => {
      service
        .create('project-1', { spaceTypeId: 'st-1', name: 'Kitchen', description: 'Prose.' })
        .subscribe();

      const req = http.expectOne(url('/crm/projects/project-1/spaces'));
      expect(req.request.body.description).toBe('Prose.');
      req.flush('space-1');
    });

    it('update() sends the current description alongside a rename — omitting it would wipe it per PUT full-replacement semantics', () => {
      service
        .update('space-1', { spaceTypeId: 'st-1', name: 'Renamed', description: 'Keep me.' })
        .subscribe();

      const req = http.expectOne(url('/crm/spaces/space-1'));
      expect(req.request.body).toEqual({
        spaceTypeId: 'st-1',
        name: 'Renamed',
        description: 'Keep me.',
      });
      req.flush(null);
    });

    it('update() normalizes an omitted description to null rather than dropping the key', () => {
      service.update('space-1', { spaceTypeId: 'st-1', name: 'Renamed' }).subscribe();

      const req = http.expectOne(url('/crm/spaces/space-1'));
      expect(req.request.body.description).toBeNull();
      req.flush(null);
    });
  });

  // crmp C-5: CrmSpaceEndpoints.cs:41 (order) and :80 (delete); provisioning reads still absent.
  describe('reorder and delete (crmp C-5)', () => {
    it('reorder() PUTs the full order as { spaceIds } with the 409 InvalidOrder handled', () => {
      service.reorder('p1', ['b', 'a', 'c']).subscribe();
      const req = http.expectOne(url('/crm/projects/p1/spaces/order'));
      expect(req.request.method).toBe('PUT');
      expect(req.request.body).toEqual({ spaceIds: ['b', 'a', 'c'] });
      expect(req.request.context.get(HANDLED_ERROR_STATUSES)).toEqual([409]);
      req.flush(null);
    });

    it('remove() DELETEs /crm/spaces/{id} with the 409 InUse handled', () => {
      service.remove('s1').subscribe({ error: () => undefined });
      const req = http.expectOne(url('/crm/spaces/s1'));
      expect(req.request.method).toBe('DELETE');
      expect(req.request.context.get(HANDLED_ERROR_STATUSES)).toEqual([404, 409]);
      req.flush({ errors: { 'crm.spaces.InUse': ['x'] } }, { status: 409, statusText: 'Conflict' });
    });

    it('still has no provisioning reads (009b #N-6)', () => {
      const methods = service as unknown as Record<string, unknown>;
      for (const name of ['provisioning', 'provisioningSummary']) {
        expect(methods[name], name).toBeUndefined();
      }
    });
  });
});
