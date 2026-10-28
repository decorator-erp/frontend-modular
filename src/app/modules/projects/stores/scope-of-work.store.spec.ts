import { TestBed } from '@angular/core/testing';
import { HttpErrorResponse } from '@angular/common/http';
import { describe, expect, it, vi, beforeEach } from 'vitest';
import { of, throwError } from 'rxjs';
import { ToastService } from '@platform/feedback/toast.service';
import { ScopeOfWorkService } from '../data/scope-of-work.service';
import { ProjectService } from '../data/project.service';
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
