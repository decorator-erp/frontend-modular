import { TestBed } from '@angular/core/testing';
import { of } from 'rxjs';
import { StageFormDialogComponent, StageFormDialogData } from './stage-form-dialog.component';
import { StageTemplatesService } from '@modules/library';
import { ProjectStageService } from '../../data/project-stage.service';
import { ErrorHandlerService } from '@platform/http/error-handler.service';
import { ToastService } from '@platform/feedback/toast.service';
import { PERA_MODAL_DATA, PeraModalRef } from '@ds';
import type {
  CreateProjectStageRequest,
  UpdateProjectStageRequest,
} from '../../model/project.model';

describe('StageFormDialogComponent', () => {
  let created: CreateProjectStageRequest | null;
  let updated: { projectId: string; id: string; req: UpdateProjectStageRequest } | null;
  let createdIn: string | null;
  let closedWith: unknown;
  const modalRef = {
    close: (r: unknown) => {
      closedWith = r;
    },
  };

  function make(data: StageFormDialogData): StageFormDialogComponent {
    created = null;
    updated = null;
    createdIn = null;
    closedWith = undefined;
    TestBed.resetTestingModule();
    TestBed.configureTestingModule({
      imports: [StageFormDialogComponent],
      providers: [
        {
          provide: ProjectStageService,
          useValue: {
            create: (projectId: string, req: CreateProjectStageRequest) => {
              created = req;
              createdIn = projectId;
              return of('st-1');
            },
            update: (projectId: string, id: string, req: UpdateProjectStageRequest) => {
              updated = { projectId, id, req };
              return of(undefined);
            },
          },
        },
        {
          provide: StageTemplatesService,
          useValue: {
            list: () => of([{ id: 'tpl1', name: 'Villa', isActive: true }]),
            stages: () => of([{ id: 'ts1', name: 'Concept design' }]),
          },
        },
        {
          provide: ErrorHandlerService,
          useValue: {
            parse: () => ({
              status: 409,
              generalMessage: 'x',
              fieldErrors: {},
              code: 'project_stages.CreationFailed',
              raw: null,
            }),
          },
        },
        { provide: ToastService, useValue: { show: () => undefined } },
        { provide: PeraModalRef, useValue: modalRef },
        { provide: PERA_MODAL_DATA, useValue: data },
      ],
    });
    return TestBed.createComponent(StageFormDialogComponent).componentInstance;
  }

  it('create posts the base stage fields to the project route, coercing order to a number (crmp A-2)', () => {
    const c = make({ mode: 'create', projectId: 'p1', nextOrder: 40 });
    c.form.patchValue({
      name: 'Technical design',
      estimatedStartDate: '2026-03-17',
      estimatedEndDate: '2026-08-12',
    });
    c.submit();
    expect(createdIn).toBe('p1');
    expect(created).toEqual({
      name: 'Technical design',
      order: 40,
      estimatedStartDate: '2026-03-17',
      estimatedEndDate: '2026-08-12',
      description: null,
      notes: null,
      templateStageId: null,
    });
    expect(closedWith).toBe(true);
  });

  it('edit PUTs the base fields on the project + stage route (crmp A-2)', () => {
    const c = make({
      mode: 'edit',
      projectId: 'p1',
      stageId: 's1',
      initial: {
        name: 'Design phase',
        order: 30,
        estimatedStartDate: null,
        estimatedEndDate: null,
        description: 'd',
        notes: null,
      },
    });
    expect(c.isEdit).toBe(true);
    c.form.patchValue({ name: 'Design' });
    c.submit();
    expect(updated?.projectId).toBe('p1');
    expect(updated?.id).toBe('s1');
    expect(updated?.req.name).toBe('Design');
    expect(created).toBeNull();
  });

  it('crmp P-2: a picked template stage is sent as templateStageId and names the stage', () => {
    const c = make({ mode: 'create', projectId: 'p1', nextOrder: 20 });
    c.form.controls.templateId.setValue('tpl1');
    c.form.controls.templateStageId.setValue('ts1');
    expect(c.form.controls.name.value).toBe('Concept design');
    c.submit();
    expect(created?.templateStageId).toBe('ts1');
    expect(created?.name).toBe('Concept design');
  });

  it('blocks submit when end date is before start date', () => {
    const c = make({ mode: 'create', projectId: 'p1', nextOrder: 10 });
    c.form.patchValue({
      name: 'Stage',
      estimatedStartDate: '2026-05-01',
      estimatedEndDate: '2026-04-01',
    });
    c.submit();
    expect(created).toBeNull();
    expect(closedWith).toBeUndefined();
  });
});
