import { TestBed } from '@angular/core/testing';
import { provideHttpClient } from '@angular/common/http';
import { HttpTestingController, provideHttpClientTesting } from '@angular/common/http/testing';
import { StageTemplatesService } from './stage-templates.service';
import type { StageTemplateRef } from '../model/stage-template.model';

describe('StageTemplatesService', () => {
  let service: StageTemplatesService;
  let httpMock: HttpTestingController;

  beforeEach(() => {
    TestBed.configureTestingModule({
      providers: [StageTemplatesService, provideHttpClient(), provideHttpClientTesting()],
    });
    service = TestBed.inject(StageTemplatesService);
    httpMock = TestBed.inject(HttpTestingController);
  });

  afterEach(() => httpMock.verify());

  it('create POSTs to /stage-templates and unwraps the new id', () => {
    let id: string | undefined;
    service
      .create({ name: 'Fit-out', stageTemplateType: 'Custom', isDefault: false, description: null })
      .subscribe((r) => (id = r));
    const req = httpMock.expectOne(
      (r) => r.method === 'POST' && r.url.endsWith('/stage-templates'),
    );
    expect(req.request.body).toEqual({
      name: 'Fit-out',
      stageTemplateType: 'Custom',
      isDefault: false,
      description: null,
    });
    req.flush({ value: 'st-1' });
    expect(id).toBe('st-1');
  });

  it('update PUTs to /stage-templates/{id}', () => {
    service.update('t1', { name: 'Renamed', description: null, isDefault: true }).subscribe();
    const req = httpMock.expectOne(
      (r) => r.method === 'PUT' && r.url.endsWith('/stage-templates/t1'),
    );
    expect(req.request.body).toEqual({ name: 'Renamed', description: null, isDefault: true });
    req.flush(null);
  });

  it('list maps the System/Custom type when the API exposes it', () => {
    let items: StageTemplateRef[] = [];
    service.list().subscribe((r) => (items = r));
    const req = httpMock.expectOne((r) => r.method === 'GET' && r.url.endsWith('/stage-templates'));
    req.flush([
      {
        id: 'a',
        name: 'System default',
        stageTemplateType: 'System',
        isDefault: true,
        isActive: true,
      },
    ]);
    expect(items[0].type).toBe('System');
    expect(items[0].isDefault).toBe(true);
  });
});
