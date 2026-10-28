import { TestBed } from '@angular/core/testing';
import { HttpErrorResponse } from '@angular/common/http';
import { describe, expect, it, vi, beforeEach } from 'vitest';
import { of, Subject, throwError } from 'rxjs';
import { ToastService } from '@platform/feedback/toast.service';
import { ScopeOfWorkService } from '../data/scope-of-work.service';
import { ProjectService } from '../data/project.service';
import { StageTemplatesService } from '@modules/library';
import { EmployeeService } from '@modules/people';
import { ScopeOfWork, ScopeOfWorkItem, ScopeOfWorkStatus } from '../model/scope-of-work.model';
import { ScopeOfWorkStore } from './scope-of-work.store';

function sowItem(over: Partial<ScopeOfWorkItem> = {}): ScopeOfWorkItem {
  return {
    id: 'i1',
    sourceStageId: 's1',
    sourceTemplateName: 'Residential',
    name: 'Concept design',
    description: 'Mood boards',
    order: 1,
    fee: 25000,
    createdStageId: null,
    sourceMissing: false,
    ...over,
  };
}

function sowScope(over: Partial<ScopeOfWork> = {}): ScopeOfWork {
  return {
    id: 'sow1',
    projectId: 'p1',
    status: ScopeOfWorkStatus.Draft,
    durationDays: null,
    plannedStartDate: null,
    estimatedEndDate: null,
    subtotal: 0,
    adjustmentAmount: 0,
    adjustmentNote: null,
    total: 0,
    notes: null,
    confirmedAtUtc: null,
    confirmedById: null,
    items: [],
    canConfirm: false,
    blockingReason: 'projects.scope.Empty',
    ...over,
  };
}

function conflict(code: string, status = 409): HttpErrorResponse {
  return new HttpErrorResponse({
    status,
    error: { title: code, status, errors: { [code]: ['x'] } },
  });
}

describe('ScopeOfWorkStore (sow #3)', () => {
  let api: Record<string, ReturnType<typeof vi.fn>>;
  let projects: { getById: ReturnType<typeof vi.fn> };
  let toast: { show: ReturnType<typeof vi.fn> };

  const items = [
    sowItem({ id: 'i1', order: 1 }),
    sowItem({ id: 'i2', sourceStageId: 's2', order: 2 }),
    sowItem({ id: 'i3', sourceStageId: 's3', order: 3 }),
  ];

  beforeEach(() => {
    api = {
      getScope: vi.fn().mockReturnValue(of(sowScope({ items }))),
      updateItem: vi.fn().mockReturnValue(of(undefined)),
      reorder: vi.fn().mockReturnValue(of(undefined)),
      removeItem: vi.fn().mockReturnValue(of(undefined)),
    };
    projects = { getById: vi.fn().mockReturnValue(of({ id: 'p1', name: 'Villa 14' })) };
    toast = { show: vi.fn() };
    TestBed.configureTestingModule({
      providers: [
        ScopeOfWorkStore,
        { provide: ScopeOfWorkService, useValue: api },
        { provide: ProjectService, useValue: projects },
        { provide: ToastService, useValue: toast },
        { provide: StageTemplatesService, useValue: { list: vi.fn(), stages: vi.fn() } },
        { provide: EmployeeService, useValue: { getById: vi.fn() } },
      ],
    });
  });

  const store = () => TestBed.inject(ScopeOfWorkStore);

  it('load reads the scope and the project (B1)', () => {
    const s = store();
    s.load('p1');
    expect(api['getScope']).toHaveBeenCalledWith('p1');
    expect(projects.getById).toHaveBeenCalledWith('p1');
    expect(s.items().map((i) => i.id)).toEqual(['i1', 'i2', 'i3']);
    expect(s.project()?.name).toBe('Villa 14');
    expect(s.loading()).toBe(false);
  });

  it('load: a 404 shows the not-found state (B14)', () => {
    api['getScope'].mockReturnValue(throwError(() => conflict('projects.NotFound', 404)));
    const s = store();
    s.load('p1');
    expect(s.notFound()).toBe(true);
    expect(s.scope()).toBeNull();
  });

  it('updateItem sends the request then reloads (B3)', () => {
    const s = store();
    s.load('p1');
    s.updateItem('i1', { name: 'Concept', description: 'Mood boards', fee: 10 });
    expect(api['updateItem']).toHaveBeenCalledWith('p1', 'i1', {
      name: 'Concept',
      description: 'Mood boards',
      fee: 10,
    });
    expect(api['getScope']).toHaveBeenCalledTimes(2);
  });

  it('reorder sends every item id then reloads (B4)', () => {
    const s = store();
    s.load('p1');
    s.reorder(['i2', 'i1', 'i3']);
    expect(api['reorder']).toHaveBeenCalledWith('p1', ['i2', 'i1', 'i3']);
    expect(api['getScope']).toHaveBeenCalledTimes(2);
  });

  it('removeItem deletes then reloads, since the server renumbers (B5)', () => {
    const s = store();
    s.load('p1');
    s.removeItem('i2');
    expect(api['removeItem']).toHaveBeenCalledWith('p1', 'i2');
    expect(api['getScope']).toHaveBeenCalledTimes(2);
  });

  it('a 409 projects.scope.ConcurrentUpdate reloads and says so (B14, X-3)', () => {
    api['removeItem'].mockReturnValue(
      throwError(() => conflict('projects.scope.ConcurrentUpdate')),
    );
    const s = store();
    s.load('p1');
    s.removeItem('i2');
    expect(api['getScope']).toHaveBeenCalledTimes(2);
    expect(toast.show).toHaveBeenCalled();
    expect(s.error()).toBeNull();
    expect(s.saving()).toBe(false);
  });

  it('any other coded error shows its catalog message (B14)', () => {
    api['updateItem'].mockReturnValue(throwError(() => conflict('projects.scope.Confirmed')));
    const s = store();
    s.load('p1');
    s.updateItem('i1', { name: 'x', description: null, fee: 1 });
    expect(s.error()).toBeTruthy();
    expect(s.error()).not.toContain('projects.scope.Confirmed');
    expect(api['getScope']).toHaveBeenCalledTimes(1);
  });
});

