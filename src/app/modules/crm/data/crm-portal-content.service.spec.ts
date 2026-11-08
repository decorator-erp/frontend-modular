import { TestBed } from '@angular/core/testing';
import { HttpTestingController, provideHttpClientTesting } from '@angular/common/http/testing';
import { provideHttpClient } from '@angular/common/http';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { HANDLED_ERROR_STATUSES } from '@platform/http/handled-errors';
import { environment } from '../../../../environments/environment';
import { PortalShareKind } from '../model/portal.model';
import { CrmPortalContentService } from './crm-portal-content.service';

const ROOT = `${environment.apiUrl}/crm/portal/projects/P1`;

const fileWire = {
  shareId: 'S1',
  kind: 3,
  title: 'Living room',
  note: 'North wall',
  fileName: 'IMG_1.jpg',
  contentType: 'image/jpeg',
  fileSizeBytes: 4096,
  isImage: true,
  sortOrder: 0,
  sharedAtUtc: '2026-11-01T10:00:00Z',
  url: '/api/crm/portal/projects/P1/files/S1',
};

describe('CrmPortalContentService (crmp P2-B, CrmPortalVisibilityEndpoints.cs:156-222)', () => {
  let service: CrmPortalContentService;
  let http: HttpTestingController;

  beforeEach(() => {
    TestBed.configureTestingModule({
      providers: [provideHttpClient(), provideHttpClientTesting()],
    });
    service = TestBed.inject(CrmPortalContentService);
    http = TestBed.inject(HttpTestingController);
  });

  afterEach(() => http.verify());

  it('GET overview reads sections, progress (null when off) and counts', () => {
    let result: unknown;
    service.getOverview('P1').subscribe((o) => (result = o));
    const req = http.expectOne(`${ROOT}/overview`);
    expect(req.request.method).toBe('GET');
    expect(req.request.context.get(HANDLED_ERROR_STATUSES)).toEqual([403, 404]);
    req.flush({
      projectId: 'P1',
      projectName: 'Villa',
      sections: {
        progress: false,
        tasks: false,
        documents: true,
        gallery: true,
        siteSurveys: false,
        updates: false,
      },
      progress: null,
      counts: { documents: 2, images: 0, sitePhotos: null, tasks: null, updates: null },
    });
    expect(result).toEqual({
      projectId: 'P1',
      projectName: 'Villa',
      sections: {
        progress: false,
        tasks: false,
        documents: true,
        gallery: true,
        siteSurveys: false,
        updates: false,
      },
      progress: null,
      counts: { documents: 2, images: 0, sitePhotos: null, tasks: null, updates: null },
    });
  });

  it('GET files reads the shared documents', () => {
    let result: unknown;
    service.getFiles('P1').subscribe((f) => (result = f));
    const req = http.expectOne(`${ROOT}/files`);
    expect(req.request.method).toBe('GET');
    expect(req.request.context.get(HANDLED_ERROR_STATUSES)).toEqual([403, 404]);
    req.flush([fileWire]);
    expect(result).toEqual([{ ...fileWire, kind: PortalShareKind.SitePhoto }]);
  });

  it('GET gallery reads images and site photos', () => {
    let result: { shareId: string }[] = [];
    service.getGallery('P1').subscribe((f) => (result = f));
    const req = http.expectOne(`${ROOT}/gallery`);
    expect(req.request.method).toBe('GET');
    req.flush([fileWire]);
    expect(result[0].shareId).toBe('S1');
  });

  it('GET tasks reads the shared tasks', () => {
    let result: unknown;
    service.getTasks('P1').subscribe((t) => (result = t));
    const req = http.expectOne(`${ROOT}/tasks`);
    expect(req.request.method).toBe('GET');
    const task = {
      shareId: 'S4',
      title: 'Paint',
      note: null,
      stageName: 'Build',
      status: 'Completed',
      dueDate: '2026-11-10T00:00:00Z',
      startedAtUtc: '2026-11-01T09:00:00Z',
      completedAtUtc: '2026-11-05T09:00:00Z',
      sortOrder: 0,
    };
    req.flush([task]);
    expect(result).toEqual([task]);
  });

  it('GET updates reads published posts with their attachments', () => {
    let result: unknown;
    service.getUpdates('P1').subscribe((u) => (result = u));
    const req = http.expectOne(`${ROOT}/updates`);
    expect(req.request.method).toBe('GET');
    req.flush([
      {
        id: 'U1',
        title: 'Tiles',
        body: 'Installed',
        publishedAtUtc: '2026-11-03T10:00:00Z',
        attachments: [fileWire],
      },
    ]);
    expect(result).toEqual([
      {
        id: 'U1',
        title: 'Tiles',
        body: 'Installed',
        publishedAtUtc: '2026-11-03T10:00:00Z',
        attachments: [{ ...fileWire, kind: PortalShareKind.SitePhoto }],
      },
    ]);
  });

  it('streams a file as an authenticated blob from files/{shareId}', () => {
    let blob: Blob | null = null;
    expect(service.fileUrl('P1', 'S1')).toBe(`${ROOT}/files/S1`);
    service.fileBlob('P1', 'S1').subscribe((b) => (blob = b));
    const req = http.expectOne(`${ROOT}/files/S1`);
    expect(req.request.method).toBe('GET');
    expect(req.request.responseType).toBe('blob');
    expect(req.request.context.get(HANDLED_ERROR_STATUSES)).toEqual([403, 404]);
    req.flush(new Blob(['x'], { type: 'image/jpeg' }));
    expect(blob).toBeInstanceOf(Blob);
  });

  it('a 404 (section off) errors to the caller', () => {
    let status = 0;
    service.getTasks('P1').subscribe({ error: (e: { status: number }) => (status = e.status) });
    http
      .expectOne(`${ROOT}/tasks`)
      .flush(
        { errors: { 'crm.portal.NotFound': ['Nothing was found for that request.'] } },
        { status: 404, statusText: 'Not Found' },
      );
    expect(status).toBe(404);
  });
});
