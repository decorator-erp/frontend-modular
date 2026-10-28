import { NO_ERRORS_SCHEMA, signal } from '@angular/core';
import { TestBed } from '@angular/core/testing';
import { FormsModule } from '@angular/forms';
import { ActivatedRoute } from '@angular/router';
import { of } from 'rxjs';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { ProjectService, ProjectStageService } from '@modules/projects';
import { PeraPageHeaderComponent, PeraSelectComponent, PeraSkeletonComponent } from '@ds';
import { BriefStore } from '../../stores/brief.store';
import { CrmBriefPageComponent } from './crm-brief-page.component';

describe('CrmBriefPageComponent — stage selector (009b #9)', () => {
  const head = signal<{ id: string; projectStageId: string | null } | null>(null);
  let store: { head: typeof head; load: ReturnType<typeof vi.fn> };
  let stagesApi: { getByProject: ReturnType<typeof vi.fn> };

  beforeEach(() => {
    head.set(null);
    store = { head, load: vi.fn() };
    stagesApi = {
      getByProject: vi.fn().mockReturnValue(
        of([
          { id: 'S1', name: 'Gathering', order: 1 },
          { id: 'S2', name: 'Design', order: 2 },
        ]),
      ),
    };
    TestBed.configureTestingModule({
      imports: [CrmBriefPageComponent],
      providers: [
        {
          provide: ActivatedRoute,
          useValue: { snapshot: { paramMap: new Map([['projectId', 'P1']]) } },
        },
        {
          provide: ProjectService,
          useValue: { getById: vi.fn().mockReturnValue(of({ name: 'Villa' })) },
        },
        { provide: ProjectStageService, useValue: stagesApi },
      ],
    });
    // The head / ledger / attachments children are not under test here.
    TestBed.overrideComponent(CrmBriefPageComponent, {
      set: {
        imports: [FormsModule, PeraPageHeaderComponent, PeraSelectComponent, PeraSkeletonComponent],
        providers: [{ provide: BriefStore, useValue: store }],
        schemas: [NO_ERRORS_SCHEMA],
      },
    });
  });

  function create() {
    const fixture = TestBed.createComponent(CrmBriefPageComponent);
    fixture.detectChanges();
    return fixture.componentInstance;
  }

  it("lists the project's stages from Projects and starts on the N-11 project fallback", () => {
    const page = create();
    expect(stagesApi.getByProject).toHaveBeenCalledWith('P1');
    expect(page['stageOptions']()).toEqual([
      { value: 'S1', label: 'Gathering' },
      { value: 'S2', label: 'Design' },
    ]);
    expect(store.load).toHaveBeenCalledWith('P1');
  });

  it("selects the loaded brief's stage until another is picked", () => {
    const page = create();
    head.set({ id: 'B', projectStageId: 'S1' });
    expect(page['selectedStageId']()).toBe('S1');
  });

  it("picking a stage loads that stage's brief", () => {
    const page = create();
    head.set({ id: 'B', projectStageId: 'S1' });
    page['selectStage']('S2');
    expect(store.load).toHaveBeenLastCalledWith('P1', 'S2');
    expect(page['selectedStageId']()).toBe('S2');
  });
});