describe('ScopeOfWorkStore — header (sow #5)', () => {
  let api: Record<string, ReturnType<typeof vi.fn>>;
  let toast: { show: ReturnType<typeof vi.fn> };

  beforeEach(() => {
    api = {
      getScope: vi.fn().mockReturnValue(of(sowScope())),
      updateHeader: vi.fn().mockReturnValue(of(undefined)),
    };
    toast = { show: vi.fn() };
    TestBed.configureTestingModule({
      providers: [
        ScopeOfWorkStore,
        { provide: ScopeOfWorkService, useValue: api },
        {
          provide: ProjectService,
          useValue: { getById: vi.fn().mockReturnValue(of({ id: 'p1' })) },
        },
        { provide: ToastService, useValue: toast },
        { provide: StageTemplatesService, useValue: { list: vi.fn(), stages: vi.fn() } },
        { provide: EmployeeService, useValue: { getById: vi.fn() } },
      ],
    });
  });

  const store = () => TestBed.inject(ScopeOfWorkStore);
  const header = {
    durationDays: 90,
    plannedStartDate: '2026-11-01',
    adjustmentAmount: 0,
    adjustmentNote: null,
    notes: null,
  };

  it('updateHeader sends one PUT with the five fields, then reloads; status Saved (B9)', () => {
    const s = store();
    s.load('p1');
    expect(s.headerStatus()).toBe('idle');
    s.updateHeader(header);
    expect(api['updateHeader']).toHaveBeenCalledTimes(1);
    expect(api['updateHeader']).toHaveBeenCalledWith('p1', header);
    expect(api['getScope']).toHaveBeenCalledTimes(2);
    expect(s.headerStatus()).toBe('saved');
  });

  it('the status reads Saving… while the PUT is in flight', () => {
    const pending = new Subject<void>();
    api['updateHeader'].mockReturnValue(pending);
    const s = store();
    s.load('p1');
    s.updateHeader(header);
    expect(s.headerStatus()).toBe('saving');
    pending.next();
    pending.complete();
    expect(s.headerStatus()).toBe('saved');
  });

  it('FINDING-7-1: headerDraft holds the body until the reload; a second write waits', () => {
    const first = new Subject<void>();
    api['updateHeader'].mockReturnValueOnce(first);
    const s = store();
    s.load('p1');
    s.updateHeader(header);
    expect(s.headerDraft()).toEqual(header);
    const second = { ...header, notes: 'n' };
    s.updateHeader(second);
    expect(api['updateHeader']).toHaveBeenCalledTimes(1);
    expect(s.headerDraft()).toEqual(second);
    first.next();
    first.complete();
    expect(api['updateHeader']).toHaveBeenLastCalledWith('p1', second);
    expect(s.headerDraft()).toBeNull();
    expect(s.headerStatus()).toBe('saved');
  });

  it('FINDING-7-1: a failed header save drops the draft', () => {
    api['updateHeader'].mockReturnValue(throwError(() => conflict('Validation.General', 400)));
    const s = store();
    s.load('p1');
    s.updateHeader(header);
    expect(s.headerDraft()).toBeNull();
  });

  it('a failed header save drops the status and shows the coded message (B14)', () => {
    api['updateHeader'].mockReturnValue(throwError(() => conflict('projects.scope.Confirmed')));
    const s = store();
    s.load('p1');
    s.updateHeader(header);
    expect(s.headerStatus()).toBe('idle');
    expect(s.error()).toBeTruthy();
  });
});

