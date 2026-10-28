import { TestBed } from '@angular/core/testing';
import { HttpTestingController, provideHttpClientTesting } from '@angular/common/http/testing';
import { provideHttpClient } from '@angular/common/http';
import { describe, expect, it, beforeEach, afterEach } from 'vitest';
import { CrmProvisionStatus } from '../model/crm-enums';
import { environment } from '../../../../environments/environment';
import { CrmSpaceService } from './crm-space.service';
import type { CrmSpace, ProvisionGroup } from '../model';

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

  describe('includeCustom — honored on both provisioning reads as of backend f743454', () => {
    it('sends includeCustom=true on the buy list', () => {
      service.provisioning('project-1').subscribe();

      const req = http.expectOne(
        (r) =>
          r.url === url('/crm/projects/project-1/spaces/provisioning') &&
          r.params.get('includeCustom') === 'true',
      );
      req.flush([]);
    });

    it('sends includeCustom=true on the summary', () => {
      service.provisioningSummary('project-1').subscribe();

      const req = http.expectOne(
        (r) =>
          r.url === url('/crm/projects/project-1/spaces/provisioning/summary') &&
          r.params.get('includeCustom') === 'true',
      );
      req.flush([]);
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

  describe('normalizeProvisionGroup() — custom rows', () => {
    it('keeps nodeId null on a custom row and derives isCustom from it', () => {
      let group: ProvisionGroup | undefined;
      service.provisioning('project-1').subscribe((r) => (group = r[0]));

      http
        .expectOne(() => true)
        .flush([
          {
            nodeId: null,
            nameEn: 'Vintage lamp',
            nameAr: 'Vintage lamp',
            imageUri: null,
            isPurchasable: true,
            status: CrmProvisionStatus.ToBuy,
            occurrences: 1,
            spaces: ['Master bedroom'],
            customName: 'Vintage lamp',
          },
        ]);

      expect(group?.nodeId).toBeNull();
      expect(group?.isCustom).toBe(true);
      expect(group?.customName).toBe('Vintage lamp');
    });

    it('composes a stable trackKey from (nodeId, status) for a catalog row', () => {
      let groups: ProvisionGroup[] = [];
      service.provisioning('project-1').subscribe((r) => (groups = r));

      http
        .expectOne(() => true)
        .flush([
          {
            nodeId: 'item-1',
            spaceItemId: null,
            nameEn: 'Oak wardrobe',
            nameAr: 'دولاب خشب',
            imageUri: null,
            isPurchasable: true,
            status: CrmProvisionStatus.ToBuy,
            occurrences: 3,
            spaces: ['A', 'B', 'C'],
            customName: null,
          },
          {
            nodeId: null,
            spaceItemId: 'row-lamp-1',
            nameEn: 'Vintage lamp',
            nameAr: 'Vintage lamp',
            imageUri: null,
            isPurchasable: true,
            status: CrmProvisionStatus.ClientHas,
            occurrences: 1,
            spaces: ['A'],
            customName: 'Vintage lamp',
          },
        ]);

      expect(groups[0].trackKey).toBe(`node:item-1:${CrmProvisionStatus.ToBuy}`);
      expect(groups[0].spaceItemId).toBeNull();
      // Different rows, different keys — the composition doesn't collide catalog and custom.
      expect(groups[0].trackKey).not.toBe(groups[1].trackKey);
    });

    it('two custom rows with IDENTICAL text under one category are keyed apart by spaceItemId', () => {
      // Backend f743454: "provisioning_two_customs_never_group" guarantees two same-text
      // customs arrive as two separate rows, identical in every field except spaceItemId —
      // the id of the one board row each line IS. Without it in the key, pera-data-table
      // would key its selection Set on the same string twice and Angular would throw
      // NG0955 on the duplicate @for track.
      let groups: ProvisionGroup[] = [];
      service.provisioning('project-1').subscribe((r) => (groups = r));

      const row = (spaceItemId: string) => ({
        nodeId: null,
        spaceItemId,
        nameEn: 'Vintage lamp',
        nameAr: 'Vintage lamp',
        imageUri: null,
        isPurchasable: true,
        status: CrmProvisionStatus.ToBuy,
        occurrences: 1,
        spaces: ['Master bedroom'],
        customName: 'Vintage lamp',
      });
      http.expectOne(() => true).flush([row('row-a'), row('row-b')]);

      expect(groups).toHaveLength(2);
      expect(groups[0].trackKey).toBe('custom:row-a:Vintage lamp:' + CrmProvisionStatus.ToBuy);
      expect(groups[1].trackKey).toBe('custom:row-b:Vintage lamp:' + CrmProvisionStatus.ToBuy);
      expect(new Set(groups.map((g) => g.trackKey)).size).toBe(2);
    });

    it('a custom row arriving WITHOUT spaceItemId still gets a unique key via the index fallback', () => {
      // The degraded path for a backend older than f743454, which sent no per-row id at all.
      let groups: ProvisionGroup[] = [];
      service.provisioning('project-1').subscribe((r) => (groups = r));

      const row = {
        nodeId: null,
        nameEn: 'Vintage lamp',
        nameAr: 'Vintage lamp',
        imageUri: null,
        isPurchasable: true,
        status: CrmProvisionStatus.ToBuy,
        occurrences: 1,
        spaces: ['Master bedroom'],
        customName: 'Vintage lamp',
      };
      http.expectOne(() => true).flush([row, row]);

      expect(groups).toHaveLength(2);
      expect(groups[0].spaceItemId).toBeNull();
      expect(groups[0].trackKey).not.toBe(groups[1].trackKey);
      expect(new Set(groups.map((g) => g.trackKey)).size).toBe(2);
    });
  });
});
