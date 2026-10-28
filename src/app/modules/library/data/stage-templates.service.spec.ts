import { TestBed } from '@angular/core/testing';
import { provideHttpClient } from '@angular/common/http';
import { HttpTestingController, provideHttpClientTesting } from '@angular/common/http/testing';
import { StageTemplatesService } from './stage-templates.service';
import type { StageTemplateRef, TemplateStage } from '../model/stage-template.model';

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

  it('stages GETs /stage-templates/{id}/stages and maps defaultFee/taskCount (008b #10)', () => {
    let stages: TemplateStage[] = [];
    service.stages('t1').subscribe((r) => (stages = r));
    const req = httpMock.expectOne(
      (r) => r.method === 'GET' && r.url.endsWith('/stage-templates/t1/stages'),
    );
    req.flush([
      {
        id: 's2',
        stageTemplateId: 't1',
        name: 'Execution',
        description: null,
        order: 2,
        weightPercent: 60,
        defaultFee: 1500.5,
        taskCount: 7,
      },
      {
        id: 's1',
        stageTemplateId: 't1',
        name: 'Design',
        description: 'Concept + shop drawings',
        order: 1,
        weightPercent: 40,
        defaultFee: null,
        taskCount: 4,
      },
    ]);
    expect(stages).toEqual([
      {
        id: 's2',
        stageTemplateId: 't1',
        name: 'Execution',
        description: null,
        order: 2,
        weightPercent: 60,
        defaultFee: 1500.5,
        taskCount: 7,
      },
      {
        id: 's1',
        stageTemplateId: 't1',
        name: 'Design',
        description: 'Concept + shop drawings',
        order: 1,
        weightPercent: 40,
        defaultFee: null,
        taskCount: 4,
      },
    ]);
  });
});