describe('ScopeOfWorkStore — template picker (sow #4)', () => {
  let api: Record<string, ReturnType<typeof vi.fn>>;
  let templates: { list: ReturnType<typeof vi.fn>; stages: ReturnType<typeof vi.fn> };

  const items = [
    sowItem({ id: 'i1', sourceStageId: 's1', order: 1 }),
    sowItem({ id: 'i2', sourceStageId: 's2', order: 2 }),
  ];

  beforeEach(() => {
    api = {
      getScope: vi.fn().mockReturnValue(of(sowScope({ items }))),
      addItems: vi.fn().mockReturnValue(of([])),
      addFromTemplate: vi.fn().mockReturnValue(of([])),
      removeItem: vi.fn().mockReturnValue(of(undefined)),
    };
    templates = {
      list: vi.fn().mockReturnValue(
        of([
          {
            id: 't1',
            name: 'Residential',
            description: null,
            isDefault: true,
            isActive: true,
            type: null,
          },
          {
            id: 't2',
            name: 'Medical',
            description: null,
            isDefault: false,
            isActive: true,
            type: null,
          },
        ]),
      ),
      stages: vi
        .fn()
        .mockReturnValue(of([{ id: 's1', name: 'Concept', taskCount: 3, defaultFee: 1 }])),
    };
    TestBed.configureTestingModule({
      providers: [
        ScopeOfWorkStore,
        { provide: ScopeOfWorkService, useValue: api },
        {
          provide: ProjectService,
          useValue: { getById: vi.fn().mockReturnValue(of({ id: 'p1' })) },
        },
        { provide: StageTemplatesService, useValue: templates },
        { provide: EmployeeService, useValue: { getById: vi.fn() } },
        { provide: ToastService, useValue: { show: vi.fn() } },
      ],
    });
  });

  const store = () => TestBed.inject(ScopeOfWorkStore);

  it("loadTemplates lists the templates and opens the first one's stages (B6)", () => {
    const s = store();
    s.load('p1');
    s.loadTemplates();
    expect(templates.list).toHaveBeenCalled();
    expect(s.templates()).toEqual([
      { id: 't1', name: 'Residential' },
      { id: 't2', name: 'Medical' },
    ]);
    expect(s.selectedTemplateId()).toBe('t1');
    expect(templates.stages).toHaveBeenCalledWith('t1');
    expect(s.templateStages()).toHaveLength(1);
  });

  it("selectTemplate reads that template's stages", () => {
    const s = store();
    s.load('p1');
    s.selectTemplate('t2');
    expect(s.selectedTemplateId()).toBe('t2');
    expect(templates.stages).toHaveBeenCalledWith('t2');
  });

  it("pickedStageIds are the items' sourceStageIds", () => {
    const s = store();
    s.load('p1');
    expect(s.pickedStageIds()).toEqual(['s1', 's2']);
  });

  it('addStage posts { sourceStageIds: [id] } then reloads', () => {
    const s = store();
    s.load('p1');
    s.addStage('s9');
    expect(api['addItems']).toHaveBeenCalledWith('p1', ['s9']);
    expect(api['getScope']).toHaveBeenCalledTimes(2);
  });

  it('removeStage deletes the item whose sourceStageId matches', () => {
    const s = store();
    s.load('p1');
    s.removeStage('s2');
    expect(api['removeItem']).toHaveBeenCalledWith('p1', 'i2');
  });

  it('removeStage of a stage not in the scope sends nothing', () => {
    const s = store();
    s.load('p1');
    s.removeStage('s9');
    expect(api['removeItem']).not.toHaveBeenCalled();
  });

  it('addTemplate posts items/from-template/{id} then reloads', () => {
    const s = store();
    s.load('p1');
    s.addTemplate('t1');
    expect(api['addFromTemplate']).toHaveBeenCalledWith('p1', 't1');
    expect(api['getScope']).toHaveBeenCalledTimes(2);
  });
});

