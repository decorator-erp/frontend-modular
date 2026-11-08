import { TestBed } from '@angular/core/testing';
import { HttpTestingController, provideHttpClientTesting } from '@angular/common/http/testing';
import { provideHttpClient } from '@angular/common/http';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { HANDLED_ERROR_STATUSES } from '@platform/http/handled-errors';
import { environment } from '../../../../environments/environment';
import { PortalShareKind } from '../model/portal.model';
import { CrmPortalVisibilityService } from './crm-portal-visibility.service';

const ROOT = `${environment.apiUrl}/crm/projects/P1/portal`;

const shareWire = {
  id: 'S1',
  projectId: 'P1',
  itemKind: 2,
  itemId: 'D1',
  followLatest: true,
  clientTitle: 'Kitchen',
  clientNote: null,
  sortOrder: 1,
  sharedById: 'E1',
  sharedAtUtc: '2026-11-01T10:00:00Z',
  isAvailable: false,
  itemName: 'kitchen.jpg',
  contentType: 'image/jpeg',
  isImage: true,
  version: 3,
  stageName: null,
  siteCode: null,
};

const fileWire = {
  shareId: 'S1',
  kind: 2,
  title: 'Kitchen',
  note: null,
  fileName: 'kitchen.jpg',
  contentType: 'image/jpeg',
  fileSizeBytes: 2048,
  isImage: true,
  sortOrder: 0,
  sharedAtUtc: '2026-11-01T10:00:00Z',
  url: '/api/crm/portal/projects/P1/files/S1',
};

