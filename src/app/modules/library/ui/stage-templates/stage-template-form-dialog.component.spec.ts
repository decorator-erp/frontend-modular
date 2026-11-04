import { TestBed } from '@angular/core/testing';
import { of } from 'rxjs';
import {
  StageTemplateFormDialogComponent,
  StageTemplateFormDialogData,
} from './stage-template-form-dialog.component';
import { StageTemplatesService } from '../../data/stage-templates.service';
import { ErrorHandlerService } from '@platform/http/error-handler.service';
import { ToastService } from '@platform/feedback/toast.service';
import { PERA_MODAL_DATA, PeraModalRef } from '@ds';
import type {
  CreateStageTemplateRequest,
  UpdateStageTemplateRequest,
} from '../../model/stage-template.model';

describe('StageTemplateFormDialogComponent', () => {
  let created: CreateStageTemplateRequest | null;
  let updated: { id: string; req: UpdateStageTemplateRequest } | null;
  let closedWith: unknown;
  const modalRef = {
    close: (r: unknown) => {
      closedWith = r;
    },
  };

  function make(data: StageTemplateFormDialogData | null): StageTemplateFormDialogComponent {
    created = null;
    updated = null;
    closedWith = undefined;
    TestBed.resetTestingModule();
    TestBed.configureTestingModule({
      imports: [StageTemplateFormDialogComponent],
      providers: [
        {
          provide: StageTemplatesService,
          useValue: {
            create: (req: CreateStageTemplateRequest) => {
              created = req;
              return of('st-new');
            },
            update: (id: string, req: UpdateStageTemplateRequest) => {
              updated = { id, req };
              return of(undefined);
            },
          },
        },
        {
          provide: ErrorHandlerService,
          useValue: {
            parse: () => ({
              status: 409,
              generalMessage: 'x',
              fieldErrors: {},
              code: 'stage_templates.DuplicateName',
              raw: null,
            }),
          },
        },
        { provide: ToastService, useValue: { show: () => undefined } },
        { provide: PeraModalRef, useValue: modalRef },
        { provide: PERA_MODAL_DATA, useValue: data },
      ],
    });
    return TestBed.createComponent(StageTemplateFormDialogComponent).componentInstance;
  }

  it('create mode sends type=Custom with name/description/isDefault', () => {
    const c = make(null);
    expect(c.isEdit).toBe(false);
    c.form.setValue({ name: 'Fit-out', description: 'Seeds fit-out stages', isDefault: true });
    c.submit();
    expect(created).toEqual({
      name: 'Fit-out',
      description: 'Seeds fit-out stages',
      isDefault: true,
      type: 'Custom',
    });
    expect(closedWith).toBe(true);
  });

  it('edit mode PUTs name/description/isDefault to update with the id (no type)', () => {
    const c = make({ id: 't1', initial: { name: 'Old', description: null, isDefault: false } });
    expect(c.isEdit).toBe(true);
    c.form.patchValue({ name: 'New name' });
    c.submit();
    expect(updated?.id).toBe('t1');
    expect(updated?.req).toEqual({ name: 'New name', description: null, isDefault: false });
    expect(created).toBeNull();
  });

  it('blocks submit when name is empty', () => {
    const c = make(null);
    c.form.setValue({ name: '', description: '', isDefault: false });
    c.submit();
    expect(created).toBeNull();
    expect(closedWith).toBeUndefined();
  });
});