describe('ScopeOfWorkStore — confirm (sow #7)', () => {
  let api: Record<string, ReturnType<typeof vi.fn>>;
  let employees: { getById: ReturnType<typeof vi.fn> };

  const confirmed = sowScope({
    status: ScopeOfWorkStatus.Confirmed,
    confirmedAtUtc: '2026-10-27T09:30:00Z',
    confirmedById: 'e1',
    items: [sowItem({ createdStageId: 'st1' })],
    blockingReason: 'projects.scope.Confirmed',
  });

  beforeEach(() => {
    api = {
      getScope: vi.fn().mockReturnValue(of(sowScope({ items: [sowItem()], canConfirm: true }))),
      confirm: vi.fn().mockReturnValue(of({ createdStageIds: ['st1'] })),
    };
    employees = { getById: vi.fn().mockReturnValue(of({ id: 'e1', fullName: 'Mona Adel' })) };
    TestBed.configureTestingModule({
      providers: [
        ScopeOfWorkStore,
        { provide: ScopeOfWorkService, useValue: api },
        {
          provide: ProjectService,
          useValue: { getById: vi.fn().mockReturnValue(of({ id: 'p1' })) },
        },
        { provide: ToastService, useValue: { show: vi.fn() } },
        { provide: StageTemplatesService, useValue: { list: vi.fn(), stages: vi.fn() } },
        { provide: EmployeeService, useValue: employees },
      ],
    });
  });

  const store = () => TestBed.inject(ScopeOfWorkStore);

  it('confirm posts, then reloads the scope as Confirmed (B10)', () => {
    const s = store();
    s.load('p1');
    api['getScope'].mockReturnValue(of(confirmed));
    s.confirm();
    expect(api['confirm']).toHaveBeenCalledWith('p1');
    expect(api['getScope']).toHaveBeenCalledTimes(2);
    expect(s.isConfirmed()).toBe(true);
  });

  it("resolves the confirmer's name through HR, once (B11)", () => {
    api['getScope'].mockReturnValue(of(confirmed));
    const s = store();
    s.load('p1');
    expect(employees.getById).toHaveBeenCalledWith('e1');
    expect(s.confirmedByName()).toBe('Mona Adel');
    s.reload();
    expect(employees.getById).toHaveBeenCalledTimes(1);
  });

  it('the name is "—" when HR fails (B11)', () => {
    api['getScope'].mockReturnValue(of(confirmed));
    employees.getById.mockReturnValue(throwError(() => new HttpErrorResponse({ status: 404 })));
    const s = store();
    s.load('p1');
    expect(s.confirmedByName()).toBe('—');
  });

  it('a Draft resolves no name', () => {
    const s = store();
    s.load('p1');
    expect(employees.getById).not.toHaveBeenCalled();
    expect(s.confirmedByName()).toBeNull();
  });
});