describe('CrmPortalVisibilityService (crmp P2-B, CrmPortalVisibilityEndpoints.cs:35-154)', () => {
  let service: CrmPortalVisibilityService;
  let http: HttpTestingController;

  beforeEach(() => {
    TestBed.configureTestingModule({
      providers: [provideHttpClient(), provideHttpClientTesting()],
    });
    service = TestBed.inject(CrmPortalVisibilityService);
    http = TestBed.inject(HttpTestingController);
  });

  afterEach(() => http.verify());

  it('GET settings reads the six switches; 403/404 are handled', () => {
    let result: unknown;
    service.getSettings('P1').subscribe((s) => (result = s));
    const req = http.expectOne(`${ROOT}/settings`);
    expect(req.request.method).toBe('GET');
    expect(req.request.context.get(HANDLED_ERROR_STATUSES)).toEqual([403, 404]);
    req.flush({
      projectId: 'P1',
      progress: true,
      tasks: false,
      documents: true,
      gallery: false,
      siteSurveys: true,
      updates: false,
    });
    expect(result).toEqual({
      projectId: 'P1',
      progress: true,
      tasks: false,
      documents: true,
      gallery: false,
      siteSurveys: true,
      updates: false,
    });
  });

  it('PUT settings sends all six switches', () => {
    service
      .saveSettings('P1', {
        progress: true,
        tasks: true,
        documents: false,
        gallery: true,
        siteSurveys: false,
        updates: true,
      })
      .subscribe();
    const req = http.expectOne(`${ROOT}/settings`);
    expect(req.request.method).toBe('PUT');
    expect(req.request.body).toEqual({
      progress: true,
      tasks: true,
      documents: false,
      gallery: true,
      siteSurveys: false,
      updates: true,
    });
    expect(req.request.context.get(HANDLED_ERROR_STATUSES)).toEqual([400, 403, 404, 409]);
    req.flush(null, { status: 204, statusText: 'No Content' });
  });

  it('GET shares reads the list in sort order, with the kind filter as an int', () => {
    let result: { id: string; itemKind: number; isAvailable: boolean }[] = [];
    service.getShares('P1', PortalShareKind.Image).subscribe((s) => (result = s));
    const req = http.expectOne((r) => r.url === `${ROOT}/shares`);
    expect(req.request.method).toBe('GET');
    expect(req.request.params.get('kind')).toBe('2');
    req.flush([{ ...shareWire, id: 'S2', sortOrder: 2 }, shareWire]);
    expect(result.map((s) => s.id)).toEqual(['S1', 'S2']);
    expect(result[0]).toEqual({ ...shareWire, itemKind: PortalShareKind.Image });
  });

  it('GET shares without a kind sends no kind param', () => {
    service.getShares('P1').subscribe();
    const req = http.expectOne((r) => r.url === `${ROOT}/shares`);
    expect(req.request.params.has('kind')).toBe(false);
    req.flush([]);
  });

  it('POST shares sends the item and options, and reads { shareId }', () => {
    let id = '';
    service
      .createShare('P1', {
        itemKind: PortalShareKind.SitePhoto,
        itemId: 'L1',
        clientTitle: '  Living room  ',
        clientNote: '',
        notifyClient: true,
      })
      .subscribe((v) => (id = v));
    const req = http.expectOne(`${ROOT}/shares`);
    expect(req.request.method).toBe('POST');
    expect(req.request.body).toEqual({
      itemKind: 3,
      itemId: 'L1',
      clientTitle: 'Living room',
      clientNote: null,
      followLatest: true,
      sortOrder: null,
      notifyClient: true,
    });
    req.flush({ shareId: 'S9' }, { status: 201, statusText: 'Created' });
    expect(id).toBe('S9');
  });

  it('PUT shares/order sends the ids in display order', () => {
    service.reorderShares('P1', ['S2', 'S1']).subscribe();
    const req = http.expectOne(`${ROOT}/shares/order`);
    expect(req.request.method).toBe('PUT');
    expect(req.request.body).toEqual({ shareIds: ['S2', 'S1'] });
    req.flush(null, { status: 204, statusText: 'No Content' });
  });

  it('PUT shares/{id} sends the client title, note and follow-latest', () => {
    service
      .updateShare('P1', 'S1', { clientTitle: 'A', clientNote: ' n ', followLatest: false })
      .subscribe();
    const req = http.expectOne(`${ROOT}/shares/S1`);
    expect(req.request.method).toBe('PUT');
    expect(req.request.body).toEqual({ clientTitle: 'A', clientNote: 'n', followLatest: false });
    req.flush(null, { status: 204, statusText: 'No Content' });
  });

  it('PUT shares/{id} leaves follow-latest out for a stage or task', () => {
    service.updateShare('P1', 'S1', { clientTitle: null, clientNote: null }).subscribe();
    const req = http.expectOne(`${ROOT}/shares/S1`);
    expect(req.request.body).toEqual({ clientTitle: null, clientNote: null });
    req.flush(null, { status: 204, statusText: 'No Content' });
  });

  it('DELETE shares/{id} unshares', () => {
    service.deleteShare('P1', 'S1').subscribe();
    const req = http.expectOne(`${ROOT}/shares/S1`);
    expect(req.request.method).toBe('DELETE');
    expect(req.request.context.get(HANDLED_ERROR_STATUSES)).toEqual([400, 403, 404, 409]);
    req.flush(null, { status: 204, statusText: 'No Content' });
  });

  it('GET updates reads drafts and published posts', () => {
    let result: unknown;
    service.getUpdates('P1').subscribe((u) => (result = u));
    const req = http.expectOne(`${ROOT}/updates`);
    expect(req.request.method).toBe('GET');
    req.flush([
      {
        id: 'U1',
        projectId: 'P1',
        title: 'Tiles',
        body: 'Done',
        publishedAtUtc: null,
        authorId: 'E1',
        createdAtUtc: '2026-11-02T10:00:00Z',
        shareIds: ['S1'],
      },
    ]);
    expect(result).toEqual([
      {
        id: 'U1',
        projectId: 'P1',
        title: 'Tiles',
        body: 'Done',
        publishedAtUtc: null,
        authorId: 'E1',
        createdAtUtc: '2026-11-02T10:00:00Z',
        shareIds: ['S1'],
      },
    ]);
  });

  it('POST updates creates a draft and reads { updateId }', () => {
    let id = '';
    service
      .createUpdate('P1', { title: ' Tiles ', body: '', shareIds: ['S1'] })
      .subscribe((v) => (id = v));
    const req = http.expectOne(`${ROOT}/updates`);
    expect(req.request.method).toBe('POST');
    expect(req.request.body).toEqual({ title: 'Tiles', body: null, shareIds: ['S1'] });
    req.flush({ updateId: 'U9' }, { status: 201, statusText: 'Created' });
    expect(id).toBe('U9');
  });

  it('PUT updates/{id} edits a post', () => {
    service.editUpdate('P1', 'U1', { title: 'T', body: 'B', shareIds: [] }).subscribe();
    const req = http.expectOne(`${ROOT}/updates/U1`);
    expect(req.request.method).toBe('PUT');
    expect(req.request.body).toEqual({ title: 'T', body: 'B', shareIds: [] });
    req.flush(null, { status: 204, statusText: 'No Content' });
  });

  it('DELETE updates/{id} deletes a post', () => {
    service.deleteUpdate('P1', 'U1').subscribe();
    const req = http.expectOne(`${ROOT}/updates/U1`);
    expect(req.request.method).toBe('DELETE');
    req.flush(null, { status: 204, statusText: 'No Content' });
  });

  it('POST updates/{id}/publish sends notifyClient', () => {
    service.publishUpdate('P1', 'U1', true).subscribe();
    const req = http.expectOne(`${ROOT}/updates/U1/publish`);
    expect(req.request.method).toBe('POST');
    expect(req.request.body).toEqual({ notifyClient: true });
    req.flush(null, { status: 204, statusText: 'No Content' });
  });

  it('GET preview reads the overview and the five lists in the client shapes', () => {
    let result: unknown;
    service.getPreview('P1').subscribe((p) => (result = p));
    const req = http.expectOne(`${ROOT}/preview`);
    expect(req.request.method).toBe('GET');
    expect(req.request.context.get(HANDLED_ERROR_STATUSES)).toEqual([403, 404]);
    req.flush({
      overview: {
        projectId: 'P1',
        projectName: 'Villa',
        sections: {
          progress: true,
          tasks: true,
          documents: true,
          gallery: true,
          siteSurveys: false,
          updates: true,
        },
        progress: {
          progressPercentage: 40,
          activeStageName: 'Design',
          limitedToSharedStages: false,
          stages: [
            {
              name: 'Build',
              note: null,
              order: 2,
              status: 'Pending',
              plannedStartDate: null,
              plannedEndDate: null,
              actualStartDate: null,
              actualEndDate: null,
              progressPercentage: 0,
            },
            {
              name: 'Design',
              note: 'n',
              order: 1,
              status: 'Active',
              plannedStartDate: '2026-10-01T00:00:00Z',
              plannedEndDate: '2026-11-01T00:00:00Z',
              actualStartDate: '2026-10-02T00:00:00Z',
              actualEndDate: null,
              progressPercentage: 50,
            },
          ],
        },
        counts: { documents: 1, images: 1, sitePhotos: null, tasks: 0, updates: 1 },
      },
      files: [{ ...fileWire, kind: 1, isImage: false, contentType: 'application/pdf' }],
      gallery: [fileWire],
      tasks: [
        {
          shareId: 'S4',
          title: 'Paint',
          note: null,
          stageName: 'Build',
          status: 'InProgress',
          dueDate: null,
          startedAtUtc: null,
          completedAtUtc: null,
          sortOrder: 0,
        },
      ],
      updates: [
        {
          id: 'U1',
          title: 'Tiles',
          body: 'Done',
          publishedAtUtc: '2026-11-03T10:00:00Z',
          attachments: [fileWire],
        },
      ],
    });
    const preview = result as {
      overview: {
        sections: { siteSurveys: boolean };
        progress: { stages: { name: string }[] };
        counts: { sitePhotos: number | null };
      };
      files: { kind: number }[];
      gallery: { shareId: string }[];
      tasks: { title: string }[];
      updates: { attachments: unknown[] }[];
    };
    expect(preview.overview.sections.siteSurveys).toBe(false);
    expect(preview.overview.progress.stages.map((s) => s.name)).toEqual(['Design', 'Build']);
    expect(preview.overview.counts.sitePhotos).toBeNull();
    expect(preview.files[0].kind).toBe(PortalShareKind.Document);
    expect(preview.gallery[0].shareId).toBe('S1');
    expect(preview.tasks[0].title).toBe('Paint');
    expect(preview.updates[0].attachments).toHaveLength(1);
  });
});
