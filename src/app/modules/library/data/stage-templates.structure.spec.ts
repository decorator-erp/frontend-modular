import { TestBed } from '@angular/core/testing';
import { provideHttpClient } from '@angular/common/http';
import { HttpTestingController, provideHttpClientTesting } from '@angular/common/http/testing';
import { StageTemplatesService } from './stage-templates.service';
import type {
  StageTemplateRef,
  TemplateStageTask,
  TemplateSubTask,
} from '../model/stage-template.model';

/** Sync F1: the template structure routes (dms TemplateEndpoints.cs:66-192). */
describe('StageTemplatesService — template structure (sync F1)', () => {
  let service: StageTemplatesService;
  let http: HttpTestingController;

  beforeEach(() => {
    TestBed.configureTestingModule({
      providers: [provideHttpClient(), provideHttpClientTesting()],
    });
    service = TestBed.inject(StageTemplatesService);
    http = TestBed.inject(HttpTestingController);
  });

  afterEach(() => http.verify());

  const one = (method: string, suffix: string) =>
    http.expectOne((r) => r.method === method && r.url.endsWith(suffix));

  it('getById GETs /stage-templates/{id} and maps the type int', () => {
    let t: StageTemplateRef | undefined;
    service.getById('t1').subscribe((r) => (t = r));
    one('GET', '/stage-templates/t1').flush({
      id: 't1',
      name: 'Fit-out',
      description: null,
      type: 2,
      isDefault: false,
    });
    expect(t).toEqual({
      id: 't1',
      name: 'Fit-out',
      description: null,
      type: 'Custom',
      isDefault: false,
      isActive: true,
    });
  });

  it('createStage POSTs { name, order, weightPercent, description, defaultFee } and reads { stageId }', () => {
    let id = '';
    service
      .createStage('t1', {
        name: 'Design',
        order: 1,
        weightPercent: 40,
        description: null,
        defaultFee: 1500,
      })
      .subscribe((r) => (id = r));
    const req = one('POST', '/stage-templates/t1/stages');
    expect(req.request.body).toEqual({
      name: 'Design',
      order: 1,
      weightPercent: 40,
      description: null,
      defaultFee: 1500,
    });
    req.flush({ stageId: 's1' });
    expect(id).toBe('s1');
  });

  it('updateStage PUTs /stages/{id}; deleteStage DELETEs it', () => {
    service
      .updateStage('s1', {
        name: 'Design',
        order: 2,
        weightPercent: 50,
        description: 'd',
        defaultFee: null,
      })
      .subscribe();
    const put = one('PUT', '/stages/s1');
    expect(put.request.body).toEqual({
      name: 'Design',
      order: 2,
      weightPercent: 50,
      description: 'd',
      defaultFee: null,
    });
    put.flush(null);
    service.removeStage('s1').subscribe();
    one('DELETE', '/stages/s1').flush(null);
  });

  it('stageTasks GETs /stages/{id}/tasks and maps weight + departmentId', () => {
    let tasks: TemplateStageTask[] = [];
    service.stageTasks('s1').subscribe((r) => (tasks = r));
    one('GET', '/stages/s1/tasks').flush([
      {
        id: 'k1',
        stageId: 's1',
        name: 'Survey',
        description: null,
        order: 1,
        weight: 2.5,
        departmentId: 'd1',
      },
    ]);
    expect(tasks).toEqual([
      {
        id: 'k1',
        stageId: 's1',
        name: 'Survey',
        description: null,
        order: 1,
        weight: 2.5,
        departmentId: 'd1',
      },
    ]);
  });

  it('createStageTask POSTs `weight` (not weightPercent) and reads { stageTaskId }', () => {
    let id = '';
    service
      .createStageTask('s1', {
        name: 'Survey',
        order: 1,
        weight: 1,
        description: null,
        departmentId: null,
      })
      .subscribe((r) => (id = r));
    const req = one('POST', '/stages/s1/tasks');
    expect(req.request.body).toEqual({
      name: 'Survey',
      order: 1,
      weight: 1,
      description: null,
      departmentId: null,
    });
    expect(req.request.body).not.toHaveProperty('weightPercent');
    req.flush({ stageTaskId: 'k1' });
    expect(id).toBe('k1');
  });

  it('updateStageTask PUTs /stage-tasks/{id}; removeStageTask DELETEs it', () => {
    service
      .updateStageTask('k1', {
        name: 'Survey',
        order: 1,
        weight: 3,
        description: null,
        departmentId: 'd2',
      })
      .subscribe();
    const put = one('PUT', '/stage-tasks/k1');
    expect(put.request.body).toEqual({
      name: 'Survey',
      order: 1,
      weight: 3,
      description: null,
      departmentId: 'd2',
    });
    put.flush(null);
    service.removeStageTask('k1').subscribe();
    one('DELETE', '/stage-tasks/k1').flush(null);
  });

  it('subTasks GETs /stage-tasks/{id}/sub-tasks; createSubTask POSTs { title, order, isRequired, description }', () => {
    let subs: TemplateSubTask[] = [];
    service.subTasks('k1').subscribe((r) => (subs = r));
    one('GET', '/stage-tasks/k1/sub-tasks').flush([
      {
        id: 'x1',
        stageTaskId: 'k1',
        title: 'Measure',
        description: null,
        order: 1,
        isRequired: false,
      },
    ]);
    expect(subs[0]).toEqual({
      id: 'x1',
      stageTaskId: 'k1',
      title: 'Measure',
      description: null,
      order: 1,
      isRequired: false,
    });

    let id = '';
    service
      .createSubTask('k1', { title: 'Photo', order: 2, isRequired: true, description: null })
      .subscribe((r) => (id = r));
    const post = one('POST', '/stage-tasks/k1/sub-tasks');
    expect(post.request.body).toEqual({
      title: 'Photo',
      order: 2,
      isRequired: true,
      description: null,
    });
    post.flush({ stageSubTaskId: 'x2' });
    expect(id).toBe('x2');
  });

  it('updateSubTask PUTs /stage-sub-tasks/{id}; removeSubTask DELETEs it', () => {
    service
      .updateSubTask('x1', {
        title: 'Measure',
        order: 1,
        isRequired: true,
        description: 'all rooms',
      })
      .subscribe();
    const put = one('PUT', '/stage-sub-tasks/x1');
    expect(put.request.body).toEqual({
      title: 'Measure',
      order: 1,
      isRequired: true,
      description: 'all rooms',
    });
    put.flush(null);
    service.removeSubTask('x1').subscribe();
    one('DELETE', '/stage-sub-tasks/x1').flush(null);
  });

  it('stageDepartments GETs /stages/{id}/departments and emits the department ids', () => {
    let ids: string[] = [];
    service.stageDepartments('s1').subscribe((r) => (ids = r));
    one('GET', '/stages/s1/departments').flush([
      { stageId: 's1', departmentId: 'd1' },
      { stageId: 's1', departmentId: 'd2' },
    ]);
    expect(ids).toEqual(['d1', 'd2']);
  });

  it('links a template stage to a department on POST /stages/{id}/departments/{deptId}, unlinks on DELETE', () => {
    service.addStageDepartment('ST1', 'D1').subscribe();
    one('POST', '/stages/ST1/departments/D1').flush(null);
    service.removeStageDepartment('ST1', 'D1').subscribe();
    one('DELETE', '/stages/ST1/departments/D1').flush(null);
  });
});
